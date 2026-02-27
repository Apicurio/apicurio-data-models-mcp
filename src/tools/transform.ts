import { Library, type Oas20Document } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { ALL_MODEL_TYPES, fromDocumentType, type ModelType, toDocumentType } from "../util/model-type-map.js";

/**
 * Register all transformation tools on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerTransformTools(server: McpServer): void {
    // ── document_transform ─────────────────────────────────────────
    server.tool(
        "document_transform",
        "Convert an OpenAPI document between spec versions (currently supports: OpenAPI 2.0 -> 3.0)",
        {
            session: z.string().describe("Session name"),
            targetType: z
                .enum(ALL_MODEL_TYPES as [string, ...string[]])
                .describe("Target document type (e.g. openapi3)"),
        },
        withErrorHandling(async (args) => {
            const { session, targetType } = args;
            const entry = sessionManager.getSession(session);
            const sourceType = fromDocumentType(entry.modelType);
            const _targetDocType = toDocumentType(targetType as ModelType);

            // Validate the transformation is supported
            if (sourceType === "openapi2" && targetType === "openapi3") {
                const transformed = Library.transformDocument(entry.document as Oas20Document);
                entry.document = transformed;
                entry.modelType = transformed.getDocumentType();
                sessionManager.touchSession(session);

                return successResult({
                    session,
                    sourceType,
                    targetType,
                    transformed: true,
                });
            }

            return errorResult(
                `Transformation from ${sourceType} to ${targetType} is not supported. ` +
                    `Supported: openapi2 -> openapi3`,
            );
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
            entry.modelType = dereferenced.getDocumentType();
            sessionManager.touchSession(session);

            return successResult({
                session,
                dereferenced: true,
            });
        }),
    );
}
