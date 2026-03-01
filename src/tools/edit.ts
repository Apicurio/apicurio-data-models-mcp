import { Library, ModelTypeUtil, NodePath, TraverserDirection } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { ClearNodeVisitor } from "../visitors/ClearNodeVisitor.js";
import { RemoveNodeVisitor } from "../visitors/RemoveNodeVisitor.js";
import { type SchemaContainer, SchemaContainerVisitor } from "../visitors/SchemaContainerVisitor.js";

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

            let info = doc.getInfo();
            if (info == null) {
                info = doc.createInfo();
                doc.setInfo(info);
            }

            if (title !== undefined) {
                info.setTitle(title);
            }
            if (description !== undefined) {
                info.setDescription(description);
            }
            if (version !== undefined) {
                info.setVersion(version);
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                info: {
                    title: info.getTitle(),
                    description: info.getDescription(),
                    version: info.getVersion(),
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

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const oasDoc = doc as any;
            let paths = oasDoc.getPaths();
            if (paths == null) {
                paths = oasDoc.createPaths();
                oasDoc.setPaths(paths);
            }

            if (paths.getItem(apiPath) != null) {
                return errorResult(`Path already exists: ${apiPath}`);
            }

            const pathItem = paths.createPathItem();
            if (pathItemJson) {
                const pathItemData = JSON.parse(pathItemJson);
                Library.readNode(pathItemData, pathItem);
            }
            paths.addItem(apiPath, pathItem);

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

            // Use a visitor to find the schema container, regardless of spec version
            const containerVisitor = new SchemaContainerVisitor();
            Library.visitTree(doc, containerVisitor, TraverserDirection.down);

            if (!containerVisitor.isFound()) {
                // Container doesn't exist yet - create one based on model type
                if (ModelTypeUtil.isOpenApiModel(doc)) {
                    const oasDoc = doc as any;
                    if (oasDoc.createDefinitions) {
                        // OpenAPI 2.0
                        const definitions = oasDoc.createDefinitions();
                        oasDoc.setDefinitions(definitions);
                    } else if (oasDoc.createComponents) {
                        // OpenAPI 3.x
                        const components = oasDoc.createComponents();
                        oasDoc.setComponents(components);
                    }
                } else if (ModelTypeUtil.isAsyncApiModel(doc)) {
                    const asyncDoc = doc as any;
                    if (asyncDoc.createComponents) {
                        const components = asyncDoc.createComponents();
                        asyncDoc.setComponents(components);
                    }
                }
                // Re-visit to pick up the newly created container
                Library.visitTree(doc, containerVisitor, TraverserDirection.down);
            }

            if (!containerVisitor.isFound()) {
                return errorResult("Unable to find or create a schema container in this document");
            }

            const container = containerVisitor.container as SchemaContainer;
            const schemaDef = container.createSchema();
            Library.readNode(schemaData, schemaDef);
            container.addSchema(name, schemaDef);

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
        "Set or replace any node at a given node path using in-place update",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to set (e.g. /info, /paths[/pets]/get)"),
            value: z.string().describe("JSON string with the new node value"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, value: valueJson } = args;
            const entry = sessionManager.getSession(session);
            const newValue = JSON.parse(valueJson);

            const np = NodePath.parse(nodePathStr);
            const node = Library.resolveNodePath(np, entry.document);

            if (node == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            // Clear all properties from the node, then re-populate with new content
            const clearVisitor = new ClearNodeVisitor();
            node.accept(clearVisitor);
            Library.readNode(newValue, node);

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

            const np = NodePath.parse(nodePathStr);
            const node = Library.resolveNodePath(np, entry.document);

            if (node == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            // Use the RemoveNodeVisitor to remove the node from its parent.
            // The visitor dispatches to the correct visitXxx() method based on
            // the node's type, and each method knows exactly how to detach
            // that node type from its parent.
            const removeVisitor = new RemoveNodeVisitor();
            node.accept(removeVisitor);

            if (removeVisitor.error) {
                return errorResult(removeVisitor.error);
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );
}
