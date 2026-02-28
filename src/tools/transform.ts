import { Library } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { ALL_MODEL_TYPES, fromLibModelType, type ModelType, toLibModelType } from "../util/model-type-map.js";

/**
 * Register all transformation tools on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerTransformTools(server: McpServer): void {
    // ── document_transform ─────────────────────────────────────────
    server.tool(
        "document_transform",
        "Convert an OpenAPI document between spec versions (e.g. OpenAPI 2.0 -> 3.0, 3.0 -> 3.1)",
        {
            session: z.string().describe("Session name"),
            targetType: z
                .enum(ALL_MODEL_TYPES as [string, ...string[]])
                .describe("Target document type (e.g. openapi3)"),
        },
        withErrorHandling(async (args) => {
            const { session, targetType } = args;
            const entry = sessionManager.getSession(session);
            const sourceType = fromLibModelType(entry.modelType);
            const targetLibModelType = toLibModelType(targetType as ModelType);

            try {
                const transformed = Library.transformDocument(entry.document, targetLibModelType);
                entry.document = transformed;
                entry.modelType = (transformed as any).modelType();
                sessionManager.touchSession(session);

                return successResult({
                    session,
                    sourceType,
                    targetType,
                    transformed: true,
                });
            } catch (e: any) {
                return errorResult(
                    `Transformation from ${sourceType} to ${targetType} is not supported: ${e.message}`,
                );
            }
        }),
    );

    // ── document_dereference ───────────────────────────────────────
    server.tool(
        "document_dereference",
        "Resolve all $ref references in the document, pulling external references inline",
        {
            session: z.string().describe("Session name"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            const entry = sessionManager.getSession(session);

            const dereferenced = Library.dereferenceDocument(entry.document);
            entry.document = dereferenced;
            entry.modelType = (dereferenced as any).modelType();
            sessionManager.touchSession(session);

            return successResult({
                session,
                dereferenced: true,
            });
        }),
    );
}
