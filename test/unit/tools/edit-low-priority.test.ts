import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("low-priority edit tools", () => {
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

    // ── document_remove_request_body ─────────────────────────────

    describe("document_remove_request_body", () => {
        it("adds then removes a request body from an OAS 3.0 operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a path and operation with request body
            await client.callTool({
                name: "document_add_path",
                arguments: { session: "petstore", path: "/items" },
            });
            await client.callTool({
                name: "document_add_operation",
                arguments: { session: "petstore", path: "/items", method: "post" },
            });
            await client.callTool({
                name: "document_add_request_body",
                arguments: { session: "petstore", path: "/items", method: "post" },
            });

            // Verify request body exists
            const nodeBefore = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/items]/post/requestBody",
                },
            });
            expect(nodeBefore.isError).toBeFalsy();

            // Remove it
            const result = await client.callTool({
                name: "document_remove_request_body",
                arguments: { session: "petstore", path: "/items", method: "post" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.requestBodyRemoved).toBe(true);
            expect(data.method).toBe("POST");

            // Verify it's gone
            const nodeAfter = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/items]/post/requestBody",
                },
            });
            expect(nodeAfter.isError).toBe(true);
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
                name: "document_remove_request_body",
                arguments: { session: "swagger", path: "/pets", method: "post" },
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
                name: "document_remove_request_body",
                arguments: { session: "async", path: "/test", method: "post" },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_update_security_scheme ──────────────────────────

    describe("document_update_security_scheme", () => {
        it("adds then updates a security scheme", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a security scheme
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "bearerAuth",
                    scheme: JSON.stringify({ type: "http", scheme: "bearer" }),
                },
            });

            // Update it
            const result = await client.callTool({
                name: "document_update_security_scheme",
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
            expect(data.updated).toBe(true);
            expect(data.name).toBe("bearerAuth");
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
                name: "document_update_security_scheme",
                arguments: {
                    session: "async",
                    name: "test",
                    scheme: JSON.stringify({ type: "http" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_tag ─────────────────────────────────────

    describe("document_remove_tag", () => {
        it("adds then removes a tag", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a tag
            await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "users",
                    description: "User operations",
                },
            });

            // Verify tag exists
            const tagsBefore = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });
            const beforeData = JSON.parse((tagsBefore.content as any)[0].text);
            expect(beforeData.tags.some((t: any) => t.name === "users")).toBe(true);

            // Remove the tag
            const result = await client.callTool({
                name: "document_remove_tag",
                arguments: { session: "petstore", name: "users" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.name).toBe("users");

            // Verify tag is gone
            const tagsAfter = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });
            const afterData = JSON.parse((tagsAfter.content as any)[0].text);
            expect(afterData.tags.some((t: any) => t.name === "users")).toBe(false);
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
                name: "document_remove_tag",
                arguments: { session: "async", name: "test" },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_rename_tag ─────────────────────────────────────

    describe("document_rename_tag", () => {
        it("adds then renames a tag", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a tag
            await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "animals",
                    description: "Animal operations",
                },
            });

            // Rename it
            const result = await client.callTool({
                name: "document_rename_tag",
                arguments: {
                    session: "petstore",
                    oldName: "animals",
                    newName: "creatures",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.renamed).toBe(true);
            expect(data.oldName).toBe("animals");
            expect(data.newName).toBe("creatures");

            // Verify new name via list_tags
            const tags = await client.callTool({
                name: "document_list_tags",
                arguments: { session: "petstore" },
            });
            const tagData = JSON.parse((tags.content as any)[0].text);
            expect(tagData.tags.some((t: any) => t.name === "creatures")).toBe(true);
            expect(tagData.tags.some((t: any) => t.name === "animals")).toBe(false);
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
                name: "document_rename_tag",
                arguments: {
                    session: "async",
                    oldName: "test",
                    newName: "renamed",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_server ──────────────────────────────────

    describe("document_remove_server", () => {
        it("adds then removes a server at document level", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a server
            await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://staging.example.com/v1",
                    description: "Staging server",
                },
            });

            // Verify it exists
            const serversBefore = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });
            const beforeData = JSON.parse((serversBefore.content as any)[0].text);
            expect(beforeData.servers.some((s: any) => s.url === "https://staging.example.com/v1")).toBe(
                true,
            );

            // Remove it
            const result = await client.callTool({
                name: "document_remove_server",
                arguments: {
                    session: "petstore",
                    url: "https://staging.example.com/v1",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.url).toBe("https://staging.example.com/v1");

            // Verify it's gone
            const serversAfter = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });
            const afterData = JSON.parse((serversAfter.content as any)[0].text);
            expect(afterData.servers.some((s: any) => s.url === "https://staging.example.com/v1")).toBe(
                false,
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
                name: "document_remove_server",
                arguments: {
                    session: "async",
                    url: "https://example.com",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_extension ──────────────────────────────────

    describe("document_add_extension", () => {
        it("adds an extension to /info", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-custom-info",
                    value: JSON.stringify({ key: "value" }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("x-custom-info");

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node["x-custom-info"]).toEqual({ key: "value" });
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
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "custom-info",
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
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/nonexistent/path",
                    name: "x-test",
                    value: JSON.stringify("value"),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_extension ───────────────────────────────

    describe("document_remove_extension", () => {
        it("adds then removes an extension", async () => {
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
                    name: "x-to-remove",
                    value: JSON.stringify("temporary"),
                },
            });

            // Remove it
            const result = await client.callTool({
                name: "document_remove_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-to-remove",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.name).toBe("x-to-remove");

            // Verify it's gone
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node["x-to-remove"]).toBeUndefined();
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
                name: "document_remove_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "badName",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_response_header ─────────────────────────

    describe("document_remove_response_header", () => {
        it("adds then removes a header from a response", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a header first
            await client.callTool({
                name: "document_add_response_header",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "X-Rate-Limit",
                    description: "Rate limit remaining",
                    schemaType: "integer",
                },
            });

            // Remove the header
            const result = await client.callTool({
                name: "document_remove_response_header",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "X-Rate-Limit",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
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
                name: "document_remove_response_header",
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
                name: "document_remove_response_header",
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
