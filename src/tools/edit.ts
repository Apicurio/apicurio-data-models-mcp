import type { Document, ICommand, Node } from "@apicurio/data-models";
import {
    AddExampleCommand,
    AddSecurityRequirementCommand,
    AggregateCommand,
    CommandFactory,
    DeleteAllExtensionsCommand,
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
import { ClearNodeVisitor } from "../visitors/ClearNodeVisitor.js";
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

    // ── document_remove_response ──────────────────────────────────
    server.tool(
        "document_remove_response",
        "Remove a response from an operation by status code",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (get, post, put, etc.)"),
            statusCode: z.string().describe("HTTP status code to remove (e.g. 200, 404, default)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, statusCode } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) {
                return operation;
            }

            const command = CommandFactory.createDeleteResponseCommand(operation as any, statusCode);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                statusCode,
                removed: true,
            });
        }),
    );

    // ── document_add_response_definition ──────────────────────────
    server.tool(
        "document_add_response_definition",
        "Add a reusable response definition to the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Response definition name (e.g. NotFound, ErrorResponse)"),
            response: z.string().describe("JSON string with the response definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, response: responseJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Ensure the responses container exists in components before
            // executing the command (it requires an initialized map).
            const comp = (doc as any).getComponents?.();
            if (comp && typeof comp.getResponses === "function" && comp.getResponses() == null) {
                // Bootstrap the responses map by adding and removing a placeholder
                const placeholder = comp.createResponse();
                comp.addResponse("__placeholder__", placeholder);
                comp.removeResponse("__placeholder__");
            }

            const responseObj = JSON.parse(responseJson);
            const command = CommandFactory.createAddResponseDefinitionCommand(name, responseObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_parameter ─────────────────────────────────
    server.tool(
        "document_remove_parameter",
        "Remove a parameter from a path item or operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().optional().describe("HTTP method (omit to remove from path item level)"),
            name: z.string().describe("Parameter name to remove"),
            location: z.string().describe("Parameter location: query, path, header, cookie"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, name, location } = args;
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

            const command = CommandFactory.createDeleteParameterCommand(parent as any, name, location);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method?.toUpperCase(),
                parameter: { name, location },
                removed: true,
            });
        }),
    );

    // ── document_remove_security_scheme ────────────────────────────
    server.tool(
        "document_remove_security_scheme",
        "Remove a security scheme definition from the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Security scheme name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteSecuritySchemeCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_add_tag ──────────────────────────────────────────
    server.tool(
        "document_add_tag",
        "Add a tag definition to the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Tag name"),
            description: z.string().optional().describe("Tag description"),
        },
        withErrorHandling(async (args) => {
            const { session, name, description } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createAddTagCommand(name, description ?? "");
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_add_server ───────────────────────────────────────
    server.tool(
        "document_add_server",
        "Add a server to the document or to a specific path/operation",
        {
            session: z.string().describe("Session name"),
            url: z.string().describe("Server URL (e.g. https://api.example.com/v1)"),
            description: z.string().optional().describe("Server description"),
            nodePath: z
                .string()
                .optional()
                .describe(
                    "Node path to add the server to (e.g. /paths[/pets]); if omitted, adds to document level",
                ),
        },
        withErrorHandling(async (args) => {
            const { session, url, description, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            let parent: any = doc;
            if (nodePathStr) {
                const np = NodePath.parse(nodePathStr);
                const resolved = Library.resolveNodePath(np, doc);
                if (resolved == null) {
                    return errorResult(`No node found at path: ${nodePathStr}`);
                }
                parent = resolved;
            }

            const command = CommandFactory.createAddServerCommand(parent, url, description ?? "");
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                url,
                nodePath: nodePathStr ?? "/",
                added: true,
            });
        }),
    );

    // ── document_set_contact ──────────────────────────────────────
    server.tool(
        "document_set_contact",
        "Set the contact information in the document info",
        {
            session: z.string().describe("Session name"),
            name: z.string().optional().describe("Contact name"),
            email: z.string().optional().describe("Contact email"),
            url: z.string().optional().describe("Contact URL"),
        },
        withErrorHandling(async (args) => {
            const { session, name, email, url } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            const command = CommandFactory.createChangeContactCommand(name ?? "", email ?? "", url ?? "");
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                contact: {
                    name: name ?? "",
                    email: email ?? "",
                    url: url ?? "",
                },
                updated: true,
            });
        }),
    );

    // ── document_set_license ──────────────────────────────────────
    server.tool(
        "document_set_license",
        "Set the license information in the document info",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("License name (e.g. Apache 2.0, MIT)"),
            url: z.string().optional().describe("License URL"),
        },
        withErrorHandling(async (args) => {
            const { session, name, url } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            const command = CommandFactory.createChangeLicenseCommand(name, url ?? "");
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                license: {
                    name,
                    url: url ?? "",
                },
                updated: true,
            });
        }),
    );

    // ── document_remove_schema ────────────────────────────────────
    server.tool(
        "document_remove_schema",
        "Remove a schema definition from the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Schema name to remove (e.g. Pet, Error)"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteSchemaCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_remove_path ──────────────────────────────────────
    server.tool(
        "document_remove_path",
        "Remove a path item from the document",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path to remove (e.g. /pets/{petId})"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeletePathCommand(apiPath);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                removed: true,
            });
        }),
    );

    // ── document_add_channel ──────────────────────────────────────
    server.tool(
        "document_add_channel",
        "Add a channel item to an AsyncAPI document",
        {
            session: z.string().describe("Session name"),
            channel: z.string().describe("Channel name (e.g. user/signedup)"),
            channelItem: z.string().optional().describe("JSON string with channel item content"),
        },
        withErrorHandling(async (args) => {
            const { session, channel, channelItem: channelItemJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isAsyncApiModel(doc)) {
                return errorResult("This operation is only supported for AsyncAPI documents");
            }

            const channelItemData = channelItemJson ? JSON.parse(channelItemJson) : {};
            const command = CommandFactory.createAddChannelItemCommand(channel, channelItemData);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                channel,
                added: true,
            });
        }),
    );

    // ── document_add_response_header ──────────────────────────────
    server.tool(
        "document_add_response_header",
        "Add a header to an OpenAPI response",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe("Node path to the response (e.g. /paths[/pets]/get/responses[200])"),
            name: z.string().describe("Header name (e.g. X-Rate-Limit)"),
            description: z.string().optional().describe("Header description"),
            schemaType: z.string().optional().describe("Schema type (defaults to string)"),
            schemaRef: z.string().optional().describe("Schema $ref string"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, description, schemaType, schemaRef } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const response = Library.resolveNodePath(np, doc);

            if (response == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createAddResponseHeaderCommand(
                response as any,
                name,
                description ?? "",
                schemaType ?? "string",
                schemaRef ?? "",
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                header: name,
                added: true,
            });
        }),
    );

    // ── document_remove_request_body ─────────────────────────────
    server.tool(
        "document_remove_request_body",
        "Remove the request body from an operation (OpenAPI 3.x only)",
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

            const command = CommandFactory.createDeleteRequestBodyCommand(operation as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toUpperCase(),
                requestBodyRemoved: true,
            });
        }),
    );

    // ── document_update_security_scheme ──────────────────────────
    server.tool(
        "document_update_security_scheme",
        "Update an existing security scheme definition",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Security scheme name to update"),
            scheme: z.string().describe("JSON string with the updated security scheme definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, scheme: schemeJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const schemeObj = JSON.parse(schemeJson);
            const command = CommandFactory.createUpdateSecuritySchemeCommand(name, schemeObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                updated: true,
            });
        }),
    );

    // ── document_remove_tag ─────────────────────────────────────
    server.tool(
        "document_remove_tag",
        "Remove a tag definition from the document",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Tag name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteTagCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_rename_tag ─────────────────────────────────────
    server.tool(
        "document_rename_tag",
        "Rename a tag across the entire document (updates both the tag definition and all operation references)",
        {
            session: z.string().describe("Session name"),
            oldName: z.string().describe("Current tag name"),
            newName: z.string().describe("New tag name"),
        },
        withErrorHandling(async (args) => {
            const { session, oldName, newName } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createRenameTagCommand(oldName, newName);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                oldName,
                newName,
                renamed: true,
            });
        }),
    );

    // ── document_remove_server ──────────────────────────────────
    server.tool(
        "document_remove_server",
        "Remove a server from the document or a specific scope",
        {
            session: z.string().describe("Session name"),
            url: z.string().describe("Server URL to remove"),
            nodePath: z
                .string()
                .optional()
                .describe(
                    "Node path for scoped servers (e.g. /paths[/pets]); if omitted, removes from document level",
                ),
        },
        withErrorHandling(async (args) => {
            const { session, url, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            let parent: any = doc;
            if (nodePathStr) {
                const np = NodePath.parse(nodePathStr);
                const resolved = Library.resolveNodePath(np, doc);
                if (resolved == null) {
                    return errorResult(`No node found at path: ${nodePathStr}`);
                }
                parent = resolved;
            }

            const command = CommandFactory.createDeleteServerCommand(parent, url);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                url,
                nodePath: nodePathStr ?? "/",
                removed: true,
            });
        }),
    );

    // ── document_add_extension ──────────────────────────────────
    server.tool(
        "document_add_extension",
        "Add a vendor extension (x-* property) to any node in the document",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the parent (e.g. /info, /paths[/pets]/get)"),
            name: z.string().describe("Extension name (must start with x-)"),
            value: z.string().describe("JSON string with the extension value"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, value: valueJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!name.startsWith("x-")) {
                return errorResult("Extension name must start with 'x-'");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);

            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const extensionValue = JSON.parse(valueJson);
            const command = CommandFactory.createAddExtensionCommand(parent as any, name, extensionValue);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_extension ───────────────────────────────
    server.tool(
        "document_remove_extension",
        "Remove a vendor extension (x-* property) from a node",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the parent"),
            name: z.string().describe("Extension name to remove (must start with x-)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!name.startsWith("x-")) {
                return errorResult("Extension name must start with 'x-'");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);

            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteExtensionCommand(parent as any, name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                removed: true,
            });
        }),
    );

    // ── document_remove_response_header ─────────────────────────
    server.tool(
        "document_remove_response_header",
        "Remove a header from an OpenAPI response",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe("Node path to the response (e.g. /paths[/pets]/get/responses[200])"),
            name: z.string().describe("Header name to remove (e.g. X-Rate-Limit)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const response = Library.resolveNodePath(np, doc);

            if (response == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteResponseHeaderCommand(response as any, name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                header: name,
                removed: true,
            });
        }),
    );

    // ── document_add_schema_property ──────────────────────────────
    server.tool(
        "document_add_schema_property",
        "Add a named property to an object schema definition",
        {
            session: z.string().describe("Session name"),
            schemaName: z.string().describe("Name of the schema definition (e.g. Pet)"),
            propertyName: z.string().describe("Property name to add (e.g. status)"),
            schema: z.string().describe('JSON string with the property schema (e.g. {"type":"string"})'),
        },
        withErrorHandling(async (args) => {
            const { session, schemaName, propertyName, schema: schemaJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const propertySchema = JSON.parse(schemaJson);
            const command = CommandFactory.createAddSchemaPropertyCommand(
                schemaName,
                propertyName,
                propertySchema,
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                schemaName,
                propertyName,
                added: true,
            });
        }),
    );

    // ── document_remove_schema_property ───────────────────────────
    server.tool(
        "document_remove_schema_property",
        "Remove a named property from an object schema definition",
        {
            session: z.string().describe("Session name"),
            schemaName: z.string().describe("Name of the schema definition (e.g. Pet)"),
            propertyName: z.string().describe("Property name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, schemaName, propertyName } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteSchemaPropertyCommand(schemaName, propertyName);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                schemaName,
                propertyName,
                removed: true,
            });
        }),
    );

    // ── document_add_security_requirement ─────────────────────────
    server.tool(
        "document_add_security_requirement",
        "Add a security requirement to the document or to a specific operation",
        {
            session: z.string().describe("Session name"),
            requirement: z
                .string()
                .describe('JSON object mapping scheme names to scopes (e.g. {"bearerAuth":[]})'),
            path: z.string().optional().describe("API path (required if applying to an operation)"),
            method: z.string().optional().describe("HTTP method (required if applying to an operation)"),
        },
        withErrorHandling(async (args) => {
            const { session, requirement: reqJson, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const requirementObj = JSON.parse(reqJson);

            let command: ICommand;
            if (apiPath && method) {
                const operation = resolveOperation(doc, apiPath, method);
                if (isErrorResult(operation)) return operation;
                const parent = operation as any;
                const secReq = parent.createSecurityRequirement();
                Library.readNode(requirementObj, secReq);
                command = new AddSecurityRequirementCommand(parent, secReq);
            } else {
                const secReq = (doc as any).createSecurityRequirement();
                Library.readNode(requirementObj, secReq);
                command = new AddSecurityRequirementCommand(doc, secReq);
            }
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                scope: apiPath && method ? `${method.toUpperCase()} ${apiPath}` : "document",
                added: true,
            });
        }),
    );

    // ── document_add_example ──────────────────────────────────────
    server.tool(
        "document_add_example",
        "Add a named example to a media type, parameter, or header (OpenAPI 3.x)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the media type, parameter, or header"),
            name: z.string().describe("Example name"),
            value: z.string().describe("JSON string with the example value"),
            summary: z.string().optional().describe("Example summary"),
            description: z.string().optional().describe("Example description"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, value: valueJson, summary, description } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Named examples are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parentNode = Library.resolveNodePath(np, doc);
            if (parentNode == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const exampleValue = JSON.parse(valueJson);
            const command = new AddExampleCommand(
                parentNode,
                exampleValue,
                name,
                summary ?? null,
                description ?? null,
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                added: true,
            });
        }),
    );

    // ── document_set_operation_info ───────────────────────────────
    server.tool(
        "document_set_operation_info",
        "Set metadata properties on an operation (operationId, summary, description, deprecated)",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (get, post, put, delete, etc.)"),
            operationId: z.string().optional().describe("Operation ID"),
            summary: z.string().optional().describe("Operation summary"),
            description: z.string().optional().describe("Operation description"),
            deprecated: z.boolean().optional().describe("Whether the operation is deprecated"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, operationId, summary, description, deprecated } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) return operation;

            const commands: ICommand[] = [];
            if (operationId !== undefined) {
                commands.push(
                    CommandFactory.createChangePropertyCommand(operation as Node, "operationId", operationId),
                );
            }
            if (summary !== undefined) {
                commands.push(
                    CommandFactory.createChangePropertyCommand(operation as Node, "summary", summary),
                );
            }
            if (description !== undefined) {
                commands.push(
                    CommandFactory.createChangePropertyCommand(operation as Node, "description", description),
                );
            }
            if (deprecated !== undefined) {
                commands.push(
                    CommandFactory.createChangePropertyCommand(operation as Node, "deprecated", deprecated),
                );
            }

            if (commands.length > 0) {
                new AggregateCommand("set_operation_info", {}, commands).execute(doc);
                sessionManager.touchSession(session);
            }

            return successResult({
                session,
                path: apiPath,
                method: method.toLowerCase(),
                updated: {
                    ...(operationId !== undefined && { operationId }),
                    ...(summary !== undefined && { summary }),
                    ...(description !== undefined && { description }),
                    ...(deprecated !== undefined && { deprecated }),
                },
            });
        }),
    );

    // ── document_set_operation_tags ───────────────────────────────
    server.tool(
        "document_set_operation_tags",
        "Set the tags array on an operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets)"),
            method: z.string().describe("HTTP method (get, post, put, delete, etc.)"),
            tags: z.string().describe('JSON array of tag names (e.g. ["pets","admin"])'),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, tags: tagsJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) return operation;

            const tagsArray = JSON.parse(tagsJson);
            const command = CommandFactory.createChangePropertyCommand(operation as Node, "tags", tagsArray);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method.toLowerCase(),
                tags: tagsArray,
            });
        }),
    );

    // ── document_set_schema_required ──────────────────────────────
    server.tool(
        "document_set_schema_required",
        "Set the required array on a schema, controlling which properties are mandatory",
        {
            session: z.string().describe("Session name"),
            schemaName: z.string().describe("Name of the schema definition (e.g. Pet)"),
            required: z.string().describe('JSON array of required property names (e.g. ["id","name"])'),
        },
        withErrorHandling(async (args) => {
            const { session, schemaName, required: requiredJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Resolve schema definition by name — try OAS 3.x path, then OAS 2.0 path
            const schemaPath = ModelTypeUtil.isOpenApi2Model(doc)
                ? `/definitions[${schemaName}]`
                : `/components/schemas[${schemaName}]`;
            const schema = Library.resolveNodePath(NodePath.parse(schemaPath), doc);
            if (schema == null) {
                return errorResult(`Schema definition not found: ${schemaName}`);
            }

            const requiredArray = JSON.parse(requiredJson);
            const command = CommandFactory.createChangePropertyCommand(schema, "required", requiredArray);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                schemaName,
                required: requiredArray,
            });
        }),
    );

    // ── document_set_schema_type ──────────────────────────────────
    server.tool(
        "document_set_schema_type",
        "Set the type field on a schema (string, object, array, integer, number, boolean)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the schema"),
            type: z.string().describe("Schema type value (string, object, array, integer, number, boolean)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, type: schemaType } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const schema = Library.resolveNodePath(np, doc);
            if (schema == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createChangePropertyCommand(schema, "type", schemaType);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                type: schemaType,
            });
        }),
    );

    // ── document_add_schema_enum ──────────────────────────────────
    server.tool(
        "document_add_schema_enum",
        "Set enum values on a schema",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the schema"),
            values: z.string().describe('JSON array of enum values (e.g. ["active","inactive"])'),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, values: valuesJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const schema = Library.resolveNodePath(np, doc);
            if (schema == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const enumValues = JSON.parse(valuesJson);
            const command = CommandFactory.createChangePropertyCommand(schema, "enum", enumValues);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                enum: enumValues,
            });
        }),
    );

    // ── document_remove_all_security_requirements ────────────────
    server.tool(
        "document_remove_all_security_requirements",
        "Remove all security requirements from the document or from a specific operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().optional().describe("API path (if targeting an operation)"),
            method: z.string().optional().describe("HTTP method (if targeting an operation)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            let command: ICommand;
            if (apiPath && method) {
                const operation = resolveOperation(doc, apiPath, method);
                if (isErrorResult(operation)) return operation;
                command = CommandFactory.createDeleteAllOperationSecurityRequirementsCommand(
                    operation as any,
                );
            } else {
                command = CommandFactory.createDeleteAllDocumentSecurityRequirementsCommand(doc as any);
            }
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                scope: apiPath && method ? `${method.toUpperCase()} ${apiPath}` : "document",
                removed: true,
            });
        }),
    );

    // ── document_remove_media_type ───────────────────────────────
    server.tool(
        "document_remove_media_type",
        "Remove a specific media type from a request body or response",
        {
            session: z.string().describe("Session name"),
            nodePath: z
                .string()
                .describe(
                    "Node path to the media type (e.g. /paths[/pets]/post/requestBody/content[application/json])",
                ),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const mediaType = Library.resolveNodePath(np, doc);
            if (mediaType == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteMediaTypeCommand(mediaType as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );

    // ── document_add_parameter_definition ────────────────────────
    server.tool(
        "document_add_parameter_definition",
        "Add a reusable parameter definition to the document components",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Parameter definition name (e.g. pageSize, Authorization)"),
            parameter: z.string().describe("JSON string with the parameter definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, parameter: paramJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Ensure parameters container is initialized
            const pComp = (doc as any).getComponents?.();
            if (pComp && typeof pComp.getParameters === "function" && pComp.getParameters() == null) {
                const ph = pComp.createParameter();
                pComp.addParameter("__placeholder__", ph);
                pComp.removeParameter("__placeholder__");
            }

            const paramObj = JSON.parse(paramJson);
            const command = CommandFactory.createAddParameterDefinitionCommand(name, paramObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_parameter_definition ─────────────────────
    server.tool(
        "document_remove_parameter_definition",
        "Remove a reusable parameter definition from the document components",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Parameter definition name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteParameterDefinitionCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_add_header_definition ───────────────────────────
    server.tool(
        "document_add_header_definition",
        "Add a reusable header definition to the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Header definition name (e.g. X-Rate-Limit)"),
            header: z.string().describe("JSON string with the header definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, header: headerJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Header definitions are only supported in OpenAPI 3.x documents");
            }

            // Ensure headers container is initialized
            const hComp = (doc as any).getComponents?.();
            if (hComp && typeof hComp.getHeaders === "function" && hComp.getHeaders() == null) {
                const ph = hComp.createHeader();
                hComp.addHeader("__placeholder__", ph);
                hComp.removeHeader("__placeholder__");
            }

            const headerObj = JSON.parse(headerJson);
            const command = CommandFactory.createAddHeaderDefinitionCommand(name, headerObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_header_definition ────────────────────────
    server.tool(
        "document_remove_header_definition",
        "Remove a reusable header definition from the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Header definition name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Header definitions are only supported in OpenAPI 3.x documents");
            }

            const command = CommandFactory.createDeleteHeaderDefinitionCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_add_example_definition ──────────────────────────
    server.tool(
        "document_add_example_definition",
        "Add a reusable example definition to the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Example definition name"),
            example: z.string().describe("JSON string with the example definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, example: exampleJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Example definitions are only supported in OpenAPI 3.x documents");
            }

            // Ensure examples container is initialized
            const eComp = (doc as any).getComponents?.();
            if (eComp && typeof eComp.getExamples === "function" && eComp.getExamples() == null) {
                const ph = eComp.createExample();
                eComp.addExample("__placeholder__", ph);
                eComp.removeExample("__placeholder__");
            }

            const exampleObj = JSON.parse(exampleJson);
            const command = CommandFactory.createAddExampleDefinitionCommand(name, exampleObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_example_definition ───────────────────────
    server.tool(
        "document_remove_example_definition",
        "Remove a reusable example definition from the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Example definition name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Example definitions are only supported in OpenAPI 3.x documents");
            }

            const command = CommandFactory.createDeleteExampleDefinitionCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_add_request_body_definition ─────────────────────
    server.tool(
        "document_add_request_body_definition",
        "Add a reusable request body definition to the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Request body definition name"),
            requestBody: z.string().describe("JSON string with the request body definition"),
        },
        withErrorHandling(async (args) => {
            const { session, name, requestBody: reqBodyJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Request body definitions are only supported in OpenAPI 3.x documents");
            }

            // Ensure request bodies container is initialized
            const rbComp = (doc as any).getComponents?.();
            if (
                rbComp &&
                typeof rbComp.getRequestBodies === "function" &&
                rbComp.getRequestBodies() == null
            ) {
                const ph = rbComp.createRequestBody();
                rbComp.addRequestBody("__placeholder__", ph);
                rbComp.removeRequestBody("__placeholder__");
            }

            const reqBodyObj = JSON.parse(reqBodyJson);
            const command = CommandFactory.createAddRequestBodyDefinitionCommand(name, reqBodyObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_request_body_definition ──────────────────
    server.tool(
        "document_remove_request_body_definition",
        "Remove a reusable request body definition from the document components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Request body definition name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Request body definitions are only supported in OpenAPI 3.x documents");
            }

            const command = CommandFactory.createDeleteRequestBodyDefinitionCommand(name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                name,
                removed: true,
            });
        }),
    );

    // ── document_delete_contact ──────────────────────────────────
    server.tool(
        "document_delete_contact",
        "Remove the contact object from the document info",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            const info = Library.resolveNodePath(NodePath.parse("/info"), doc);
            if (info == null) {
                return errorResult("No info node found in the document");
            }

            const command = CommandFactory.createDeleteContactCommand(info as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                contactRemoved: true,
            });
        }),
    );

    // ── document_delete_license ──────────────────────────────────
    server.tool(
        "document_delete_license",
        "Remove the license object from the document info",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            const info = Library.resolveNodePath(NodePath.parse("/info"), doc);
            if (info == null) {
                return errorResult("No info node found in the document");
            }

            const command = CommandFactory.createDeleteLicenseCommand(info as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                licenseRemoved: true,
            });
        }),
    );

    // ── document_update_extension ────────────────────────────────
    server.tool(
        "document_update_extension",
        "Update the value of an existing vendor extension",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the parent node"),
            name: z.string().describe("Extension name (must start with x-)"),
            value: z.string().describe("JSON string with the new extension value"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, value: valueJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!name.startsWith("x-")) {
                return errorResult("Extension name must start with 'x-'");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const newValue = JSON.parse(valueJson);
            const command = CommandFactory.createChangeExtensionCommand(parent as any, name, newValue);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                updated: true,
            });
        }),
    );

    // ── document_remove_all_examples ─────────────────────────────
    server.tool(
        "document_remove_all_examples",
        "Remove all examples from a media type, parameter, or header",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the media type, parameter, or header"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const node = Library.resolveNodePath(np, doc);
            if (node == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            // Determine the correct delete command based on the parent node type
            const nodeJson = Library.writeNode(node);
            let command: ICommand;
            if ((nodeJson as any).content !== undefined) {
                // MediaType parent (has content property → likely wrong, try as media type itself)
                command = CommandFactory.createDeleteAllMediaTypeExamplesCommand(node as any);
            } else if ((nodeJson as any).in !== undefined) {
                command = CommandFactory.createDeleteAllParameterExamplesCommand(node as any);
            } else {
                // Try as header or fall back to media type
                command = CommandFactory.createDeleteAllMediaTypeExamplesCommand(node as any);
            }
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );

    // ── document_rename_path ─────────────────────────────────────
    server.tool(
        "document_rename_path",
        "Rename a path, preserving all operations and configuration",
        {
            session: z.string().describe("Session name"),
            oldPath: z.string().describe("Current path string (e.g. /users)"),
            newPath: z.string().describe("New path string (e.g. /accounts)"),
        },
        withErrorHandling(async (args) => {
            const { session, oldPath, newPath } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Resolve and serialize the old path item before deleting
            const oldPathNode = resolvePathItem(doc, oldPath);
            if (isErrorResult(oldPathNode)) return oldPathNode;
            const pathItemJson = Library.writeNode(oldPathNode as Node);

            // Delete the old path
            const deleteCmd = CommandFactory.createDeletePathCommand(oldPath);
            deleteCmd.execute(doc);

            // Add the new path with the serialized content
            const addCmd = CommandFactory.createAddPathItemCommand(newPath, pathItemJson as any);
            addCmd.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                oldPath,
                newPath,
                renamed: true,
            });
        }),
    );

    // ── document_rename_schema ───────────────────────────────────
    server.tool(
        "document_rename_schema",
        "Rename a schema definition and update all $ref references throughout the document",
        {
            session: z.string().describe("Session name"),
            oldName: z.string().describe("Current schema name"),
            newName: z.string().describe("New schema name"),
        },
        withErrorHandling(async (args) => {
            const { session, oldName, newName } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createRenameSchemaDefinitionCommand(oldName, newName);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                oldName,
                newName,
                renamed: true,
            });
        }),
    );

    // ── document_copy_operation ──────────────────────────────────
    server.tool(
        "document_copy_operation",
        "Copy an operation from one path/method to another",
        {
            session: z.string().describe("Session name"),
            sourcePath: z.string().describe("Source API path"),
            sourceMethod: z.string().describe("Source HTTP method"),
            targetPath: z.string().describe("Target API path"),
            targetMethod: z.string().describe("Target HTTP method"),
        },
        withErrorHandling(async (args) => {
            const { session, sourcePath, sourceMethod, targetPath, targetMethod } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Resolve and serialize the source operation
            const sourceOp = resolveOperation(doc, sourcePath, sourceMethod);
            if (isErrorResult(sourceOp)) return sourceOp;
            const sourceJson = Library.writeNode(sourceOp as Node);

            // Resolve the target path item
            const targetPathItem = resolvePathItem(doc, targetPath);
            if (isErrorResult(targetPathItem)) return targetPathItem;

            // Create an empty operation at the target
            const createCmd = CommandFactory.createCreateOperationCommand(
                targetPathItem as any,
                targetMethod.toLowerCase(),
            );
            createCmd.execute(doc);

            // Resolve the newly created target operation and populate it
            const targetOp = Library.resolveNodePath(
                NodePath.parse(`/paths[${targetPath}]/${targetMethod.toLowerCase()}`),
                doc,
            );
            if (targetOp != null) {
                const clearVisitor = new ClearNodeVisitor();
                targetOp.accept(clearVisitor);
                Library.readNode(sourceJson, targetOp);
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                source: `${sourceMethod.toUpperCase()} ${sourcePath}`,
                target: `${targetMethod.toUpperCase()} ${targetPath}`,
                copied: true,
            });
        }),
    );

    // ── document_move_operation ──────────────────────────────────
    server.tool(
        "document_move_operation",
        "Move an operation from one path/method to another",
        {
            session: z.string().describe("Session name"),
            sourcePath: z.string().describe("Source API path"),
            sourceMethod: z.string().describe("Source HTTP method"),
            targetPath: z.string().describe("Target API path"),
            targetMethod: z.string().describe("Target HTTP method"),
        },
        withErrorHandling(async (args) => {
            const { session, sourcePath, sourceMethod, targetPath, targetMethod } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // Resolve and serialize the source operation
            const sourceOp = resolveOperation(doc, sourcePath, sourceMethod);
            if (isErrorResult(sourceOp)) return sourceOp;
            const sourceJson = Library.writeNode(sourceOp as Node);

            // Resolve the target path item
            const targetPathItem = resolvePathItem(doc, targetPath);
            if (isErrorResult(targetPathItem)) return targetPathItem;

            // Create an empty operation at the target
            const createCmd = CommandFactory.createCreateOperationCommand(
                targetPathItem as any,
                targetMethod.toLowerCase(),
            );
            createCmd.execute(doc);

            // Populate the target operation with source content
            const targetOp = Library.resolveNodePath(
                NodePath.parse(`/paths[${targetPath}]/${targetMethod.toLowerCase()}`),
                doc,
            );
            if (targetOp != null) {
                const clearVisitor = new ClearNodeVisitor();
                targetOp.accept(clearVisitor);
                Library.readNode(sourceJson, targetOp);
            }

            // Delete the source operation
            const sourcePathItem = resolvePathItem(doc, sourcePath);
            if (!isErrorResult(sourcePathItem)) {
                const deleteCmd = CommandFactory.createDeleteOperationCommand(
                    sourcePathItem as any,
                    sourceMethod.toLowerCase(),
                );
                deleteCmd.execute(doc);
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                source: `${sourceMethod.toUpperCase()} ${sourcePath}`,
                target: `${targetMethod.toUpperCase()} ${targetPath}`,
                moved: true,
            });
        }),
    );

    // ── document_add_callback ────────────────────────────────────
    server.tool(
        "document_add_callback",
        "Add a callback definition to an operation or to components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the operation or components"),
            name: z.string().describe("Callback name"),
            callback: z.string().optional().describe("JSON string with the callback definition"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, callback: callbackJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Callbacks are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const callbackObj = callbackJson ? JSON.parse(callbackJson) : {};
            const command = CommandFactory.createAddCallbackCommand(parent, name, callbackObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_callback ─────────────────────────────────
    server.tool(
        "document_remove_callback",
        "Remove a callback from an operation or components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the operation or components"),
            name: z.string().describe("Callback name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Callbacks are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteCallbackCommand(parent, name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                removed: true,
            });
        }),
    );

    // ── document_add_link ────────────────────────────────────────
    server.tool(
        "document_add_link",
        "Add a link to a response or to components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the response or components"),
            name: z.string().describe("Link name"),
            link: z.string().describe("JSON string with the link definition"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, link: linkJson } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Links are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const linkObj = JSON.parse(linkJson);
            const command = CommandFactory.createAddLinkCommand(parent, name, linkObj);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_link ─────────────────────────────────────
    server.tool(
        "document_remove_link",
        "Remove a link from a response or components (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the response or components"),
            name: z.string().describe("Link name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Links are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteLinkCommand(parent, name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                removed: true,
            });
        }),
    );

    // ── document_set_external_docs ───────────────────────────────
    server.tool(
        "document_set_external_docs",
        "Set external documentation on a node (document, tag, operation, or schema)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().optional().describe("Node path to the target; omit for document level"),
            url: z.string().describe("External documentation URL"),
            description: z.string().optional().describe("Description of the external docs"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, url, description } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            let parent: Node;
            if (nodePathStr) {
                const np = NodePath.parse(nodePathStr);
                const resolved = Library.resolveNodePath(np, doc);
                if (resolved == null) {
                    return errorResult(`No node found at path: ${nodePathStr}`);
                }
                parent = resolved;
            } else {
                parent = doc;
            }

            const command = CommandFactory.createSetExternalDocsCommand(parent, url, description ?? "");
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr ?? "/",
                url,
                description: description ?? "",
                set: true,
            });
        }),
    );

    // ── document_add_server_variable ─────────────────────────────
    server.tool(
        "document_add_server_variable",
        "Add a variable to a server definition (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the server"),
            name: z.string().describe("Variable name (e.g. environment)"),
            default: z.string().describe("Default value"),
            description: z.string().optional().describe("Variable description"),
            enum: z.string().optional().describe("JSON array of allowed values"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name, default: defaultValue, description } = args;
            const enumJson = args.enum;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Server variables are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const server = Library.resolveNodePath(np, doc);
            if (server == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const enumValues: string[] = enumJson ? JSON.parse(enumJson) : [];
            const command = CommandFactory.createAddServerVariableCommand(
                server as any,
                name,
                defaultValue,
                description ?? "",
                enumValues,
            );
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                added: true,
            });
        }),
    );

    // ── document_remove_server_variable ──────────────────────────
    server.tool(
        "document_remove_server_variable",
        "Remove a variable from a server definition (OpenAPI 3.x only)",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the server"),
            name: z.string().describe("Variable name to remove"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            if (ModelTypeUtil.isOpenApi2Model(doc)) {
                return errorResult("Server variables are only supported in OpenAPI 3.x documents");
            }

            const np = NodePath.parse(nodePathStr);
            const server = Library.resolveNodePath(np, doc);
            if (server == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteServerVariableCommand(server as any, name);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                name,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_operations ───────────────────────────
    server.tool(
        "document_remove_all_operations",
        "Remove all operations from a path item",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const pathItem = resolvePathItem(doc, apiPath);
            if (isErrorResult(pathItem)) return pathItem;

            const command = CommandFactory.createDeleteAllPathItemOperationsCommand(pathItem as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_responses ────────────────────────────
    server.tool(
        "document_remove_all_responses",
        "Remove all responses from an operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path"),
            method: z.string().describe("HTTP method"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const operation = resolveOperation(doc, apiPath, method);
            if (isErrorResult(operation)) return operation;

            const command = CommandFactory.createDeleteAllResponsesCommand(operation as any);
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

    // ── document_remove_all_parameters ───────────────────────────
    server.tool(
        "document_remove_all_parameters",
        "Remove all parameters (or parameters of a specific type) from a path item or operation",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path"),
            method: z.string().optional().describe("HTTP method (omit for path-item level)"),
            type: z.string().optional().describe("Parameter type filter (query, header, path, cookie)"),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method, type: paramType } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            // The library command filters by type, so when no type is specified we must
            // invoke it once per standard parameter location to remove all parameters.
            const types = paramType ? [paramType] : ["query", "header", "path", "cookie"];

            for (const t of types) {
                let command: ICommand;
                if (method) {
                    const operation = resolveOperation(doc, apiPath, method);
                    if (isErrorResult(operation)) return operation;
                    command = CommandFactory.createDeleteAllOperationParametersCommand(operation as any, t);
                } else {
                    const pathItem = resolvePathItem(doc, apiPath);
                    if (isErrorResult(pathItem)) return pathItem;
                    command = CommandFactory.createDeleteAllPathItemParametersCommand(pathItem as any, t);
                }
                command.execute(doc);
            }

            sessionManager.touchSession(session);

            return successResult({
                session,
                path: apiPath,
                method: method?.toUpperCase(),
                type: paramType,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_response_headers ─────────────────────
    server.tool(
        "document_remove_all_response_headers",
        "Remove all headers from a response",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the response"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const np = NodePath.parse(nodePathStr);
            const response = Library.resolveNodePath(np, doc);
            if (response == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = CommandFactory.createDeleteAllResponseHeadersCommand(response as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_schema_properties ────────────────────
    server.tool(
        "document_remove_all_schema_properties",
        "Remove all properties from a schema",
        {
            session: z.string().describe("Session name"),
            schemaName: z.string().describe("Schema name"),
        },
        withErrorHandling(async (args) => {
            const { session, schemaName } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const schemaPath = ModelTypeUtil.isOpenApi2Model(doc)
                ? `/definitions[${schemaName}]`
                : `/components/schemas[${schemaName}]`;
            const schema = Library.resolveNodePath(NodePath.parse(schemaPath), doc);
            if (schema == null) {
                return errorResult(`Schema not found: ${schemaName}`);
            }

            const command = CommandFactory.createDeleteAllPropertiesCommand(schema as any);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                schemaName,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_servers ──────────────────────────────
    server.tool(
        "document_remove_all_servers",
        "Remove all servers from the document, a path item, or an operation",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().optional().describe("Node path; omit for document level"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            let command: ICommand;
            if (nodePathStr) {
                const np = NodePath.parse(nodePathStr);
                const node = Library.resolveNodePath(np, doc);
                if (node == null) {
                    return errorResult(`No node found at path: ${nodePathStr}`);
                }
                // Determine if this is a path item or operation based on the path structure
                const segments = nodePathStr.split("/").filter((s: string) => s.length > 0);
                if (segments.length > 1 && HTTP_METHODS.includes(segments[segments.length - 1] as any)) {
                    command = CommandFactory.createDeleteAllOperationServersCommand(node as any);
                } else {
                    command = CommandFactory.createDeleteAllPathItemServersCommand(node as any);
                }
            } else {
                command = CommandFactory.createDeleteAllDocumentServersCommand(doc as any);
            }
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr ?? "/",
                removed: true,
            });
        }),
    );

    // ── document_remove_all_tags ─────────────────────────────────
    server.tool(
        "document_remove_all_tags",
        "Remove all tag definitions from the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteAllTagsCommand();
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_security_schemes ─────────────────────
    server.tool(
        "document_remove_all_security_schemes",
        "Remove all security scheme definitions from the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (!ModelTypeUtil.isOpenApiModel(doc)) {
                return errorResult("This operation is only supported for OpenAPI documents");
            }

            const command = CommandFactory.createDeleteAllSecuritySchemesCommand();
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                removed: true,
            });
        }),
    );

    // ── document_remove_all_extensions ───────────────────────────
    server.tool(
        "document_remove_all_extensions",
        "Remove all vendor extensions from a node",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path to the node"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            const np = NodePath.parse(nodePathStr);
            const parent = Library.resolveNodePath(np, doc);
            if (parent == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            const command = new DeleteAllExtensionsCommand(parent);
            command.execute(doc);

            sessionManager.touchSession(session);

            return successResult({
                session,
                nodePath: nodePathStr,
                removed: true,
            });
        }),
    );
}
