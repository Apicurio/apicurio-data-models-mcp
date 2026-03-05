import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("medium-priority edit tools", () => {
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

    // ── document_remove_response ──────────────────────────────────

    describe("document_remove_response", () => {
        it("removes a 200 response from GET /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_response",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    statusCode: "200",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.statusCode).toBe("200");

            // Verify the response is gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                },
            });
            expect(node.isError).toBe(true);
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
                name: "document_remove_response",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                    statusCode: "200",
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
                name: "document_remove_response",
                arguments: {
                    session: "async",
                    path: "/test",
                    method: "get",
                    statusCode: "200",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_response_definition ──────────────────────────

    describe("document_add_response_definition", () => {
        it("adds a reusable response definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_response_definition",
                arguments: {
                    session: "petstore",
                    name: "ErrorResponse",
                    response: JSON.stringify({
                        description: "A standard error response",
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("ErrorResponse");
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
                name: "document_add_response_definition",
                arguments: {
                    session: "async",
                    name: "ErrorResponse",
                    response: JSON.stringify({ description: "Error" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_parameter ─────────────────────────────────

    describe("document_remove_parameter", () => {
        it("removes a query parameter from an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_parameter",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    name: "limit",
                    location: "query",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.parameter.name).toBe("limit");

            // Verify the parameter is gone
            const op = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "petstore", path: "/pets", method: "get" },
            });
            const opData = JSON.parse((op.content as any)[0].text);
            const params = opData.operation.parameters ?? [];
            expect(params.some((p: any) => p.name === "limit")).toBe(false);
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
                name: "document_remove_parameter",
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

    // ── document_remove_security_scheme ────────────────────────────

    describe("document_remove_security_scheme", () => {
        it("adds then removes a security scheme", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add first
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "apiKey",
                    scheme: JSON.stringify({ type: "apiKey", name: "X-API-Key", in: "header" }),
                },
            });

            // Remove
            const result = await client.callTool({
                name: "document_remove_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "apiKey",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.name).toBe("apiKey");
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
                name: "document_remove_security_scheme",
                arguments: {
                    session: "async",
                    name: "test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_tag ──────────────────────────────────────────

    describe("document_add_tag", () => {
        it("adds a tag to an OpenAPI document", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "users",
                    description: "User management operations",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("users");

            // Verify via list_tags
            const tags = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });
            const tagData = JSON.parse((tags.content as any)[0].text);
            expect(tagData.tags.some((t: any) => t.name === "users")).toBe(true);
        });

        it("adds a tag without description", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "admin",
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
                name: "document_add_tag",
                arguments: {
                    session: "async",
                    name: "test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_server ───────────────────────────────────────

    describe("document_add_server", () => {
        it("adds a server at document level", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://staging.example.com/v1",
                    description: "Staging server",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.url).toBe("https://staging.example.com/v1");

            // Verify via list_servers
            const servers = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });
            const serverData = JSON.parse((servers.content as any)[0].text);
            expect(serverData.servers.some((s: any) => s.url === "https://staging.example.com/v1")).toBe(
                true,
            );
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
                name: "document_add_server",
                arguments: {
                    session: "async",
                    url: "https://example.com",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_contact ──────────────────────────────────────

    describe("document_set_contact", () => {
        it("sets contact information", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_contact",
                arguments: {
                    session: "petstore",
                    name: "API Support",
                    email: "support@example.com",
                    url: "https://example.com/support",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);
            expect(data.contact.name).toBe("API Support");
            expect(data.contact.email).toBe("support@example.com");

            // Verify via document_get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info/contact",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.name).toBe("API Support");
            expect(nodeData.node.email).toBe("support@example.com");
        });

        it("sets partial contact information", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_contact",
                arguments: {
                    session: "petstore",
                    email: "admin@example.com",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);
        });
    });

    // ── document_set_license ──────────────────────────────────────

    describe("document_set_license", () => {
        it("sets license information", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_license",
                arguments: {
                    session: "petstore",
                    name: "Apache 2.0",
                    url: "https://www.apache.org/licenses/LICENSE-2.0",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);
            expect(data.license.name).toBe("Apache 2.0");

            // Verify via document_get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info/license",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.name).toBe("Apache 2.0");
        });

        it("sets license without URL", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_license",
                arguments: {
                    session: "petstore",
                    name: "MIT",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated).toBe(true);
        });
    });

    // ── document_remove_schema ────────────────────────────────────

    describe("document_remove_schema", () => {
        it("removes the Pet schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_schema",
                arguments: {
                    session: "petstore",
                    name: "Pet",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.name).toBe("Pet");

            // Verify via list_schemas
            const schemas = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "petstore" },
            });
            const schemaData = JSON.parse((schemas.content as any)[0].text);
            expect(schemaData.schemas).not.toContain("Pet");
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
                name: "document_remove_schema",
                arguments: {
                    session: "async",
                    name: "Test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_path ──────────────────────────────────────

    describe("document_remove_path", () => {
        it("removes the /pets/{petId} path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_path",
                arguments: {
                    session: "petstore",
                    path: "/pets/{petId}",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.path).toBe("/pets/{petId}");

            // Verify via list_paths
            const paths = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "petstore" },
            });
            const pathData = JSON.parse((paths.content as any)[0].text);
            expect(pathData.paths.some((p: any) => p.path === "/pets/{petId}")).toBe(false);
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
                name: "document_remove_path",
                arguments: {
                    session: "async",
                    path: "/test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_channel ──────────────────────────────────────

    describe("document_add_channel", () => {
        it("adds a channel to an AsyncAPI document", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_channel",
                arguments: {
                    session: "async",
                    channel: "user/signedup",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.channel).toBe("user/signedup");
        });

        it("rejects OpenAPI documents", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_channel",
                arguments: {
                    session: "petstore",
                    channel: "test/channel",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_response_header ──────────────────────────────

    describe("document_add_response_header", () => {
        it("adds a header to a response", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_response_header",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "X-Rate-Limit",
                    description: "Rate limit remaining",
                    schemaType: "integer",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.header).toBe("X-Rate-Limit");
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
                name: "document_add_response_header",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/get/responses[200]",
                    name: "X-Test",
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
                name: "document_add_response_header",
                arguments: {
                    session: "async",
                    nodePath: "/test",
                    name: "X-Test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });
});
