import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("proposed medium-priority edit tools", () => {
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

    // ── document_remove_all_security_requirements ────────────────

    describe("document_remove_all_security_requirements", () => {
        it("removes all document-level security requirements", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a security scheme and requirement first
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "bearerAuth",
                    scheme: JSON.stringify({ type: "http", scheme: "bearer" }),
                },
            });
            await client.callTool({
                name: "document_add_security_requirement",
                arguments: {
                    session: "petstore",
                    requirement: JSON.stringify({ bearerAuth: [] }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_security_requirements",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.scope).toBe("document");
        });

        it("removes all operation-level security requirements", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add scheme and requirement to an operation
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "apiKey",
                    scheme: JSON.stringify({ type: "apiKey", name: "X-API-Key", in: "header" }),
                },
            });
            await client.callTool({
                name: "document_add_security_requirement",
                arguments: {
                    session: "petstore",
                    requirement: JSON.stringify({ apiKey: [] }),
                    path: "/pets",
                    method: "get",
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_security_requirements",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.scope).toBe("GET /pets");
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
                name: "document_remove_all_security_requirements",
                arguments: { session: "async" },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_media_type ───────────────────────────────

    describe("document_remove_media_type", () => {
        it("removes a media type from a request body", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a request body with a media type first
            await client.callTool({
                name: "document_add_request_body",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "post",
                },
            });
            await client.callTool({
                name: "document_add_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/post/requestBody",
                    mediaType: "application/json",
                },
            });

            const result = await client.callTool({
                name: "document_remove_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/post/requestBody/content[application/json]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
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
                name: "document_remove_media_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/post/requestBody/content[application/json]",
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
                name: "document_remove_media_type",
                arguments: {
                    session: "async",
                    nodePath: "/test/content[application/json]",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_parameter_definition ────────────────────────

    describe("document_add_parameter_definition", () => {
        it("adds a reusable parameter definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_parameter_definition",
                arguments: {
                    session: "petstore",
                    name: "pageSize",
                    parameter: JSON.stringify({
                        name: "pageSize",
                        in: "query",
                        description: "Number of items per page",
                        schema: { type: "integer" },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("pageSize");

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/parameters[pageSize]",
                },
            });
            expect(node.isError).toBeFalsy();
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.name).toBe("pageSize");
            expect(nodeData.node.in).toBe("query");
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
                name: "document_add_parameter_definition",
                arguments: {
                    session: "async",
                    name: "test",
                    parameter: JSON.stringify({ name: "test", in: "query" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_parameter_definition ─────────────────────

    describe("document_remove_parameter_definition", () => {
        it("adds then removes a parameter definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add first
            await client.callTool({
                name: "document_add_parameter_definition",
                arguments: {
                    session: "petstore",
                    name: "pageOffset",
                    parameter: JSON.stringify({
                        name: "pageOffset",
                        in: "query",
                        schema: { type: "integer" },
                    }),
                },
            });

            // Remove
            const result = await client.callTool({
                name: "document_remove_parameter_definition",
                arguments: {
                    session: "petstore",
                    name: "pageOffset",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify it's gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/parameters[pageOffset]",
                },
            });
            expect(node.isError).toBe(true);
        });
    });

    // ── document_add_header_definition ───────────────────────────

    describe("document_add_header_definition", () => {
        it("adds a reusable header definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_header_definition",
                arguments: {
                    session: "petstore",
                    name: "X-Rate-Limit",
                    header: JSON.stringify({
                        description: "Rate limit remaining",
                        schema: { type: "integer" },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("X-Rate-Limit");

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/headers[X-Rate-Limit]",
                },
            });
            expect(node.isError).toBeFalsy();
        });

        it("rejects OAS 2.0 documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore2",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_header_definition",
                arguments: {
                    session: "petstore2",
                    name: "X-Rate-Limit",
                    header: JSON.stringify({ description: "Rate limit", schema: { type: "integer" } }),
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
                name: "document_add_header_definition",
                arguments: {
                    session: "async",
                    name: "X-Test",
                    header: JSON.stringify({ description: "Test" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_header_definition ────────────────────────

    describe("document_remove_header_definition", () => {
        it("adds then removes a header definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_add_header_definition",
                arguments: {
                    session: "petstore",
                    name: "X-Request-Id",
                    header: JSON.stringify({
                        description: "Request ID",
                        schema: { type: "string" },
                    }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_header_definition",
                arguments: {
                    session: "petstore",
                    name: "X-Request-Id",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    // ── document_add_example_definition ──────────────────────────

    describe("document_add_example_definition", () => {
        it("adds a reusable example definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_example_definition",
                arguments: {
                    session: "petstore",
                    name: "PetExample",
                    example: JSON.stringify({
                        summary: "A sample pet",
                        value: { id: 1, name: "Fido", tag: "dog" },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("PetExample");

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/examples[PetExample]",
                },
            });
            expect(node.isError).toBeFalsy();
        });

        it("rejects OAS 2.0 documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore2",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_example_definition",
                arguments: {
                    session: "petstore2",
                    name: "Test",
                    example: JSON.stringify({ value: "test" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_example_definition ───────────────────────

    describe("document_remove_example_definition", () => {
        it("adds then removes an example definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_add_example_definition",
                arguments: {
                    session: "petstore",
                    name: "ErrorExample",
                    example: JSON.stringify({
                        summary: "An error",
                        value: { code: 404, message: "Not found" },
                    }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_example_definition",
                arguments: {
                    session: "petstore",
                    name: "ErrorExample",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    // ── document_add_request_body_definition ─────────────────────

    describe("document_add_request_body_definition", () => {
        it("adds a reusable request body definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_request_body_definition",
                arguments: {
                    session: "petstore",
                    name: "PetBody",
                    requestBody: JSON.stringify({
                        description: "A pet request body",
                        required: true,
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("PetBody");

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/requestBodies[PetBody]",
                },
            });
            expect(node.isError).toBeFalsy();
        });

        it("rejects OAS 2.0 documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore2",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_request_body_definition",
                arguments: {
                    session: "petstore2",
                    name: "Test",
                    requestBody: JSON.stringify({ description: "test" }),
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
                name: "document_add_request_body_definition",
                arguments: {
                    session: "async",
                    name: "Test",
                    requestBody: JSON.stringify({ description: "test" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_request_body_definition ──────────────────

    describe("document_remove_request_body_definition", () => {
        it("adds then removes a request body definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_add_request_body_definition",
                arguments: {
                    session: "petstore",
                    name: "UpdateBody",
                    requestBody: JSON.stringify({
                        description: "Update request body",
                    }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_request_body_definition",
                arguments: {
                    session: "petstore",
                    name: "UpdateBody",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify it's gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/requestBodies[UpdateBody]",
                },
            });
            expect(node.isError).toBe(true);
        });
    });

    // ── document_delete_contact ──────────────────────────────────

    describe("document_delete_contact", () => {
        it("removes contact from document info", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Set contact first
            await client.callTool({
                name: "document_set_contact",
                arguments: {
                    session: "petstore",
                    name: "API Support",
                    email: "support@example.com",
                },
            });

            // Delete contact
            const result = await client.callTool({
                name: "document_delete_contact",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.contactRemoved).toBe(true);

            // Verify contact is gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info/contact",
                },
            });
            expect(node.isError).toBe(true);
        });
    });

    // ── document_delete_license ──────────────────────────────────

    describe("document_delete_license", () => {
        it("removes license from document info", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Set license first
            await client.callTool({
                name: "document_set_license",
                arguments: {
                    session: "petstore",
                    name: "MIT",
                    url: "https://opensource.org/licenses/MIT",
                },
            });

            // Delete license
            const result = await client.callTool({
                name: "document_delete_license",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.licenseRemoved).toBe(true);

            // Verify license is gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info/license",
                },
            });
            expect(node.isError).toBe(true);
        });
    });

    // ── document_update_extension ────────────────────────────────

    describe("document_update_extension", () => {
        it("updates an existing extension value", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add extension first
            await client.callTool({
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-api-version",
                    value: JSON.stringify("v1"),
                },
            });

            // Update extension
            const result = await client.callTool({
                name: "document_update_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-api-version",
                    value: JSON.stringify("v2"),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node["x-api-version"]).toBe("v2");
        });

        it("rejects extension names without x- prefix", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_update_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "invalid",
                    value: JSON.stringify("test"),
                },
            });

            expect(result.isError).toBe(true);
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
                name: "document_update_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/nonexistent",
                    name: "x-test",
                    value: JSON.stringify("test"),
                },
            });

            expect(result.isError).toBe(true);
        });
    });
});
