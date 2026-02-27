import {
    AaiDocument,
    Library,
    NodePath,
    Oas20Document,
    Oas30Document,
    OasDocument,
} from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { fromDocumentType } from "../util/model-type-map.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

/**
 * Get document info (shared helper used by both tools and resources).
 */
export function getDocumentInfo(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;
    const modelType = fromDocumentType(entry.modelType);

    const result: any = {
        session: sessionName,
        modelType,
        title: doc.info?.title ?? null,
        description: doc.info?.description ?? null,
        version: doc.info?.version ?? null,
    };

    if (doc instanceof OasDocument) {
        const paths = doc.paths;
        result.pathCount = paths?.getPathItems()?.length ?? 0;
        if (doc instanceof Oas20Document) {
            result.schemaCount = doc.definitions?.getDefinitions()?.length ?? 0;
        } else if (doc instanceof Oas30Document) {
            result.schemaCount = doc.components?.getSchemaDefinitions()?.length ?? 0;
        }
    } else if (doc instanceof AaiDocument) {
        result.channelCount = doc.getChannels()?.length ?? 0;
    }

    return result;
}

/**
 * Get list of paths/channels (shared helper).
 */
export function getDocumentPaths(sessionName: string): any {
    const entry = sessionManager.getSession(sessionName);
    const doc = entry.document;

    if (doc instanceof OasDocument) {
        const paths = doc.paths;
        if (!paths) {
            return { session: sessionName, paths: [] };
        }
        const pathItems = paths.getPathItems() ?? [];
        const result = pathItems.map((pi) => {
            const methods: string[] = [];
            for (const method of HTTP_METHODS) {
                if ((pi as any)[method] != null) {
                    methods.push(method.toUpperCase());
                }
            }
            return { path: pi.getPath(), methods };
        });
        return { session: sessionName, paths: result };
    } else if (doc instanceof AaiDocument) {
        const channels = doc.getChannels() ?? [];
        const result = channels.map((ch) => {
            const operations: string[] = [];
            if ((ch as any).publish != null) operations.push("publish");
            if ((ch as any).subscribe != null) operations.push("subscribe");
            return { channel: (ch as any)._name ?? (ch as any)._path, operations };
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

    if (doc instanceof Oas20Document) {
        const names = doc.definitions?.getDefinitionNames() ?? [];
        return { session: sessionName, schemas: names };
    } else if (doc instanceof Oas30Document) {
        const names = doc.components?.getSchemaDefinitionNames() ?? [];
        return { session: sessionName, schemas: names };
    } else if (doc instanceof AaiDocument) {
        const components = doc.components;
        if (components) {
            const schemas = (components as any).schemas;
            if (schemas && typeof schemas === "object") {
                return { session: sessionName, schemas: Object.keys(schemas) };
            }
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

            if (doc instanceof OasDocument) {
                const paths = doc.paths;
                if (!paths) {
                    return errorResult(`No paths defined in document`);
                }
                const pathItem = paths.getPathItem(apiPath);
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
            } else if (doc instanceof AaiDocument) {
                const channels = doc.getChannels() ?? [];
                const channel = channels.find((ch) => (ch as any)._name === apiPath);
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
            const np = new NodePath(nodePathStr);
            const node = np.resolve(entry.document);

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
