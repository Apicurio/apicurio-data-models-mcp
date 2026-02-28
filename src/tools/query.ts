import {
    type Document,
    type ModelType as LibModelType,
    Library,
    NodePath,
    OpenApi20DocumentImpl,
    OpenApi30DocumentImpl,
} from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { fromLibModelType } from "../util/model-type-map.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

/**
 * Check whether the document is an OpenAPI document (any version).
 */
function isOpenApi(doc: Document): boolean {
    const mt = (doc as any).modelType() as LibModelType;
    // OPENAPI20=8, OPENAPI30=9, OPENAPI31=10
    return mt >= 8 && mt <= 10;
}

/**
 * Check whether the document is an AsyncAPI document (any version).
 */
function isAsyncApi(doc: Document): boolean {
    const mt = (doc as any).modelType() as LibModelType;
    // ASYNCAPI20=0 through ASYNCAPI30=7
    return mt >= 0 && mt <= 7;
}

/**
 * Get document info (shared helper used by both tools and resources).
 */
export function getDocumentInfo(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;
    const modelType = fromLibModelType(entry.modelType);

    const info = doc.getInfo();
    const result: any = {
        session: sessionName,
        modelType,
        title: info?.getTitle() ?? null,
        description: info?.getDescription() ?? null,
        version: info?.getVersion() ?? null,
    };

    if (isOpenApi(doc)) {
        const paths = (doc as any).getPaths();
        result.pathCount = paths?.getItems()?.length ?? 0;
        if (doc instanceof OpenApi20DocumentImpl) {
            result.schemaCount = doc.getDefinitions()?.getItems()?.length ?? 0;
        } else if (doc instanceof OpenApi30DocumentImpl) {
            const schemas = doc.getComponents()?.getSchemas();
            result.schemaCount = schemas ? Object.keys(schemas).length : 0;
        }
    } else if (isAsyncApi(doc)) {
        const channels = (doc as any).getChannels();
        result.channelCount = channels?.getItems()?.length ?? 0;
    }

    return result;
}

/**
 * Get list of paths/channels (shared helper).
 */
export function getDocumentPaths(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    if (isOpenApi(doc)) {
        const paths = (doc as any).getPaths();
        if (!paths) {
            return { session: sessionName, paths: [] };
        }
        const pathNames = paths.getItemNames() ?? [];
        const result = pathNames.map((name: string) => {
            const pi = paths.getItem(name);
            const methods: string[] = [];
            for (const method of HTTP_METHODS) {
                if ((pi as any)[method] != null) {
                    methods.push(method.toUpperCase());
                }
            }
            return { path: name, methods };
        });
        return { session: sessionName, paths: result };
    } else if (isAsyncApi(doc)) {
        const channels = (doc as any).getChannels();
        if (!channels) {
            return { session: sessionName, channels: [] };
        }
        const channelNames = channels.getItemNames() ?? [];
        const result = channelNames.map((name: string) => {
            const ch = channels.getItem(name);
            const operations: string[] = [];
            if ((ch as any).publish != null) operations.push("publish");
            if ((ch as any).subscribe != null) operations.push("subscribe");
            return { channel: name, operations };
        });
        return { session: sessionName, channels: result };
    }

    return { session: sessionName, paths: [] };
}

/**
 * Get list of schema definitions (shared helper).
 */
export function getDocumentSchemas(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    if (doc instanceof OpenApi20DocumentImpl) {
        const names = doc.getDefinitions()?.getItemNames() ?? [];
        return { session: sessionName, schemas: names };
    } else if (doc instanceof OpenApi30DocumentImpl) {
        const schemas = doc.getComponents()?.getSchemas();
        const names = schemas ? Object.keys(schemas) : [];
        return { session: sessionName, schemas: names };
    } else if (isAsyncApi(doc)) {
        const components = (doc as any).getComponents();
        if (components) {
            const schemas = components.getSchemas();
            const names = schemas ? Object.keys(schemas) : [];
            return { session: sessionName, schemas: names };
        }
        return { session: sessionName, schemas: [] };
    }

    return { session: sessionName, schemas: [] };
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

            if (isOpenApi(doc)) {
                const paths = (doc as any).getPaths();
                if (!paths) {
                    return errorResult(`No paths defined in document`);
                }
                const pathItem = paths.getItem(apiPath);
                if (!pathItem) {
                    return errorResult(`Path not found: ${apiPath}`);
                }

                if (method) {
                    const op = (pathItem as any)[method.toLowerCase()];
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
                const operations: any = {};
                for (const m of HTTP_METHODS) {
                    const op = (pathItem as any)[m];
                    if (op != null) {
                        operations[m.toUpperCase()] = Library.writeNode(op);
                    }
                }
                return successResult({
                    session,
                    path: apiPath,
                    operations,
                });
            } else if (isAsyncApi(doc)) {
                const channels = (doc as any).getChannels();
                if (!channels) {
                    return errorResult(`No channels defined in document`);
                }
                const channel = channels.getItem(apiPath);
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
}
