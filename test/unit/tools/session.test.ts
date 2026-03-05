import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("session tools", () => {
    let client: Client;

    beforeEach(async () => {
        // Clear all sessions
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

    describe("document_load", () => {
        it("loads a JSON file", async () => {
            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.session).toBe("petstore");
            expect(data.modelType).toBe("openapi3");
            expect(data.format).toBe("json");
            expect(result.isError).toBeFalsy();
        });

        it("loads a YAML file", async () => {
            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore-yaml",
                    filePath: path.join(FIXTURES, "petstore-3.0.yaml"),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.format).toBe("yaml");
            expect(data.modelType).toBe("openapi3");
        });

        it("loads a Swagger 2.0 file", async () => {
            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "swagger",
                    filePath: path.join(FIXTURES, "petstore-2.0.json"),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.modelType).toBe("openapi2");
        });

        it("loads an AsyncAPI file", async () => {
            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "async",
                    filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.modelType).toBe("asyncapi2");
        });

        it("returns error for non-existent file", async () => {
            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "missing",
                    filePath: "/non/existent/file.json",
                },
            });

            expect(result.isError).toBe(true);
            const data = JSON.parse((result.content as any)[0].text);
            expect(data.error).toContain("File not found");
        });

        it("returns error for duplicate session name", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "dup",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_load",
                arguments: {
                    session: "dup",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            expect(result.isError).toBe(true);
            const data = JSON.parse((result.content as any)[0].text);
            expect(data.error).toContain("already exists");
        });
    });

    describe("document_create", () => {
        it("creates a new OpenAPI 3.0 document", async () => {
            const result = await client.callTool({
                name: "document_create",
                arguments: {
                    session: "new-api",
                    modelType: "openapi3",
                    title: "My API",
                    version: "1.0.0",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.session).toBe("new-api");
            expect(data.modelType).toBe("openapi3");
        });

        it("creates a document without title/version", async () => {
            const result = await client.callTool({
                name: "document_create",
                arguments: {
                    session: "blank",
                    modelType: "openapi2",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.modelType).toBe("openapi2");
        });
    });

    describe("document_save", () => {
        it("saves a document to a file", async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
            const outPath = path.join(tmpDir, "output.json");

            try {
                await client.callTool({
                    name: "document_load",
                    arguments: {
                        session: "save-test",
                        filePath: path.join(FIXTURES, "petstore-3.0.json"),
                    },
                });

                const result = await client.callTool({
                    name: "document_save",
                    arguments: {
                        session: "save-test",
                        filePath: outPath,
                    },
                });

                const data = JSON.parse((result.content as any)[0].text);
                expect(data.filePath).toBe(outPath);
                expect(fs.existsSync(outPath)).toBe(true);

                const savedContent = JSON.parse(fs.readFileSync(outPath, "utf-8"));
                expect(savedContent.openapi).toBe("3.0.2");
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it("saves to YAML format", async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
            const outPath = path.join(tmpDir, "output.yaml");

            try {
                await client.callTool({
                    name: "document_load",
                    arguments: {
                        session: "yaml-save",
                        filePath: path.join(FIXTURES, "petstore-3.0.json"),
                    },
                });

                const _result = await client.callTool({
                    name: "document_save",
                    arguments: {
                        session: "yaml-save",
                        filePath: outPath,
                        format: "yaml",
                    },
                });

                const content = fs.readFileSync(outPath, "utf-8");
                expect(content).toContain("openapi:");
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it("returns error when no path available", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "no-path", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_save",
                arguments: { session: "no-path" },
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("document_close", () => {
        it("closes an existing session", async () => {
            await client.callTool({
                name: "document_create",
                arguments: { session: "to-close", modelType: "openapi3" },
            });

            const result = await client.callTool({
                name: "document_close",
                arguments: { session: "to-close" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.closed).toBe(true);
        });

        it("returns error for non-existent session", async () => {
            const result = await client.callTool({
                name: "document_close",
                arguments: { session: "ghost" },
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("document_list_sessions", () => {
        it("returns empty list initially", async () => {
            const result = await client.callTool({
                name: "document_list_sessions",
                arguments: {},
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.sessions).toHaveLength(0);
        });

        it("lists loaded sessions", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "api1",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });
            await client.callTool({
                name: "document_create",
                arguments: { session: "api2", modelType: "openapi2" },
            });

            const result = await client.callTool({
                name: "document_list_sessions",
                arguments: {},
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.sessions).toHaveLength(2);
            expect(data.sessions.map((s: any) => s.name).sort()).toEqual(["api1", "api2"]);
        });
    });

    describe("document_export", () => {
        it("exports document as JSON", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_export",
                arguments: {
                    session: "petstore",
                    format: "json",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.format).toBe("json");
            expect(data.content).toBeDefined();

            // The content should be valid JSON
            const parsed = JSON.parse(data.content);
            expect(parsed.openapi).toBe("3.0.2");
            expect(parsed.info.title).toBe("Petstore");
        });

        it("exports document as YAML", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_export",
                arguments: {
                    session: "petstore",
                    format: "yaml",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.format).toBe("yaml");
            expect(data.content).toContain("openapi:");
            expect(data.content).toContain("Petstore");
        });

        it("defaults to session format when format not specified", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_export",
                arguments: {
                    session: "petstore",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.format).toBe("json");
        });

        it("returns error for non-existent session", async () => {
            const result = await client.callTool({
                name: "document_export",
                arguments: {
                    session: "missing",
                },
            });

            expect(result.isError).toBe(true);
        });
    });
});
