import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("proposed medium-priority query tools", () => {
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

    // ── document_list_parameters ─────────────────────────────────

    describe("document_list_parameters", () => {
        it("lists parameters on an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_parameters",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.parameters).toBeDefined();
            expect(Array.isArray(data.parameters)).toBe(true);
            expect(data.parameters.length).toBeGreaterThan(0);
            expect(data.parameters.some((p: any) => p.name === "limit")).toBe(true);
        });

        it("lists path-item-level parameters", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a path-level parameter
            await client.callTool({
                name: "document_add_parameter",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    name: "X-Request-Id",
                    location: "header",
                    schema: JSON.stringify({ type: "string" }),
                },
            });

            const result = await client.callTool({
                name: "document_list_parameters",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.parameters).toBeDefined();
        });

        it("rejects non-existent path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_parameters",
                arguments: {
                    session: "petstore",
                    path: "/nonexistent",
                    method: "get",
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
                name: "document_list_parameters",
                arguments: {
                    session: "async",
                    path: "/test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_responses ──────────────────────────────────

    describe("document_list_responses", () => {
        it("lists responses on GET /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_responses",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.responses).toBeDefined();
            expect(Array.isArray(data.responses)).toBe(true);
            expect(data.responses.length).toBeGreaterThan(0);
            expect(data.responses.some((r: any) => r.statusCode === "200")).toBe(true);
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
                name: "document_list_responses",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
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
                name: "document_list_responses",
                arguments: {
                    session: "async",
                    path: "/test",
                    method: "get",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_media_types ────────────────────────────────

    describe("document_list_media_types", () => {
        it("lists media types on a response", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_media_types",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.mediaTypes).toBeDefined();
            expect(Array.isArray(data.mediaTypes)).toBe(true);
            expect(data.mediaTypes).toContain("application/json");
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
                name: "document_list_media_types",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/get/responses[200]",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_extensions ─────────────────────────────────

    describe("document_list_extensions", () => {
        it("lists extensions on a node", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add an extension first
            await client.callTool({
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-custom-field",
                    value: JSON.stringify("custom-value"),
                },
            });

            const result = await client.callTool({
                name: "document_list_extensions",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.extensions).toBeDefined();
            expect(data.extensions["x-custom-field"]).toBe("custom-value");
        });

        it("returns empty extensions when none exist", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_extensions",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.extensions).toBeDefined();
            expect(typeof data.extensions).toBe("object");
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
                name: "document_list_extensions",
                arguments: {
                    session: "petstore",
                    nodePath: "/nonexistent/node",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_list_examples ───────────────────────────────────

    describe("document_list_examples", () => {
        it("lists examples on a media type", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add an example to a media type
            await client.callTool({
                name: "document_add_example",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                    name: "PetList",
                    value: JSON.stringify([{ id: 1, name: "Fido" }]),
                    summary: "A list of pets",
                },
            });

            const result = await client.callTool({
                name: "document_list_examples",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.examples).toBeDefined();
            expect(data.examples.PetList).toBeDefined();
        });

        it("returns empty examples when none exist", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_list_examples",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.examples).toBeDefined();
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
                name: "document_list_examples",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/get/responses[200]/content[application/json]",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_find_refs ───────────────────────────────────────

    describe("document_find_refs", () => {
        it("finds $ref references to a schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_find_refs",
                arguments: {
                    session: "petstore",
                    ref: "#/components/schemas/Pet",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.count).toBeGreaterThan(0);
            expect(data.references).toBeDefined();
            expect(Array.isArray(data.references)).toBe(true);
            expect(data.references[0].ref).toBe("#/components/schemas/Pet");
        });

        it("returns zero references for unused ref", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_find_refs",
                arguments: {
                    session: "petstore",
                    ref: "#/components/schemas/NonExistent",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.count).toBe(0);
            expect(data.references).toEqual([]);
        });

        it("finds $ref references to Pets schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_find_refs",
                arguments: {
                    session: "petstore",
                    ref: "#/components/schemas/Pets",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.count).toBeGreaterThan(0);
        });
    });
});
