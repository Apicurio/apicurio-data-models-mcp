import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("proposed low-priority edit tools", () => {
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

    // ── document_remove_all_examples ─────────────────────────────

    describe("document_remove_all_examples", () => {
        it("removes all examples from a media type", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add examples first
            await client.callTool({
                name: "document_add_example",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                    name: "Example1",
                    value: JSON.stringify([{ id: 1, name: "Fido" }]),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_examples",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
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
                name: "document_remove_all_examples",
                arguments: {
                    session: "async",
                    nodePath: "/test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_rename_path ─────────────────────────────────────

    describe("document_rename_path", () => {
        it("renames /pets to /animals preserving operations", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_rename_path",
                arguments: {
                    session: "petstore",
                    oldPath: "/pets",
                    newPath: "/animals",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.renamed).toBe(true);

            // Verify old path is gone
            const oldNode = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]",
                },
            });
            expect(oldNode.isError).toBe(true);

            // Verify new path exists with operations
            const newNode = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/animals]",
                },
            });
            expect(newNode.isError).toBeFalsy();

            // Verify the GET operation was preserved
            const op = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/animals]/get",
                },
            });
            expect(op.isError).toBeFalsy();
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
                name: "document_rename_path",
                arguments: {
                    session: "petstore",
                    oldPath: "/nonexistent",
                    newPath: "/new",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_rename_schema ───────────────────────────────────

    describe("document_rename_schema", () => {
        it("renames Pet schema to Animal and updates $ref references", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_rename_schema",
                arguments: {
                    session: "petstore",
                    oldName: "Pet",
                    newName: "Animal",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.renamed).toBe(true);

            // Verify old schema is gone and new one exists
            const schemas = await client.callTool({
                name: "document_list_schemas",
                arguments: { session: "petstore" },
            });
            const schemaData = JSON.parse((schemas.content as any)[0].text);
            expect(schemaData.schemas).not.toContain("Pet");
            expect(schemaData.schemas).toContain("Animal");

            // Verify $ref references were updated
            const refs = await client.callTool({
                name: "document_find_refs",
                arguments: {
                    session: "petstore",
                    ref: "#/components/schemas/Animal",
                },
            });
            const refData = JSON.parse((refs.content as any)[0].text);
            expect(refData.count).toBeGreaterThan(0);

            // Verify old refs are gone
            const oldRefs = await client.callTool({
                name: "document_find_refs",
                arguments: {
                    session: "petstore",
                    ref: "#/components/schemas/Pet",
                },
            });
            const oldRefData = JSON.parse((oldRefs.content as any)[0].text);
            expect(oldRefData.count).toBe(0);
        });
    });

    // ── document_copy_operation ──────────────────────────────────

    describe("document_copy_operation", () => {
        it("copies GET /pets to GET /pets/{petId} as a new POST", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_copy_operation",
                arguments: {
                    session: "petstore",
                    sourcePath: "/pets",
                    sourceMethod: "get",
                    targetPath: "/pets",
                    targetMethod: "put",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.copied).toBe(true);

            // Verify the source still exists
            const sourceOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });
            expect(sourceOp.isError).toBeFalsy();

            // Verify the target was created
            const targetOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "put",
                },
            });
            expect(targetOp.isError).toBeFalsy();
        });

        it("rejects non-existent source operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_copy_operation",
                arguments: {
                    session: "petstore",
                    sourcePath: "/pets",
                    sourceMethod: "delete",
                    targetPath: "/pets",
                    targetMethod: "put",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_move_operation ──────────────────────────────────

    describe("document_move_operation", () => {
        it("moves GET /pets/{petId} to GET /pets/{id}", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a target path first
            await client.callTool({
                name: "document_add_path",
                arguments: {
                    session: "petstore",
                    path: "/pets/{id}",
                },
            });

            const result = await client.callTool({
                name: "document_move_operation",
                arguments: {
                    session: "petstore",
                    sourcePath: "/pets/{petId}",
                    sourceMethod: "get",
                    targetPath: "/pets/{id}",
                    targetMethod: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.moved).toBe(true);

            // Verify source is gone
            const sourceOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets/{petId}",
                    method: "get",
                },
            });
            expect(sourceOp.isError).toBe(true);

            // Verify target exists
            const targetOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets/{id}",
                    method: "get",
                },
            });
            expect(targetOp.isError).toBeFalsy();
        });
    });

    // ── document_add_callback / document_remove_callback ─────────

    describe("document_add_callback", () => {
        it("adds a callback to an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_callback",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                    name: "onPetAdded",
                    callback: JSON.stringify({}),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("onPetAdded");
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
                name: "document_add_callback",
                arguments: {
                    session: "petstore2",
                    nodePath: "/paths[/pets]/get",
                    name: "test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("document_remove_callback", () => {
        it("adds then removes a callback", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_add_callback",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                    name: "onEvent",
                    callback: JSON.stringify({}),
                },
            });

            const result = await client.callTool({
                name: "document_remove_callback",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                    name: "onEvent",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    // ── document_add_link / document_remove_link ─────────────────

    describe("document_add_link", () => {
        it("adds a link to a response", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_link",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "GetNextPage",
                    link: JSON.stringify({
                        operationId: "listPets",
                        parameters: { limit: "$response.body#/nextLimit" },
                    }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("GetNextPage");
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
                name: "document_add_link",
                arguments: {
                    session: "petstore2",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "test",
                    link: JSON.stringify({}),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("document_remove_link", () => {
        it("adds then removes a link", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
                name: "document_add_link",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "TestLink",
                    link: JSON.stringify({ operationId: "listPets" }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_link",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                    name: "TestLink",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    // ── document_set_external_docs ───────────────────────────────

    describe("document_set_external_docs", () => {
        it("sets external docs at document level", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_external_docs",
                arguments: {
                    session: "petstore",
                    url: "https://example.com/docs",
                    description: "Full API documentation",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.set).toBe(true);

            // Verify via get_node
            const node = await client.callTool({
                name: "document_get_node",
                arguments: {
                    session: "petstore",
                    nodePath: "/externalDocs",
                },
            });
            const nodeData = JSON.parse((node.content as any)[0].text);
            expect(nodeData.node.url).toBe("https://example.com/docs");
        });

        it("sets external docs on an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_external_docs",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get",
                    url: "https://example.com/pets-docs",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.set).toBe(true);
        });
    });

    // ── document_add_server_variable / document_remove_server_variable ─

    describe("document_add_server_variable", () => {
        it("adds a variable to a server", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a server first
            await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://{environment}.api.example.com",
                    description: "Environment-specific server",
                },
            });

            // Find the server's node path
            const servers = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });
            const serverData = JSON.parse((servers.content as any)[0].text);
            const serverIndex = serverData.servers.findIndex(
                (s: any) => s.url === "https://{environment}.api.example.com",
            );

            const result = await client.callTool({
                name: "document_add_server_variable",
                arguments: {
                    session: "petstore",
                    nodePath: `/servers[${serverIndex}]`,
                    name: "environment",
                    default: "production",
                    description: "Deployment environment",
                    enum: JSON.stringify(["production", "staging", "dev"]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("environment");
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
                name: "document_add_server_variable",
                arguments: {
                    session: "petstore2",
                    nodePath: "/servers[0]",
                    name: "test",
                    default: "value",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    describe("document_remove_server_variable", () => {
        it("adds then removes a server variable", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add server
            await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://{env}.api.example.com",
                },
            });

            const servers = await client.callTool({
                name: "document_list_servers",
                arguments: { session: "petstore" },
            });
            const serverData = JSON.parse((servers.content as any)[0].text);
            const serverIndex = serverData.servers.findIndex(
                (s: any) => s.url === "https://{env}.api.example.com",
            );

            // Add variable
            await client.callTool({
                name: "document_add_server_variable",
                arguments: {
                    session: "petstore",
                    nodePath: `/servers[${serverIndex}]`,
                    name: "env",
                    default: "prod",
                },
            });

            // Remove variable
            const result = await client.callTool({
                name: "document_remove_server_variable",
                arguments: {
                    session: "petstore",
                    nodePath: `/servers[${serverIndex}]`,
                    name: "env",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    // ── Bulk delete operations ────────────────────────────────────

    describe("document_remove_all_operations", () => {
        it("removes all operations from /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_operations",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify operations are gone
            const getOp = await client.callTool({
                name: "document_get_operation",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });
            expect(getOp.isError).toBe(true);
        });
    });

    describe("document_remove_all_responses", () => {
        it("removes all responses from GET /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_responses",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    describe("document_remove_all_parameters", () => {
        it("removes all parameters from GET /pets", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_parameters",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify parameters are gone
            const params = await client.callTool({
                name: "document_list_parameters",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                },
            });
            const paramData = JSON.parse((params.content as any)[0].text);
            expect(paramData.parameters.length).toBe(0);
        });
    });

    describe("document_remove_all_response_headers", () => {
        it("adds headers then removes them all", async () => {
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
                    schemaType: "integer",
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_response_headers",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    describe("document_remove_all_schema_properties", () => {
        it("removes all properties from Pet schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_schema_properties",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify properties are gone
            const schema = await client.callTool({
                name: "document_get_schema",
                arguments: {
                    session: "petstore",
                    name: "Pet",
                },
            });
            const schemaData = JSON.parse((schema.content as any)[0].text);
            expect(schemaData.schema.properties).toBeUndefined();
        });
    });

    describe("document_remove_all_servers", () => {
        it("removes all document-level servers", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add servers first
            await client.callTool({
                name: "document_add_server",
                arguments: {
                    session: "petstore",
                    url: "https://api.example.com",
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_servers",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    describe("document_remove_all_tags", () => {
        it("removes all tags from the document", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add tags first
            await client.callTool({
                name: "document_add_tag",
                arguments: {
                    session: "petstore",
                    name: "users",
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_tags",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    describe("document_remove_all_security_schemes", () => {
        it("removes all security schemes", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add a scheme first
            await client.callTool({
                name: "document_add_security_scheme",
                arguments: {
                    session: "petstore",
                    name: "apiKey",
                    scheme: JSON.stringify({ type: "apiKey", name: "X-API-Key", in: "header" }),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_security_schemes",
                arguments: { session: "petstore" },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
        });
    });

    describe("document_remove_all_extensions", () => {
        it("adds extensions then removes them all", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Add extensions
            await client.callTool({
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-foo",
                    value: JSON.stringify("bar"),
                },
            });
            await client.callTool({
                name: "document_add_extension",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                    name: "x-baz",
                    value: JSON.stringify(42),
                },
            });

            const result = await client.callTool({
                name: "document_remove_all_extensions",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);

            // Verify extensions are gone
            const exts = await client.callTool({
                name: "document_list_extensions",
                arguments: {
                    session: "petstore",
                    nodePath: "/info",
                },
            });
            const extData = JSON.parse((exts.content as any)[0].text);
            expect(Object.keys(extData.extensions).length).toBe(0);
        });
    });
});
