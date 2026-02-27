import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { sessionManager } from "../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");

function readResourceText(
    contents: { uri: string; mimeType?: string; text?: string; blob?: string }[],
): string {
    const item = contents[0];
    if ("text" in item && typeof item.text === "string") {
        return item.text;
    }
    throw new Error("Expected text content in resource response");
}

describe("integration: full MCP workflow", () => {
    let client: Client;

    beforeEach(async () => {
        for (const s of sessionManager.listSessions()) {
            sessionManager.removeSession(s.name);
        }
        const server = createServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        client = new Client({ name: "integration-test", version: "1.0.0" });
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await client.close();
    });

    it("complete workflow: create -> edit -> validate -> save -> close -> reload -> verify", async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-int-test-"));
        const outPath = path.join(tmpDir, "api.json");

        try {
            // Step 1: Create a new document
            const createResult = await client.callTool({
                name: "document_create",
                arguments: {
                    session: "myapi",
                    modelType: "openapi3",
                    title: "My Integration Test API",
                    version: "1.0.0",
                },
            });
            expect(createResult.isError).toBeFalsy();

            // Step 2: Set additional info
            await client.callTool({
                name: "document_set_info",
                arguments: {
                    session: "myapi",
                    description: "An API for integration testing",
                },
            });

            // Step 3: Add a path with operations
            await client.callTool({
                name: "document_add_path",
                arguments: {
                    session: "myapi",
                    path: "/widgets",
                    pathItem: JSON.stringify({
                        get: {
                            operationId: "listWidgets",
                            summary: "List all widgets",
                            responses: {
                                "200": {
                                    description: "A list of widgets",
                                    content: {
                                        "application/json": {
                                            schema: {
                                                type: "array",
                                                items: { $ref: "#/components/schemas/Widget" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        post: {
                            operationId: "createWidget",
                            summary: "Create a widget",
                            requestBody: {
                                required: true,
                                content: {
                                    "application/json": {
                                        schema: { $ref: "#/components/schemas/Widget" },
                                    },
                                },
                            },
                            responses: {
                                "201": { description: "Widget created" },
                            },
                        },
                    }),
                },
            });

            // Step 4: Add a schema
            await client.callTool({
                name: "document_add_schema",
                arguments: {
                    session: "myapi",
                    name: "Widget",
                    schema: JSON.stringify({
                        type: "object",
                        required: ["name"],
                        properties: {
                            id: { type: "integer", format: "int64" },
                            name: { type: "string" },
                            color: { type: "string" },
                        },
                    }),
                },
            });

            // Step 5: Query the document to verify
            const infoResult = await client.callTool({
                name: "document_get_info",
                arguments: { session: "myapi" },
            });
            const info = JSON.parse((infoResult.content as any)[0].text);
            expect(info.title).toBe("My Integration Test API");
            expect(info.description).toBe("An API for integration testing");
            expect(info.pathCount).toBe(1);
            expect(info.schemaCount).toBe(1);

            const pathsResult = await client.callTool({
                name: "document_list_paths",
                arguments: { session: "myapi" },
            });
            const paths = JSON.parse((pathsResult.content as any)[0].text);
            expect(paths.paths[0].path).toBe("/widgets");
            expect(paths.paths[0].methods).toContain("GET");
            expect(paths.paths[0].methods).toContain("POST");

            // Step 6: Validate
            const validateResult = await client.callTool({
                name: "document_validate",
                arguments: { session: "myapi" },
            });
            const validation = JSON.parse((validateResult.content as any)[0].text);
            expect(validation.valid).toBe(true);

            // Step 7: Save
            const saveResult = await client.callTool({
                name: "document_save",
                arguments: { session: "myapi", filePath: outPath },
            });
            expect(saveResult.isError).toBeFalsy();
            expect(fs.existsSync(outPath)).toBe(true);

            // Step 8: Close
            await client.callTool({
                name: "document_close",
                arguments: { session: "myapi" },
            });
            const listResult = await client.callTool({
                name: "document_list_sessions",
                arguments: {},
            });
            const list = JSON.parse((listResult.content as any)[0].text);
            expect(list.sessions).toHaveLength(0);

            // Step 9: Reload and verify
            const reloadResult = await client.callTool({
                name: "document_load",
                arguments: { session: "myapi-reloaded", filePath: outPath },
            });
            expect(reloadResult.isError).toBeFalsy();

            const reloadedInfo = await client.callTool({
                name: "document_get_info",
                arguments: { session: "myapi-reloaded" },
            });
            const reloaded = JSON.parse((reloadedInfo.content as any)[0].text);
            expect(reloaded.title).toBe("My Integration Test API");
            expect(reloaded.pathCount).toBe(1);
            expect(reloaded.schemaCount).toBe(1);

            const reloadedOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "myapi-reloaded",
                    path: "/widgets",
                    method: "get",
                },
            });
            const op = JSON.parse((reloadedOp.content as any)[0].text);
            expect(op.operation.operationId).toBe("listWidgets");
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it("load -> transform -> validate -> query transformed document", async () => {
        // Load a Swagger 2.0 document
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "swagger",
                filePath: path.join(FIXTURES, "petstore-2.0.json"),
            },
        });

        // Transform to OpenAPI 3.0
        const transformResult = await client.callTool({
            name: "document_transform",
            arguments: { session: "swagger", targetType: "openapi3" },
        });
        expect(transformResult.isError).toBeFalsy();

        // Verify it's now OpenAPI 3.x
        const info = await client.callTool({
            name: "document_get_info",
            arguments: { session: "swagger" },
        });
        const infoData = JSON.parse((info.content as any)[0].text);
        expect(infoData.modelType).toBe("openapi3");
        expect(infoData.title).toBe("Petstore");

        // Validate the transformed document
        const validate = await client.callTool({
            name: "document_validate",
            arguments: { session: "swagger" },
        });
        const valData = JSON.parse((validate.content as any)[0].text);
        // Transformed document should be reasonably valid
        expect(valData).toHaveProperty("valid");
        expect(valData).toHaveProperty("problemCount");
    });

    it("generic edit workflow: set_node + remove_node", async () => {
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "petstore",
                filePath: path.join(FIXTURES, "petstore-3.0.json"),
            },
        });

        // Replace the info node entirely
        await client.callTool({
            name: "document_set_node",
            arguments: {
                session: "petstore",
                nodePath: "/info",
                value: JSON.stringify({
                    title: "Modified Petstore",
                    version: "2.0.0",
                    description: "Modified via set_node",
                }),
            },
        });

        // Verify the change
        const info = await client.callTool({
            name: "document_get_info",
            arguments: { session: "petstore" },
        });
        const infoData = JSON.parse((info.content as any)[0].text);
        expect(infoData.title).toBe("Modified Petstore");
        expect(infoData.version).toBe("2.0.0");

        // Remove a path
        await client.callTool({
            name: "document_remove_node",
            arguments: {
                session: "petstore",
                nodePath: "/paths[/pets/{petId}]",
            },
        });

        const paths = await client.callTool({
            name: "document_list_paths",
            arguments: { session: "petstore" },
        });
        const pathData = JSON.parse((paths.content as any)[0].text);
        expect(pathData.paths).toHaveLength(1);
    });

    it("MCP resources: list and read", async () => {
        // Load a document
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "petstore",
                filePath: path.join(FIXTURES, "petstore-3.0.json"),
            },
        });

        // List resources - should find templates for each session
        const resourceList = await client.listResources();
        expect(resourceList.resources.length).toBeGreaterThanOrEqual(3);

        // Read the info resource
        const infoResource = await client.readResource({
            uri: "api://petstore/info",
        });
        const infoContent = JSON.parse(readResourceText(infoResource.contents));
        expect(infoContent.title).toBe("Petstore");

        // Read the paths resource
        const pathsResource = await client.readResource({
            uri: "api://petstore/paths",
        });
        const pathsContent = JSON.parse(readResourceText(pathsResource.contents));
        expect(pathsContent.paths).toHaveLength(2);

        // Read the schemas resource
        const schemasResource = await client.readResource({
            uri: "api://petstore/schemas",
        });
        const schemasContent = JSON.parse(readResourceText(schemasResource.contents));
        expect(schemasContent.schemas).toContain("Pet");
    });

    it("error scenarios", async () => {
        // Session not found
        const noSession = await client.callTool({
            name: "document_get_info",
            arguments: { session: "nonexistent" },
        });
        expect(noSession.isError).toBe(true);

        // File not found
        const noFile = await client.callTool({
            name: "document_load",
            arguments: { session: "test", filePath: "/no/such/file.json" },
        });
        expect(noFile.isError).toBe(true);

        // Duplicate session
        await client.callTool({
            name: "document_create",
            arguments: { session: "dup", modelType: "openapi3" },
        });
        const dupResult = await client.callTool({
            name: "document_create",
            arguments: { session: "dup", modelType: "openapi3" },
        });
        expect(dupResult.isError).toBe(true);

        // Invalid node path
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "petstore",
                filePath: path.join(FIXTURES, "petstore-3.0.json"),
            },
        });
        const badNode = await client.callTool({
            name: "document_get_node",
            arguments: { session: "petstore", nodePath: "/nonexistent" },
        });
        expect(badNode.isError).toBe(true);

        // Unsupported transform
        const badTransform = await client.callTool({
            name: "document_transform",
            arguments: { session: "petstore", targetType: "openapi2" },
        });
        expect(badTransform.isError).toBe(true);

        // Close non-existent
        const closeMissing = await client.callTool({
            name: "document_close",
            arguments: { session: "ghost" },
        });
        expect(closeMissing.isError).toBe(true);
    });

    it("multiple simultaneous sessions", async () => {
        // Load multiple documents
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "api1",
                filePath: path.join(FIXTURES, "petstore-3.0.json"),
            },
        });
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "api2",
                filePath: path.join(FIXTURES, "petstore-2.0.json"),
            },
        });
        await client.callTool({
            name: "document_load",
            arguments: {
                session: "api3",
                filePath: path.join(FIXTURES, "asyncapi-2.0.json"),
            },
        });

        // List sessions
        const list = await client.callTool({
            name: "document_list_sessions",
            arguments: {},
        });
        const sessions = JSON.parse((list.content as any)[0].text);
        expect(sessions.sessions).toHaveLength(3);

        // Query each independently
        const info1 = await client.callTool({
            name: "document_get_info",
            arguments: { session: "api1" },
        });
        expect(JSON.parse((info1.content as any)[0].text).modelType).toBe("openapi3");

        const info2 = await client.callTool({
            name: "document_get_info",
            arguments: { session: "api2" },
        });
        expect(JSON.parse((info2.content as any)[0].text).modelType).toBe("openapi2");

        const info3 = await client.callTool({
            name: "document_get_info",
            arguments: { session: "api3" },
        });
        expect(JSON.parse((info3.content as any)[0].text).modelType).toBe("asyncapi2");

        // Close one, others remain
        await client.callTool({
            name: "document_close",
            arguments: { session: "api2" },
        });

        const listAfter = await client.callTool({
            name: "document_list_sessions",
            arguments: {},
        });
        const afterSessions = JSON.parse((listAfter.content as any)[0].text);
        expect(afterSessions.sessions).toHaveLength(2);
    });

    it("YAML save and reload round-trip", async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-yaml-"));
        const outPath = path.join(tmpDir, "api.yaml");

        try {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Save as YAML
            await client.callTool({
                name: "document_save",
                arguments: {
                    session: "petstore",
                    filePath: outPath,
                    format: "yaml",
                },
            });

            const yamlContent = fs.readFileSync(outPath, "utf-8");
            expect(yamlContent).toContain("openapi:");
            expect(yamlContent).toContain("Petstore");

            // Reload the YAML
            await client.callTool({
                name: "document_close",
                arguments: { session: "petstore" },
            });
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore-yaml",
                    filePath: outPath,
                },
            });

            const info = await client.callTool({
                name: "document_get_info",
                arguments: { session: "petstore-yaml" },
            });
            const infoData = JSON.parse((info.content as any)[0].text);
            expect(infoData.title).toBe("Petstore");
            expect(infoData.pathCount).toBe(2);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
