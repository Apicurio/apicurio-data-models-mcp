import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("high-priority edit tools", () => {
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

    // ── document_add_operation ─────────────────────────────────────

    describe("document_add_operation", () => {
        it("adds a DELETE operation to /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.method).toBe("DELETE");

            // Verify via document_list_paths
            const paths = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });
            const pathData = JSON.parse((paths.content as any)[0].text);
            const petsPath = pathData.paths.find((p: any) => p.path === "/pets");
            expect(petsPath.methods).toContain("DELETE");
        });

        it("rejects duplicate operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            expect(result.isError).toBe(true);
        });

        it("rejects invalid HTTP method", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "FOOBAR",
                },
            });

            expect(result.isError).toBe(true);
        });

        it("rejects AsyncAPI documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_operation",
                arguments: {
                    session: "async",
                    path: "/test",
                    method: "get",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_operation ──────────────────────────────────

    describe("document_remove_operation", () => {
        it("removes GET from /pets/{petId}", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets/{petId}",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify the operation is gone
            const paths = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });
            const pathData = JSON.parse((paths.content as any)[0].text);
            const petIdPath = pathData.paths.find((p: any) => p.path === "/pets/{petId}");
            expect(petIdPath.methods).not.toContain("GET");
        });

        it("rejects non-existent operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_response ─────────────────────────────────────

    describe("document_add_response", () => {
        it("adds a 404 response to GET /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_response",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    statusCode: "404",
                    description: "Pet not found",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.statusCode).toBe("404");

            // Verify via document_get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[404]",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.description).toBe("Pet not found");
        });

        it("rejects when operation does not exist", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_response",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                    statusCode: "200",
                    description: "OK",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_parameter ────────────────────────────────────

    describe("document_add_parameter", () => {
        it("adds a query parameter to an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_parameter",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    name: "status",
                    location: "query",
                    description: "Filter by status",
                    type: "string",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.parameter.name).toBe("status");
            expect(data.parameter.location).toBe("query");

            // Verify via document_get_node
            const op = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "petstore", path: "/pets", method: "get" },
            });
            const opData = JSON.parse((op.content as any)[0].text);
            const params = opData.operation.parameters;
            expect(params.some((p: any) => p.name === "status")).toBe(true);
        });

        it("adds a path-level parameter (no method)", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_parameter",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    name: "X-Request-Id",
                    location: "header",
                    description: "Request correlation ID",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
        });

        it("auto-sets required=true for path parameters", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_parameter",
                arguments: {
                    session: "petstore",
                    path: "/pets/{petId}",
                    method: "get",
                    name: "version",
                    location: "path",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.parameter.required).toBe(true);
        });

        it("rejects AsyncAPI documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_parameter",
                arguments: {
                    session: "async",
                    path: "/test",
                    name: "foo",
                    location: "query",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_request_body ──────────────────────────────────

    describe("document_add_request_body", () => {
        it("adds a request body to an OAS 3.0 operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // GET /pets/{petId} doesn't have a request body
            const result = await client.callTool({
                name: "document_add_request_body",
                arguments: {
                    session: "petstore",
                    path: "/pets/{petId}",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.requestBodyAdded).toBe(true);
        });

        it("rejects OAS 2.0 documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "swagger",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_request_body",
                arguments: {
                    session: "swagger",
                    path: "/pets",
                    method: "get",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_media_type ───────────────────────────────────

    describe("document_add_media_type", () => {
        it("adds application/xml to an existing request body", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // POST /pets already has a requestBody with application/json
            const result = await client.callTool({
                name: "document_add_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/post/requestBody",
                    mediaType: "application/xml",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.mediaType).toBe("application/xml");
        });

        it("adds a media type to a response", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/post/responses[201]",
                    mediaType: "application/json",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
        });

        it("rejects invalid node path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/get/responses[200]",
                    mediaType: "application/json",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_media_type_schema ─────────────────────────────

    describe("document_set_media_type_schema", () => {
        it("sets a $ref schema on a media type", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_media_type_schema",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                    schemaRef: "#/components/schemas/NewPet",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);

            // Verify the schema was changed
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.schema.$ref).toBe("#/components/schemas/NewPet");
        });

        it("sets a type-based schema on a media type", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_media_type_schema",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                    schemaType: "object",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);
        });

        it("rejects when neither schemaRef nor schemaType provided", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_media_type_schema",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_security_scheme ──────────────────────────────

    describe("document_add_security_scheme", () => {
        it("adds an API key security scheme", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "apiKey",
                    scheme: JSON.stringify({
                        type: "apiKey",
                        name: "X-API-Key",
                        in: "header",
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("apiKey");

            // Verify via document_get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/securitySchemes[apiKey]",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.type).toBe("apiKey");
            expect(nodeData.node.name).toBe("X-API-Key");
        });

        it("adds a bearer auth security scheme", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "bearerAuth",
                    scheme: JSON.stringify({
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
        });

        it("rejects AsyncAPI documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "async",
                    name: "test",
                    scheme: JSON.stringify({ type: "apiKey" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });
});
