import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("edit tools", () => {
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
    });

    afterEach(async () => {
        await client.close();
    });

    // ── Semantic edit tools (Phase 4) ──────────────────────────────

    describe("document_set_info", () => {
        it("sets title on a new document", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "test", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_set_info",
                arguments: {
                    session: "test",
                    title: "My API",
                    version: "2.0.0",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.info.title).toBe("My API");
            expect(data.info.version).toBe("2.0.0");
        });

        it("updates existing info fields", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_set_info",
                arguments: {
                    session: "petstore",
                    title: "Updated Petstore",
                    description: "New description",
                },
            });

            const info = await client.callTool({
                name: "document_get_info",
                arguments: { session: "petstore" },
            });
            const data = JSON.parse((info.content as any)[0].text);
            expect(data.title).toBe("Updated Petstore");
            expect(data.description).toBe("New description");
            expect(data.version).toBe("1.0.0"); // unchanged
        });
    });

    describe("document_add_path", () => {
        it("adds an empty path item", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_path",
                arguments: {
                    session: "petstore",
                    path: "/users",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);

            // Verify the path was added
            const paths = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });
            const pathData = JSON.parse((paths.content as any)[0].text);
            expect(pathData.paths.find((p: any) => p.path === "/users")).toBeDefined();
        });

        it("adds a path with operations", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "test", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_add_path",
                arguments: {
                    session: "test",
                    path: "/items",
                    pathItem: JSON.stringify({
                        get: {
                            operationId: "listItems",
                            summary: "List items",
                            responses: { "200": { description: "OK" } },
                        },
                    }),
                },
            });

            expect(JSON.parse((result.content as any)[0].text).added).toBe(true);

            const op = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "test", path: "/items", method: "get" },
            });
            const opData = JSON.parse((op.content as any)[0].text);
            expect(opData.operation.operationId).toBe("listItems");
        });

        it("rejects duplicate path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_path",
                arguments: { session: "petstore", path: "/pets" },
            });
            expect(result.isError).toBe(true);
        });

        it("rejects non-OpenAPI documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_path",
                arguments: { session: "async", path: "/test" },
            });
            expect(result.isError).toBe(true);
        });
    });

    describe("document_add_schema", () => {
        it("adds a schema to OpenAPI 3.0", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_schema",
                arguments: {
                    session: "petstore",
                    name: "Error",
                    schema: JSON.stringify({
                        type: "object",
                        properties: {
                            code: { type: "integer" },
                            message: { type: "string" },
                        },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);

            const schemas = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "petstore" },
            });
            const schemaData = JSON.parse((schemas.content as any)[0].text);
            expect(schemaData.schemas).toContain("Error");
        });

        it("adds a definition to OpenAPI 2.0", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "swagger",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_schema",
                arguments: {
                    session: "swagger",
                    name: "Error",
                    schema: JSON.stringify({
                        type: "object",
                        properties: {
                            code: { type: "integer" },
                        },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);

            const schemas = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "swagger" },
            });
            const schemaData = JSON.parse((schemas.content as any)[0].text);
            expect(schemaData.schemas).toContain("Error");
        });

        it("adds a schema to a new document with no components", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "fresh", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_add_schema",
                arguments: {
                    session: "fresh",
                    name: "Widget",
                    schema: JSON.stringify({ type: "object" }),
                },
            });

            expect(JSON.parse((result.content as any)[0].text).added).toBe(true);
        });
    });

    // ── Generic edit tools (Phase 5) ───────────────────────────────

    describe("document_set_node", () => {
        it("replaces the info node", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    value: JSON.stringify({
                        title: "Replaced API",
                        version: "9.9.9",
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);

            const info = await client.callTool({
                name: "document_get_info",
                arguments: { session: "petstore" },
            });
            const infoData = JSON.parse((info.content as any)[0].text);
            expect(infoData.title).toBe("Replaced API");
            expect(infoData.version).toBe("9.9.9");
        });

        it("sets a property within a schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Get the current node to verify it exists
            const before = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                },
            });
            expect(before.isError).toBeFalsy();

            // Replace the GET operation
            const result = await client.callTool({
                name: "document_set_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                    value: JSON.stringify({
                        operationId: "replacedOp",
                        summary: "Replaced operation",
                        responses: { "200": { description: "OK" } },
                    }),
                },
            });
            expect(JSON.parse((result.content as any)[0].text).updated).toBe(true);

            // Verify the replacement
            const op = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "petstore", path: "/pets", method: "get" },
            });
            const opData = JSON.parse((op.content as any)[0].text);
            expect(opData.operation.operationId).toBe("replacedOp");
        });
    });

    describe("document_remove_node", () => {
        it("removes a path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets/{petId}]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            const paths = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });
            const pathData = JSON.parse((paths.content as any)[0].text);
            expect(pathData.paths).toHaveLength(1);
            expect(pathData.paths[0].path).toBe("/pets");
        });

        it("removes a schema definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[NewPet]",
                },
            });

            expect(JSON.parse((result.content as any)[0].text).removed).toBe(true);

            const schemas = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "petstore" },
            });
            const schemaData = JSON.parse((schemas.content as any)[0].text);
            expect(schemaData.schemas).not.toContain("NewPet");
            expect(schemaData.schemas).toContain("Pet");
        });

        it("returns error for non-existent node", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]",
                },
            });
            expect(result.isError).toBe(true);
        });
    });
});
