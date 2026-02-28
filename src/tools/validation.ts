import { Library, NodePath, ValidationProblemSeverity } from "@apicurio/data-models";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "../session-manager.js";
import { errorResult, successResult, withErrorHandling } from "../util/errors.js";

/**
 * Convert a ValidationProblemSeverity enum value to a human-readable string.
 */
function severityToString(severity: ValidationProblemSeverity): string {
    switch (severity) {
        case ValidationProblemSeverity.ignore:
            return "ignore";
        case ValidationProblemSeverity.low:
            return "low";
        case ValidationProblemSeverity.medium:
            return "medium";
        case ValidationProblemSeverity.high:
            return "high";
        default:
            return "unknown";
    }
}

/**
 * Register the validation tool on the given MCP server.
 *
 * @param server the MCP server instance
 */
export function registerValidationTools(server: McpServer): void {
    server.tool(
        "document_validate",
        "Validate the document and return structured validation problems",
        {
            session: z.string().describe("Session name"),
            nodePath: z.string().optional().describe("Optional node path to validate a specific subtree"),
        },
        withErrorHandling(async (args) => {
            const { session, nodePath: nodePathStr } = args;
            const entry = sessionManager.getSession(session);

            let targetNode = entry.document as any;
            if (nodePathStr) {
                const np = NodePath.parse(nodePathStr);
                targetNode = Library.resolveNodePath(np, entry.document);
                if (targetNode == null) {
                    return errorResult(`No node found at path: ${nodePathStr}`);
                }
            }

            const problems = Library.validate(targetNode, null as any);

            const mappedProblems = problems.map((p) => ({
                errorCode: p.errorCode,
                path: p.nodePath?.toString() ?? null,
                property: p.property,
                message: p.message,
                severity: severityToString(p.severity),
            }));

            return successResult({
                session,
                valid: mappedProblems.length === 0,
                problemCount: mappedProblems.length,
                problems: mappedProblems,
            });
        }),
    );
}
