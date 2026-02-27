import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("validation tools", () => {
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

    describe("document_validate", () => {
        it("validates a valid document with no errors", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "valid",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_validate",
                arguments: { session: "valid" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.valid).toBe(true);
            expect(data.problemCount).toBe(0);
            expect(data.problems).toHaveLength(0);
        });

        it("detects validation problems in an invalid document", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "invalid",
                    filePath: path.join(FIXTURES, "invalid-openapi.json"),
                },
            });

            const result = await client.callTool({
                name: "document_validate",
                arguments: { session: "invalid" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.valid).toBe(false);
            expect(data.problemCount).toBeGreaterThan(0);
            expect(data.problems[0]).toHaveProperty("errorCode");
            expect(data.problems[0]).toHaveProperty("message");
            expect(data.problems[0]).toHaveProperty("severity");
        });

        it("validates a specific node path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "partial",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_validate",
                arguments: {
                    session: "partial",
                    nodePath: "/info",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data).toHaveProperty("valid");
            expect(data).toHaveProperty("problemCount");
        });

        it("returns error for invalid node path", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "test",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_validate",
                arguments: {
                    session: "test",
                    nodePath: "/nonexistent/path",
                },
            });

            expect(result.isError).toBe(true);
        });

        it("returns error for non-existent session", async () => {
            const result = await client.callTool({
                name: "document_validate",
                arguments: { session: "missing" },
            });
            expect(result.isError).toBe(true);
        });
    });
});
