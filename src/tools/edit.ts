import { Library, NodePath, Oas20Document, Oas30Document, OasDocument } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";

/**
 * Register all edit tools (semantic + generic) on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerEditTools(server: McpServer): void {
    // ── document_set_info ──────────────────────────────────────────
    server.tool(
        "document_set_info",
        "Set document title, description, and/or version",
        {
            session: z.string().describe("Session name"),
            title: z.string().optional().describe("New document title"),
            description: z.string().optional().describe("New document description"),
            version: z.string().optional().describe("New document version"),
        },
        withErrorHandling(async (args) => {
            const { session, title, description, version } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (doc.info == null) {
                doc.info = doc.createInfo();
            }

            if (title !== undefined) {
                doc.info.title = title;
            }
            if (description !== undefined) {
                doc.info.description = description;
            }
            if (version !== undefined) {
                doc.info.version = version;
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                info: {
                    title: doc.info.title,
                    description: doc.info.description,
                    version: doc.info.version,
                },
            });
        }),
    );

    // ── document_add_path ──────────────────────────────────────────
    server.tool(
        "document_add_path",
        "Add a new path item to an OpenAPI document",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The path string (e.g. /users)"),
            pathItem: z.string().optional().describe("JSON string with path item content (operations, etc.)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, pathItem: pathItemJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!(doc instanceof OasDocument)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (doc.paths == null) {
                doc.paths = doc.createPaths();
            }

            if (doc.paths.getPathItem(apiPath) != null) {
                return errorResult(`Path already exists: ${apiPath}`);
            }

            const pathItem = doc.paths.createPathItem(apiPath);
            if (pathItemJson) {
                const pathItemData = JSON.parse(pathItemJson);
                Library.readNode(pathItemData, pathItem);
            }
            doc.paths.addPathItem(apiPath, pathItem);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                added: true,
            });
        }),
    );

    // ── document_add_schema ────────────────────────────────────────
    server.tool(
        "document_add_schema",
        "Add a schema definition to the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Schema name"),
            schema: z.string().describe("JSON string with the schema definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, schema: schemaJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;
            const schemaData = JSON.parse(schemaJson);

            if (doc instanceof Oas20Document) {
                if (doc.definitions == null) {
                    doc.definitions = doc.createDefinitions();
                }
                const schemaDef = doc.definitions.createSchemaDefinition(name);
                Library.readNode(schemaData, schemaDef);
                doc.definitions.addDefinition(name, schemaDef);
            } else if (doc instanceof Oas30Document) {
                if (doc.components == null) {
                    doc.components = doc.createComponents();
                }
                const schemaDef = doc.components.createSchemaDefinition(name);
                Library.readNode(schemaData, schemaDef);
                doc.components.addSchemaDefinition(name, schemaDef);
            } else {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_set_node ──────────────────────────────────────────
    server.tool(
        "document_set_node",
        "Set or replace any node at a given node path using serialize-modify-deserialize",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to set (e.g. /info, /paths[/pets]/get)"),
            value: z.string().describe("JSON string with the new node value"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, value: valueJson } = args;
            const entry = sessionManager.getSession(session);
            const newValue = JSON.parse(valueJson);

            // Serialize the full document to a plain JS object
            const docJson = Library.writeNode(entry.document);

            // Navigate the JSON object to the target location and replace it
            const segments = new NodePath(nodePathStr).toSegments();
            if (segments.length === 0) {
                return errorResult("Cannot replace the root document via set_node");
            }

            let current = docJson;
            for (let i = 0; i < segments.length - 1; i++) {
                const seg = segments[i];
                if (current == null || typeof current !== "object") {
                    return errorResult(`Invalid node path: ${nodePathStr}`);
                }
                current = current[seg];
            }

            const lastSeg = segments[segments.length - 1];
            if (current == null || typeof current !== "object") {
                return errorResult(`Invalid node path: ${nodePathStr}`);
            }
            current[lastSeg] = newValue;

            // Re-read the full document
            const newDoc = Library.readDocument(docJson);
            entry.document = newDoc;
            entry.modelType = newDoc.getDocumentType();

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                updated: true,
            });
        }),
    );

    // ── document_remove_node ───────────────────────────────────────
    server.tool(
        "document_remove_node",
        "Remove any node at a given node path",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe("Node path to remove (e.g. /paths[/pets], /components/schemas[Pet])"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);

            // Serialize-modify-deserialize approach
            const docJson = Library.writeNode(entry.document);

            const segments = new NodePath(nodePathStr).toSegments();
            if (segments.length === 0) {
                return errorResult("Cannot remove the root document");
            }

            let current = docJson;
            for (let i = 0; i < segments.length - 1; i++) {
                const seg = segments[i];
                if (current == null || typeof current !== "object") {
                    return errorResult(`Invalid node path: ${nodePathStr}`);
                }
                current = current[seg];
            }

            const lastSeg = segments[segments.length - 1];
            if (current == null || typeof current !== "object" || !(lastSeg in current)) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            if (Array.isArray(current)) {
                const idx = parseInt(lastSeg, 10);
                if (!Number.isNaN(idx)) {
                    current.splice(idx, 1);
                } else {
                    return errorResult(`Invalid array index: ${lastSeg}`);
                }
            } else {
                delete current[lastSeg];
            }

            // Re-read the full document
            const newDoc = Library.readDocument(docJson);
            entry.document = newDoc;
            entry.modelType = newDoc.getDocumentType();

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );
}
