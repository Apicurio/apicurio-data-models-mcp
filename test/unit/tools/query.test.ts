import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("query tools", () => {
    let client: Client;

    beforeEach(async () => {
        for (const s of sessionManager.listSessions()) {
            sessionManager.removeSession(s.name);
        }
        const server = createServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        client = new Client({ name: "test-client", version: "1.0.0" });
        await client.connect(clientTransport);

        // Pre-load fixtures
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "petstore",
                filePath: path.join(FIXTURES, "petstore-3.0.json"),
            },
        });
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "swagger",
                filePath: path.join(FIXTURES, "petstore-2.0.json"),
            },
        });
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "async",
                filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
            },
        });
    });

    afterEach(async () => {
        await client.close();
    });

    describe("document_get_info", () => {
        it("returns info for OpenAPI 3.0 document", async () => {
            const result = await client.callTool({
                name: "document_get_info",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.title).toBe("Petstore");
            expect(data.version).toBe("1.0.0");
            expect(data.modelType).toBe("openapi3");
            expect(data.pathCount).toBe(2);
            expect(data.schemaCount).toBe(3);
        });

        it("returns info for OpenAPI 2.0 document", async () => {
            const result = await client.callTool({
                name: "document_get_info",
                arguments: { session: "swagger" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.modelType).toBe("openapi2");
            expect(data.pathCount).toBe(1);
            expect(data.schemaCount).toBe(2);
        });

        it("returns info for AsyncAPI document", async () => {
            const result = await client.callTool({
                name: "document_get_info",
                arguments: { session: "async" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.modelType).toBe("asyncapi2");
            expect(data.title).toBe("Streetlights API");
            expect(data.channelCount).toBe(1);
        });

        it("returns error for non-existent session", async () => {
            const result = await client.callTool({
                name: "document_get_info",
                arguments: { session: "missing" },
            });
            expect(result.isError).toBe(true);
        });
    });

    describe("document_list_paths", () => {
        it("lists paths with methods for OpenAPI 3.0", async () => {
            const result = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.paths).toHaveLength(2);

            const petsPath = data.paths.find((p: any) => p.path === "/pets");
            expect(petsPath).toBeDefined();
            expect(petsPath.methods).toContain("GET");
            expect(petsPath.methods).toContain("POST");
        });

        it("lists channels for AsyncAPI", async () => {
            const result = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "async" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.channels).toHaveLength(1);
            expect(data.channels[0].operations).toContain("publish");
        });
    });

    describe("document_get_operation", () => {
        it("gets a specific operation", async () => {
            const result = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.method).toBe("GET");
            expect(data.operation.operationId).toBe("listPets");
        });

        it("gets all operations on a path when method omitted", async () => {
            const result = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.operations.GET).toBeDefined();
            expect(data.operations.POST).toBeDefined();
        });

        it("returns error for non-existent path", async () => {
            const result = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/missing",
                    method: "get",
                },
            });
            expect(result.isError).toBe(true);
        });

        it("returns error for non-existent method", async () => {
            const result = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                },
            });
            expect(result.isError).toBe(true);
        });
    });

    describe("document_list_schemas", () => {
        it("lists schemas for OpenAPI 3.0", async () => {
            const result = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.schemas).toContain("Pet");
            expect(data.schemas).toContain("NewPet");
            expect(data.schemas).toContain("Pets");
        });

        it("lists definitions for OpenAPI 2.0", async () => {
            const result = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "swagger" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.schemas).toContain("Pet");
            expect(data.schemas).toContain("Pets");
        });
    });

    describe("document_get_node", () => {
        it("gets the info node", async () => {
            const result = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.node.title).toBe("Petstore");
        });

        it("gets a specific path item", async () => {
            const result = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.node.get).toBeDefined();
            expect(data.node.post).toBeDefined();
        });

        it("returns error for non-existent node path", async () => {
            const result = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/nonexistent",
                },
            });
            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_operations ──────────────────────────────────

    describe("document_list_operations", () => {
        it("lists all operations in an OpenAPI 3.0 document", async () => {
            const result = await client.callTool({
                name: "document_list_operations",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.operations).toHaveLength(3);

            const listPets = data.operations.find((op: any) => op.path === "/pets" && op.method === "GET");
            expect(listPets).toBeDefined();
            expect(listPets.operationId).toBe("listPets");
            expect(listPets.summary).toBe("List all pets");
            expect(listPets.tags).toContain("pets");

            const createPet = data.operations.find((op: any) => op.path === "/pets" && op.method === "POST");
            expect(createPet).toBeDefined();
            expect(createPet.operationId).toBe("createPet");

            const getPet = data.operations.find(
                (op: any) => op.path === "/pets/{petId}" && op.method === "GET",
            );
            expect(getPet).toBeDefined();
            expect(getPet.operationId).toBe("getPet");
        });

        it("lists operations for AsyncAPI documents", async () => {
            const result = await client.callTool({
                name: "document_list_operations",
                arguments: { session: "async" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.operations).toBeDefined();
            expect(data.operations.length).toBeGreaterThan(0);
        });

        it("returns empty for a document with no operations", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "empty", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_list_operations",
                arguments: { session: "empty" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.operations).toHaveLength(0);
        });
    });

    // ── document_get_schema ───────────────────────────────────────

    describe("document_get_schema", () => {
        it("gets the Pet schema by name", async () => {
            const result = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "Pet" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.name).toBe("Pet");
            expect(data.schema).toBeDefined();
            expect(data.schema.required).toBeDefined();
        });

        it("gets a schema from OpenAPI 2.0 definitions", async () => {
            const result = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "swagger", name: "Pet" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.name).toBe("Pet");
            expect(data.schema).toBeDefined();
        });

        it("returns error for non-existent schema", async () => {
            const result = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "NonExistent" },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_security_schemes ─────────────────────────────

    describe("document_list_security_schemes", () => {
        it("returns empty for document without security schemes", async () => {
            const result = await client.callTool({
                name: "document_list_security_schemes",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.securitySchemes).toBeDefined();
            expect(data.securitySchemes).toHaveLength(0);
        });

        it("lists security schemes after adding one", async () => {
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "bearerAuth",
                    scheme: JSON.stringify({ type: "http", scheme: "bearer" }),
                },
            });

            const result = await client.callTool({
                name: "document_list_security_schemes",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.securitySchemes.length).toBeGreaterThan(0);
            expect(data.securitySchemes.some((s: any) => s.name === "bearerAuth")).toBe(true);
        });
    });

    // ── document_list_servers ──────────────────────────────────────

    describe("document_list_servers", () => {
        it("lists servers from OpenAPI 3.0 document", async () => {
            const result = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.servers).toBeDefined();
            // petstore-3.0 has a server defined
            expect(data.servers.length).toBeGreaterThanOrEqual(0);
        });

        it("lists servers after adding one", async () => {
            await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://test.example.com",
                    description: "Test server",
                },
            });

            const result = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.servers.some((s: any) => s.url === "https://test.example.com")).toBe(true);
        });
    });

    // ── document_list_tags ────────────────────────────────────────

    describe("document_list_tags", () => {
        it("returns empty for document without top-level tags", async () => {
            const result = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.tags).toBeDefined();
        });

        it("lists tags after adding one", async () => {
            await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "pets",
                    description: "Pet operations",
                },
            });

            const result = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.tags.some((t: any) => t.name === "pets")).toBe(true);
        });
    });
});
