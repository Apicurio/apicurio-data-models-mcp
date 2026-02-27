import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("transform tools", () => {
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

    describe("document_transform", () => {
        it("transforms OpenAPI 2.0 to 3.0", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "swagger",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_transform",
                arguments: {
                    session: "swagger",
                    targetType: "openapi3",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.transformed).toBe(true);
            expect(data.sourceType).toBe("openapi2");
            expect(data.targetType).toBe("openapi3");

            // Verify the document is now OpenAPI 3.x
            const info = await client.callTool({
                name: "document_get_info",
                arguments: { session: "swagger" },
            });
            const infoData = JSON.parse((info.content as any)[0].text);
            expect(infoData.modelType).toBe("openapi3");
            expect(infoData.title).toBe("Petstore");
        });

        it("rejects unsupported transformation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_transform",
                arguments: {
                    session: "petstore",
                    targetType: "openapi2",
                },
            });

            expect(result.isError).toBe(true);
            const data = JSON.parse((result.content as any)[0].text);
            expect(data.error).toContain("not supported");
        });

        it("rejects non-existent session", async () => {
            const result = await client.callTool({
                name: "document_transform",
                arguments: {
                    session: "missing",
                    targetType: "openapi3",
                },
            });
            expect(result.isError).toBe(true);
        });
    });

    describe("document_dereference", () => {
        it("dereferences a document", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_dereference",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.dereferenced).toBe(true);

            // Document should still be valid and queryable
            const info = await client.callTool({
                name: "document_get_info",
                arguments: { session: "petstore" },
            });
            const infoData = JSON.parse((info.content as any)[0].text);
            expect(infoData.title).toBe("Petstore");
        });

        it("returns error for non-existent session", async () => {
            const result = await client.callTool({
                name: "document_dereference",
                arguments: { session: "missing" },
            });
            expect(result.isError).toBe(true);
        });
    });
});
