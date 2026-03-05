import * as fs from "node:fs";
import * as path from "node:path";
import { ModelType as LibModelType, Library } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";
import { type DocumentFormat, detectFormat, parseContent, serializeContent } from "../util/format.js";
import { ALL_MODEL_TYPES, fromLibModelType, type ModelType, toLibModelType } from "../util/model-type-map.js";

/**
 * Register all session management tools on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerSessionTools(server: McpServer): void {
    // ── document_load ──────────────────────────────────────────────
    server.tool(
        "document_load",
        "Load an OpenAPI or AsyncAPI file into a named session",
        {
            session: z.string().describe("Name for this session"),
            filePath: z.string().describe("Absolute or relative path to the file"),
            format: z.enum(["json", "yaml"]).optional().describe("Force format; auto-detected if omitted"),
        },
        withErrorHandling(async (args) => {
            const { session, filePath, format } = args;

            const resolvedPath = path.resolve(filePath);
            if (!fs.existsSync(resolvedPath)) {
                return errorResult(`File not found: ${resolvedPath}`);
            }

            const content = fs.readFileSync(resolvedPath, "utf-8");
            const detectedFormat: DocumentFormat = format ?? detectFormat(content);
            const json = parseContent(content, detectedFormat);
            const document = Library.readDocument(json);
            const modelType = (document as any).modelType();

            sessionManager.addSession({
                name: session,
                document,
                modelType,
                filePath: resolvedPath,
                format: detectedFormat,
                createdAt: new Date(),
                lastModifiedAt: new Date(),
            });

            return successResult({
                session,
                modelType: fromLibModelType(modelType),
                filePath: resolvedPath,
                format: detectedFormat,
            });
        }),
    );

    // ── document_create ────────────────────────────────────────────
    server.tool(
        "document_create",
        "Create a new empty OpenAPI or AsyncAPI document in a named session",
        {
            session: z.string().describe("Name for this session"),
            modelType: z
                .enum(ALL_MODEL_TYPES as [string, ...string[]])
                .describe("Document type to create (openapi2, openapi3, asyncapi2)"),
            title: z.string().optional().describe("Document title"),
            version: z.string().optional().describe("Document version"),
        },
        withErrorHandling(async (args) => {
            const { session, modelType, title, version } = args;

            const libMT = toLibModelType(modelType as ModelType);
            const document = Library.createDocument(libMT);

            // Set the spec version property (v2 library doesn't do this automatically)
            const docAny = document as any;
            if (libMT === LibModelType.OPENAPI20) {
                docAny.setSwagger("2.0");
            } else if (libMT === LibModelType.OPENAPI30) {
                docAny.setOpenapi("3.0.0");
            } else if (libMT >= LibModelType.ASYNCAPI20 && libMT <= LibModelType.ASYNCAPI26) {
                docAny.setAsyncapi("2.0.0");
            } else if (libMT === LibModelType.ASYNCAPI30) {
                docAny.setAsyncapi("3.0.0");
            }

            if (title || version) {
                const info = document.createInfo();
                document.setInfo(info);
                if (title) {
                    info.setTitle(title);
                }
                if (version) {
                    info.setVersion(version);
                }
            }

            sessionManager.addSession({
                name: session,
                document,
                modelType: libMT,
                filePath: null,
                format: "json",
                createdAt: new Date(),
                lastModifiedAt: new Date(),
            });

            return successResult({
                session,
                modelType,
            });
        }),
    );

    // ── document_save ──────────────────────────────────────────────
    server.tool(
        "document_save",
        "Save the document from a session to a file",
        {
            session: z.string().describe("Session name"),
            filePath: z
                .string()
                .optional()
                .describe("File path to save to; defaults to the original load path"),
            format: z.enum(["json", "yaml"]).optional().describe("Output format; defaults to session format"),
        },
        withErrorHandling(async (args) => {
            const { session, filePath, format } = args;

            const entry = sessionManager.getSession(session);
            const targetPath = filePath ? path.resolve(filePath) : entry.filePath;
            if (!targetPath) {
                return errorResult("No file path specified and session was not loaded from a file");
            }

            const outputFormat: DocumentFormat = format ?? entry.format;
            const json = Library.writeNode(entry.document);
            const content = serializeContent(json, outputFormat);

            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, content, "utf-8");

            // Update session metadata
            entry.filePath = targetPath;
            entry.format = outputFormat;
            sessionManager.touchSession(session);

            return successResult({
                session,
                filePath: targetPath,
                format: outputFormat,
            });
        }),
    );

    // ── document_close ─────────────────────────────────────────────
    server.tool(
        "document_close",
        "Close a named session and release the document from memory",
        {
            session: z.string().describe("Session name to close"),
        },
        withErrorHandling(async (args) => {
            const { session } = args;
            sessionManager.removeSession(session);
            return successResult({ session, closed: true });
        }),
    );

    // ── document_list_sessions ─────────────────────────────────────
    server.tool(
        "document_list_sessions",
        "List all active document sessions",
        {},
        withErrorHandling(async () => {
            const sessions = sessionManager.listSessions().map((s) => ({
                name: s.name,
                modelType: fromLibModelType(s.modelType),
                filePath: s.filePath,
                format: s.format,
                createdAt: s.createdAt.toISOString(),
                lastModifiedAt: s.lastModifiedAt.toISOString(),
            }));
            return successResult({ sessions });
        }),
    );

    // ── document_export ───────────────────────────────────────────
    server.tool(
        "document_export",
        "Export the document content as a JSON or YAML string",
        {
            session: z.string().describe("Session name"),
            format: z
                .enum(["json", "yaml"])
                .optional()
                .describe("Output format; defaults to the session's current format"),
        },
        withErrorHandling(async (args) => {
            const { session, format } = args;
            const entry = sessionManager.getSession(session);
            const outputFormat: DocumentFormat = format ?? entry.format;
            const json = Library.writeNode(entry.document);
            const content = serializeContent(json, outputFormat);

            return successResult({
                session,
                format: outputFormat,
                content,
            });
        }),
    );
}
