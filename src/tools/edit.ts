import type { Document, ICommand, Node } from "@apicurio/data-models";
import {
    AggregateCommand,
    CommandFactory,
    Library,
    ModelTypeUtil,
    NodePath,
    TraverserDirection,
} from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { RemoveNodeVisitor } from "../visitors/RemoveNodeVisitor.js";
import { type SchemaContainer, SchemaContainerVisitor } from "../visitors/SchemaContainerVisitor.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

/**
 * Resolve a path item node from a document by API path string.
 *
 * @param doc the document to resolve from
 * @param apiPath the API path (e.g. `/pets`)
 * @returns the resolved Node, or a CallToolResult error
 */
function resolvePathItem(doc: Document, apiPath: string): Node | CallToolResult {
    const np = NodePath.parse(`/paths[${apiPath}]`);
    const node = Library.resolveNodePath(np, doc);
    if (node == null) {
        return errorResult(`Path not found: ${apiPath}`);
    }
    return node;
}

/**
 * Resolve an operation node from a document by API path and HTTP method.
 *
 * @param doc the document to resolve from
 * @param apiPath the API path (e.g. `/pets`)
 * @param method the HTTP method (e.g. `get`)
 * @returns the resolved Node, or a CallToolResult error
 */
function resolveOperation(doc: Document, apiPath: string, method: string): Node | CallToolResult {
    const np = NodePath.parse(`/paths[${apiPath}]/${method.toLowerCase()}`);
    const node = Library.resolveNodePath(np, doc);
    if (node == null) {
        return errorResult(`No ${method.toUpperCase()} operation on path ${apiPath}`);
    }
    return node;
}

/**
 * Type guard to distinguish a CallToolResult error from a resolved Node.
 *
 * @param value the value to check
 * @returns true if the value is a CallToolResult (error), false if it's a Node
 */
function isErrorResult(value: Node | CallToolResult): value is CallToolResult {
    return value != null && typeof value === "object" && "content" in value;
}

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

    // ── document_add_operation ─────────────────────────────────────
    server.tool(
        "document_add_operation",
        "Add a new HTTP operation to an existing path item",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (get, post, put, delete, patch, options, head)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const methodLower = method.toLowerCase();
            if (!HTTP_METHODS.includes(methodLower as any)) {
                return errorResult(
                    `Invalid HTTP method: ${method}. Must be one of: ${HTTP_METHODS.join(", ")}`,
                );
            }

            const pathItem = resolvePathItem(doc, apiPath);
            if (isErrorResult(pathItem)) {
                return pathItem;
            }

            // Check if the operation already exists
            const getter = `get${methodLower.charAt(0).toUpperCase()}${methodLower.slice(1)}` as string;
            if ((pathItem as any)[getter]?.() != null) {
                return errorResult(`Operation ${method.toUpperCase()} already exists on path ${apiPath}`);
            }

            const command = CommandFactory.createCreateOperationCommand(pathItem as any, methodLower);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                added: true,
            });
        }),
    );

    // ── document_remove_operation ──────────────────────────────────
    server.tool(
        "document_remove_operation",
        "Remove a specific HTTP operation from a path item",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const methodLower = method.toLowerCase();
            const pathItem = resolvePathItem(doc, apiPath);
            if (isErrorResult(pathItem)) {
                return pathItem;
            }

            // Check that the operation exists before trying to delete
            const getter = `get${methodLower.charAt(0).toUpperCase()}${methodLower.slice(1)}` as string;
            if ((pathItem as any)[getter]?.() == null) {
                return errorResult(`No ${method.toUpperCase()} operation on path ${apiPath}`);
            }

            const command = CommandFactory.createDeleteOperationCommand(pathItem as any, methodLower);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                removed: true,
            });
        }),
    );

    // ── document_add_response ─────────────────────────────────────
    server.tool(
        "document_add_response",
        "Add a response to an operation by status code and description",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (get, post, put, etc.)"),
            statusCode: z.string().describe("HTTP status code (e.g. 200, 404, default)"),
            description: z.string().describe("Response description"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, statusCode, description } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) {
                return operation;
            }

            const command = CommandFactory.createAddResponseCommand(
                operation as any,
                statusCode,
                description,
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                statusCode,
                added: true,
            });
        }),
    );

    // ── document_add_parameter ────────────────────────────────────
    server.tool(
        "document_add_parameter",
        "Add a parameter to a path item or operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().optional().describe("HTTP method (omit to add to path item level)"),
            name: z.string().describe("Parameter name"),
            location: z.string().describe("Parameter location: query, path, header, cookie"),
            description: z.string().optional().describe("Parameter description"),
            required: z.boolean().optional().describe("Whether the parameter is required"),
            type: z
                .string()
                .optional()
                .describe("Schema type (string, integer, number, boolean, array). Defaults to string"),
        },
        withErrorHandling(async (args) => {
            const {
                session,
                path: apiPath,
                method,
                name,
                location,
                description: desc,
                required: req,
                type: paramType,
            } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Resolve parent: operation if method is given, otherwise path item
            let parent: Node | CallToolResult;
            if (method) {
                parent = resolveOperation(doc, apiPath, method);
            } else {
                parent = resolvePathItem(doc, apiPath);
            }
            if (isErrorResult(parent)) {
                return parent;
            }

            const isRequired = req ?? location === "path";
            const schemaType = paramType ?? "string";

            const command = CommandFactory.createAddParameterCommand(
                parent as any,
                name,
                location,
                desc ?? "",
                isRequired,
                schemaType,
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method?.toUpperCase(),
                parameter: { name, location, required: isRequired, type: schemaType },
                added: true,
            });
        }),
    );

    // ── document_add_request_body ──────────────────────────────────
    server.tool(
        "document_add_request_body",
        "Add an empty request body to an operation (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (e.g. post, put, patch)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult(
                    "Request bodies are not supported in OpenAPI 2.0. Use parameters with 'in: body' instead.",
                );
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) {
                return operation;
            }

            const command = CommandFactory.createAddRequestBodyCommand(operation as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                requestBodyAdded: true,
            });
        }),
    );

    // ── document_add_media_type ───────────────────────────────────
    server.tool(
        "document_add_media_type",
        "Add a media type to a request body or response (OpenAPI 3.x)",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe(
                    "Node path to the request body or response (e.g. /paths[/pets]/post/requestBody or /paths[/pets]/get/responses[200])",
                ),
            mediaType: z.string().describe("Media type string (e.g. application/json, application/xml)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, mediaType } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);

            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createAddMediaTypeCommand(parent, mediaType);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                mediaType,
                added: true,
            });
        }),
    );

    // ── document_set_media_type_schema ─────────────────────────────
    server.tool(
        "document_set_media_type_schema",
        "Set the schema for a media type, either as a $ref or inline type",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe(
                    "Node path to the media type (e.g. /paths[/pets]/post/requestBody/content[application/json])",
                ),
            schemaRef: z.string().optional().describe("Schema $ref string (e.g. #/components/schemas/Pet)"),
            schemaType: z
                .string()
                .optional()
                .describe("Inline schema type (string, integer, object, array, etc.)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, schemaRef, schemaType } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (!schemaRef && !schemaType) {
                return errorResult("Either schemaRef or schemaType must be provided");
            }

            const np = NodePath.parse(nodePathStr);
            const mediaTypeNode = Library.resolveNodePath(np, doc);

            if (mediaTypeNode == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createChangeMediaTypeSchemaCommand(
                mediaTypeNode as any,
                schemaRef ?? "",
                schemaType ?? "",
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                schemaRef: schemaRef || undefined,
                schemaType: schemaType || undefined,
                updated: true,
            });
        }),
    );

    // ── document_add_security_scheme ──────────────────────────────
    server.tool(
        "document_add_security_scheme",
        "Add a security scheme definition to the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Security scheme name (e.g. bearerAuth, apiKey)"),
            scheme: z.string().describe("JSON string with the security scheme definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, scheme: schemeJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const schemeObj = JSON.parse(schemeJson);
            const command = CommandFactory.createAddSecuritySchemeCommand(name, schemeObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );
}
