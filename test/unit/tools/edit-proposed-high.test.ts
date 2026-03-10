import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { sessionManager } from "../../../src/session-manager.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("proposed high-priority edit tools", () => {
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

    // ── document_add_schema_property ──────────────────────────────

    describe("document_add_schema_property", () => {
        it("adds a property to an existing schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_schema_property",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    propertyName: "status",
                    schema: JSON.stringify({ type: "string" }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.schemaName).toBe("Pet");
            expect(data.propertyName).toBe("status");
            expect(result.isError).toBeFalsy();

            // Verify the property exists via get_schema
            const schemaResult = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "Pet" },
            });
            const schemaData = JSON.parse((schemaResult.content as any)[0].text);
            expect(schemaData.schema.properties.status).toBeDefined();
            expect(schemaData.schema.properties.status.type).toBe("string");
        });

        it("adds a property with complex schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_schema_property",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    propertyName: "metadata",
                    schema: JSON.stringify({
                        type: "object",
                        properties: {
                            createdAt: { type: "string", format: "date-time" },
                        },
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
                name: "document_add_schema_property",
                arguments: {
                    session: "async",
                    schemaName: "User",
                    propertyName: "email",
                    schema: JSON.stringify({ type: "string" }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_remove_schema_property ───────────────────────────

    describe("document_remove_schema_property", () => {
        it("removes an existing property from a schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_remove_schema_property",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    propertyName: "tag",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.removed).toBe(true);
            expect(data.propertyName).toBe("tag");

            // Verify the property is gone
            const schemaResult = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "Pet" },
            });
            const schemaData = JSON.parse((schemaResult.content as any)[0].text);
            expect(schemaData.schema.properties.tag).toBeUndefined();
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
                name: "document_remove_schema_property",
                arguments: {
                    session: "async",
                    schemaName: "User",
                    propertyName: "email",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_security_requirement ─────────────────────────

    describe("document_add_security_requirement", () => {
        it("adds a document-level security requirement", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // First add a security scheme
            await client.callTool({
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

            const result = await client.callTool({
                name: "document_add_security_requirement",
                arguments: {
                    session: "petstore",
                    requirement: JSON.stringify({ bearerAuth: [] }),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.scope).toBe("document");
            expect(result.isError).toBeFalsy();
        });

        it("adds an operation-level security requirement", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            await client.callTool({
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

            const result = await client.callTool({
                name: "document_add_security_requirement",
                arguments: {
                    session: "petstore",
                    requirement: JSON.stringify({ apiKey: [] }),
                    path: "/pets",
                    method: "get",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
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
                name: "document_add_security_requirement",
                arguments: {
                    session: "async",
                    requirement: JSON.stringify({ bearerAuth: [] }),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_example ──────────────────────────────────────

    describe("document_add_example", () => {
        it("adds a named example to a media type", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_example",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/responses[200]/content[application/json]",
                    name: "singlePet",
                    value: JSON.stringify([{ id: 1, name: "Fido", tag: "dog" }]),
                    summary: "A single pet example",
                    description: "Shows a response with one pet",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
            expect(data.name).toBe("singlePet");
            expect(result.isError).toBeFalsy();
        });

        it("adds a named example to a parameter", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_add_example",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/pets]/get/parameters[0]",
                    name: "smallLimit",
                    value: JSON.stringify(10),
                    summary: "Small page size",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.added).toBe(true);
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
                name: "document_add_example",
                arguments: {
                    session: "swagger",
                    nodePath: "/paths[/pets]/get/parameters[0]",
                    name: "test",
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
                name: "document_add_example",
                arguments: {
                    session: "petstore",
                    nodePath: "/paths[/nonexistent]/get/responses[200]",
                    name: "test",
                    value: JSON.stringify("test"),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_operation_info ───────────────────────────────

    describe("document_set_operation_info", () => {
        it("sets operationId, summary, and description", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_operation_info",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    operationId: "getAllPets",
                    summary: "Retrieve all pets",
                    description: "Returns a complete list of all registered pets",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated.operationId).toBe("getAllPets");
            expect(data.updated.summary).toBe("Retrieve all pets");
            expect(data.updated.description).toBe("Returns a complete list of all registered pets");
            expect(result.isError).toBeFalsy();

            // Verify via get_operation
            const opResult = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "petstore", path: "/pets", method: "get" },
            });
            const opData = JSON.parse((opResult.content as any)[0].text);
            expect(opData.operation.operationId).toBe("getAllPets");
            expect(opData.operation.summary).toBe("Retrieve all pets");
        });

        it("sets deprecated flag", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_operation_info",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    deprecated: true,
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.updated.deprecated).toBe(true);
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
                name: "document_set_operation_info",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                    summary: "Should fail",
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
                name: "document_set_operation_info",
                arguments: {
                    session: "async",
                    path: "/pets",
                    method: "get",
                    summary: "test",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_operation_tags ───────────────────────────────

    describe("document_set_operation_tags", () => {
        it("sets tags on an operation", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_operation_tags",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    tags: JSON.stringify(["animals", "admin"]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.tags).toEqual(["animals", "admin"]);
            expect(result.isError).toBeFalsy();

            // Verify via get_operation
            const opResult = await client.callTool({
                name: "document_get_operation",
                arguments: { session: "petstore", path: "/pets", method: "get" },
            });
            const opData = JSON.parse((opResult.content as any)[0].text);
            expect(opData.operation.tags).toEqual(["animals", "admin"]);
        });

        it("clears tags by setting empty array", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_operation_tags",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "get",
                    tags: JSON.stringify([]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.tags).toEqual([]);
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
                name: "document_set_operation_tags",
                arguments: {
                    session: "petstore",
                    path: "/pets",
                    method: "delete",
                    tags: JSON.stringify(["test"]),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_schema_required ──────────────────────────────

    describe("document_set_schema_required", () => {
        it("sets the required array on a schema", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_schema_required",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    required: JSON.stringify(["id", "name", "tag"]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.required).toEqual(["id", "name", "tag"]);
            expect(result.isError).toBeFalsy();

            // Verify via get_schema
            const schemaResult = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "Pet" },
            });
            const schemaData = JSON.parse((schemaResult.content as any)[0].text);
            expect(schemaData.schema.required).toEqual(["id", "name", "tag"]);
        });

        it("clears required by setting empty array", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_schema_required",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    required: JSON.stringify([]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.required).toEqual([]);
        });

        it("rejects when schema does not exist", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_schema_required",
                arguments: {
                    session: "petstore",
                    schemaName: "NonExistent",
                    required: JSON.stringify(["id"]),
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
                name: "document_set_schema_required",
                arguments: {
                    session: "async",
                    schemaName: "User",
                    required: JSON.stringify(["id"]),
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_set_schema_type ──────────────────────────────────

    describe("document_set_schema_type", () => {
        it("sets the type on a schema definition", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            const result = await client.callTool({
                name: "document_set_schema_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[Pet]",
                    type: "object",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.type).toBe("object");
            expect(result.isError).toBeFalsy();
        });

        it("changes schema type from array to object", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Pets schema is type: array
            const result = await client.callTool({
                name: "document_set_schema_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[Pets]",
                    type: "object",
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.type).toBe("object");

            // Verify via get_schema
            const schemaResult = await client.callTool({
                name: "document_get_schema",
                arguments: { session: "petstore", name: "Pets" },
            });
            const schemaData = JSON.parse((schemaResult.content as any)[0].text);
            expect(schemaData.schema.type).toBe("object");
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
                name: "document_set_schema_type",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[NonExistent]",
                    type: "string",
                },
            });

            expect(result.isError).toBe(true);
        });
    });

    // ── document_add_schema_enum ──────────────────────────────────

    describe("document_add_schema_enum", () => {
        it("sets enum values on a schema property", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // First add a status property to Pet
            await client.callTool({
                name: "document_add_schema_property",
                arguments: {
                    session: "petstore",
                    schemaName: "Pet",
                    propertyName: "status",
                    schema: JSON.stringify({ type: "string" }),
                },
            });

            const result = await client.callTool({
                name: "document_add_schema_enum",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[Pet]/properties[status]",
                    values: JSON.stringify(["active", "inactive", "adopted"]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.enum).toEqual(["active", "inactive", "adopted"]);
            expect(result.isError).toBeFalsy();
        });

        it("sets enum on an existing schema property", async () => {
            await client.callTool({
                name: "document_load",
                arguments: {
                    session: "petstore",
                    filePath: path.join(FIXTURES, "petstore-3.0.json"),
                },
            });

            // Set enum on the Pet name property
            const result = await client.callTool({
                name: "document_add_schema_enum",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[Pet]/properties[name]",
                    values: JSON.stringify(["Fido", "Rex", "Buddy"]),
                },
            });

            const data = JSON.parse((result.content as any)[0].text);
            expect(data.enum).toEqual(["Fido", "Rex", "Buddy"]);
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
                name: "document_add_schema_enum",
                arguments: {
                    session: "petstore",
                    nodePath: "/components/schemas[NonExistent]",
                    values: JSON.stringify(["a", "b"]),
                },
            });

            expect(result.isError).toBe(true);
        });
    });
});
