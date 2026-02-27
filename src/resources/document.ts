import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sessionManager } from "../session-manager.js";
import { getDocumentInfo, getDocumentPaths, getDocumentSchemas } from "../tools/query.js";

/**
 * Helper to build a list callback that enumerates all sessions for a given resource suffix.
 */
function listForSuffix(suffix: string, labelFn: (name: string) => string) {
    return async () => ({
        resources: sessionManager.listSessions().map((s) => ({
            uri: `api://${s.name}/${suffix}`,
            name: labelFn(s.name),
        })),
    });
}

/**
 * Register all MCP resources on the given server.
 *
 * @param server the MCP server instance
 */
export function registerResources(server: McpServer): void {
    // ── api://{session}/info ───────────────────────────────────────
    server.resource(
        "document-info",
        new ResourceTemplate("api://{session}/info", {
            list: listForSuffix("info", (name) => `${name} - Document Info`),
        }),
        { description: "Document metadata (title, version, type)" },
        async (uri, variables) => {
            const session = variables.session as string;
            const info = getDocumentInfo(session);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(info, null, 2),
                    },
                ],
            };
        },
    );

    // ── api://{session}/paths ──────────────────────────────────────
    server.resource(
        "document-paths",
        new ResourceTemplate("api://{session}/paths", {
            list: listForSuffix("paths", (name) => `${name} - Paths/Channels`),
        }),
        { description: "List of paths (OpenAPI) or channels (AsyncAPI)" },
        async (uri, variables) => {
            const session = variables.session as string;
            const paths = getDocumentPaths(session);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(paths, null, 2),
                    },
                ],
            };
        },
    );

    // ── api://{session}/schemas ────────────────────────────────────
    server.resource(
        "document-schemas",
        new ResourceTemplate("api://{session}/schemas", {
            list: listForSuffix("schemas", (name) => `${name} - Schema Definitions`),
        }),
        { description: "List of schema/component definitions" },
        async (uri, variables) => {
            const session = variables.session as string;
            const schemas = getDocumentSchemas(session);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(schemas, null, 2),
                    },
                ],
            };
        },
    );
}
