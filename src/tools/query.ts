import { Library, ModelTypeUtil, NodePath, TraverserDirection } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { fromLibModelType } from "../util/model-type-map.js";
import { DocumentInfoVisitor } from "../visitors/DocumentInfoVisitor.js";
import { OperationCollectorVisitor } from "../visitors/OperationCollectorVisitor.js";
import { PathCollectorVisitor } from "../visitors/PathCollectorVisitor.js";
import { SchemaCollectorVisitor } from "../visitors/SchemaCollectorVisitor.js";
import { SecuritySchemeCollectorVisitor } from "../visitors/SecuritySchemeCollectorVisitor.js";
import { ServerCollectorVisitor } from "../visitors/ServerCollectorVisitor.js";
import { TagCollectorVisitor } from "../visitors/TagCollectorVisitor.js";

/**
 * Get document info (shared helper used by both tools and resources).
 *
 * @param sessionName the session to query
 * @returns document metadata including title, version, and counts
 */
export function getDocumentInfo(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;
    const modelType = fromLibModelType(entry.modelType);

    const visitor = new DocumentInfoVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    const result: any = {
        session: sessionName,
        modelType,
        title: visitor.title,
        description: visitor.description,
        version: visitor.version,
    };

    if (ModelTypeUtil.isOpenApiModel(doc)) {
        result.pathCount = visitor.pathCount;
        result.schemaCount = visitor.schemaCount;
    } else if (ModelTypeUtil.isAsyncApiModel(doc)) {
        result.channelCount = visitor.channelCount;
    }

    return result;
}

/**
 * Get list of paths/channels (shared helper).
 *
 * @param sessionName the session to query
 * @returns paths or channels with their operations
 */
export function getDocumentPaths(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new PathCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    if (ModelTypeUtil.isOpenApiModel(doc)) {
        return { session: sessionName, paths: visitor.paths };
    } else if (ModelTypeUtil.isAsyncApiModel(doc)) {
        return { session: sessionName, channels: visitor.channels };
    }

    return { session: sessionName, paths: [] };
}

/**
 * Get list of schema definitions (shared helper).
 *
 * @param sessionName the session to query
 * @returns schema definition names
 */
export function getDocumentSchemas(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new SchemaCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    return { session: sessionName, schemas: visitor.schemas };
}

/**
 * Get list of all operations across the document (shared helper).
 *
 * @param sessionName the session to query
 * @returns operations (OpenAPI) or asyncOperations (AsyncAPI)
 */
export function getDocumentOperations(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new OperationCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    if (ModelTypeUtil.isOpenApiModel(doc)) {
        return { session: sessionName, operations: visitor.operations };
    } else if (ModelTypeUtil.isAsyncApiModel(doc)) {
        return { session: sessionName, operations: visitor.asyncOperations };
    }

    return { session: sessionName, operations: [] };
}

/**
 * Get list of security schemes (shared helper).
 *
 * @param sessionName the session to query
 * @returns security scheme entries
 */
export function getDocumentSecuritySchemes(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new SecuritySchemeCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    return { session: sessionName, securitySchemes: visitor.securitySchemes };
}

/**
 * Get list of servers (shared helper).
 *
 * @param sessionName the session to query
 * @returns server entries
 */
export function getDocumentServers(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new ServerCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    return { session: sessionName, servers: visitor.servers };
}

/**
 * Get list of tags (shared helper).
 *
 * @param sessionName the session to query
 * @returns tag entries
 */
export function getDocumentTags(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    const visitor = new TagCollectorVisitor();
    Library.visitTree(doc, visitor, TraverserDirection.down);

    return { session: sessionName, tags: visitor.tags };
}

/**
 * Register all query tools on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerQueryTools(server: McpServer): void {
    // ── document_get_info ──────────────────────────────────────────
    server.tool(
        "document_get_info",
        "Get document overview: type, title, version, path/schema counts",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentInfo(args.session));
        }),
    );

    // ── document_list_paths ────────────────────────────────────────
    server.tool(
        "document_list_paths",
        "List all paths (OpenAPI) or channels (AsyncAPI) with their operations",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentPaths(args.session));
        }),
    );

    // ── document_get_operation ──────────────────────────────────────
    server.tool(
        "document_get_operation",
        "Get full details of a specific operation by path and HTTP method",
        {
            session: z.string().describe("Session name"),
            path: z.string().describe("The API path (e.g. /pets/{petId})"),
            method: z
                .string()
                .optional()
                .describe(
                    "HTTP method (get, post, put, etc.); if omitted, returns all operations on the path",
                ),
        },
        withErrorHandling(async (args) => {
            const { session, path: apiPath, method } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            if (ModelTypeUtil.isOpenApiModel(doc)) {
                // Resolve the path item directly via NodePath
                const pathItemPath = NodePath.parse(`/paths[${apiPath}]`);
                const pathItem = Library.resolveNodePath(pathItemPath, doc);
                if (!pathItem) {
                    return errorResult(`Path not found: ${apiPath}`);
                }

                if (method) {
                    const opPath = NodePath.parse(`/paths[${apiPath}]/${method.toLowerCase()}`);
                    const op = Library.resolveNodePath(opPath, doc);
                    if (!op) {
                        return errorResult(`No ${method.toUpperCase()} operation on path ${apiPath}`);
                    }
                    return successResult({
                        session,
                        path: apiPath,
                        method: method.toUpperCase(),
                        operation: Library.writeNode(op),
                    });
                }

                // Return all operations on this path
                const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch"] as const;
                const operations: any = {};
                for (const m of httpMethods) {
                    const opPath = NodePath.parse(`/paths[${apiPath}]/${m}`);
                    const op = Library.resolveNodePath(opPath, doc);
                    if (op != null) {
                        operations[m.toUpperCase()] = Library.writeNode(op);
                    }
                }
                return successResult({
                    session,
                    path: apiPath,
                    operations,
                });
            } else if (ModelTypeUtil.isAsyncApiModel(doc)) {
                const channelPath = NodePath.parse(`/channels[${apiPath}]`);
                const channel = Library.resolveNodePath(channelPath, doc);
                if (!channel) {
                    return errorResult(`Channel not found: ${apiPath}`);
                }
                return successResult({
                    session,
                    channel: apiPath,
                    definition: Library.writeNode(channel),
                });
            }

            return errorResult("Unsupported document type for this operation");
        }),
    );

    // ── document_list_schemas ──────────────────────────────────────
    server.tool(
        "document_list_schemas",
        "List all schema/component definitions in the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentSchemas(args.session));
        }),
    );

    // ── document_get_node ──────────────────────────────────────────
    server.tool(
        "document_get_node",
        "Get any node by its node path (e.g. /paths[/pets]/get, /info, /components/schemas[Pet])",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().describe("Node path string (e.g. /info, /paths[/pets]/get)"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);
            const np = NodePath.parse(nodePathStr);
            const node = Library.resolveNodePath(np, entry.document);

            if (node == null) {
                return errorResult(`No node found at path: ${nodePathStr}`);
            }

            return successResult({
                session,
                nodePath: nodePathStr,
                node: Library.writeNode(node),
            });
        }),
    );

    // ── document_list_operations ──────────────────────────────────
    server.tool(
        "document_list_operations",
        "List all operations across the entire document with path, method, operationId, summary, and tags",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentOperations(args.session));
        }),
    );

    // ── document_get_schema ───────────────────────────────────────
    server.tool(
        "document_get_schema",
        "Get a specific schema definition by name with its full content",
        {
            session: z.string().describe("Session name"),
            name: z.string().describe("Schema name (e.g. Pet, Error)"),
        },
        withErrorHandling(async (args) => {
            const { session, name } = args;
            const entry = sessionManager.getSession(session);
            const doc = entry.document;

            // Try OAS 2.0 path first, then OAS 3.x / AsyncAPI path
            let schemaNode = Library.resolveNodePath(NodePath.parse(`/definitions[${name}]`), doc);
            if (schemaNode == null) {
                schemaNode = Library.resolveNodePath(NodePath.parse(`/components/schemas[${name}]`), doc);
            }
            if (schemaNode == null) {
                return errorResult(`Schema not found: ${name}`);
            }

            return successResult({
                session,
                name,
                schema: Library.writeNode(schemaNode),
            });
        }),
    );

    // ── document_list_security_schemes ─────────────────────────────
    server.tool(
        "document_list_security_schemes",
        "List all security scheme definitions in the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentSecuritySchemes(args.session));
        }),
    );

    // ── document_list_servers ──────────────────────────────────────
    server.tool(
        "document_list_servers",
        "List all server definitions in the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentServers(args.session));
        }),
    );

    // ── document_list_tags ────────────────────────────────────────
    server.tool(
        "document_list_tags",
        "List all tag definitions in the document",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            return successResult(getDocumentTags(args.session));
        }),
    );
}
