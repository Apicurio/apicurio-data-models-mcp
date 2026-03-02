import type { ICommand } from "@apicurio/data-models";
import {
    AggregateCommand,
    CommandFactory,
    Library,
    ModelTypeUtil,
    NodePath,
    TraverserDirection,
} from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
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

            const commands: ICommand[] = [];
            if (title !== undefined) {
                commands.push(CommandFactory.createChangeTitleCommand(title));
            }
            if (description !== undefined) {
                commands.push(CommandFactory.createChangeDescriptionCommand(description));
            }
            if (version !== undefined) {
                commands.push(CommandFactory.createChangeVersionCommand(version));
            }
            new AggregateCommand("set_info", {}, commands).execute(doc);

            sessionManager.touchSession(session);

            const info = doc.getInfo();
            return successResult({
                session,
                info: {
                    title: info?.getTitle(),
                    description: info?.getDescription(),
                    version: info?.getVersion(),
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

            // Check for duplicate paths before executing the command
            const oasDoc = doc as any;
            const paths = oasDoc.getPaths();
            if (paths != null && paths.getItem(apiPath) != null) {
                return errorResult(`Path already exists: ${apiPath}`);
            }

            const pathItemData = pathItemJson ? JSON.parse(pathItemJson) : {};
            const command = CommandFactory.createAddPathItemCommand(apiPath, pathItemData);
            command.execute(doc);

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

            if (ModelTypeUtil.isOpenApiModel(doc)) {
                // Use the AddSchemaDefinitionCommand for OpenAPI documents.
                // The command handles OAS 2.0 Definitions vs. OAS 3.x Components differences
                // and creates the container if it doesn't exist.
                const command = CommandFactory.createAddSchemaDefinitionCommand(name, schemaData);
                command.execute(doc);
            } else {
                // AsyncAPI fallback: use visitor-based approach since
                // AddSchemaDefinitionCommand only supports OpenAPI documents
                const containerVisitor = new SchemaContainerVisitor();
                Library.visitTree(doc, containerVisitor, TraverserDirection.down);

                if (!containerVisitor.isFound()) {
                    const asyncDoc = doc as any;
                    if (asyncDoc.createComponents) {
                        const components = asyncDoc.createComponents();
                        asyncDoc.setComponents(components);
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

            const command = CommandFactory.createUpdateNodeCommand(node, newValue);
            command.execute(entry.document);

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
