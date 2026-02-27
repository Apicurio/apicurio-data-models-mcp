import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Create an MCP error result with isError flag.
 *
 * @param message the error message
 * @returns an MCP CallToolResult with isError: true
 */
export function errorResult(message: string): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
    };
}

/**
 * Create a successful MCP result.
 *
 * @param data the result data to serialize
 * @returns an MCP CallToolResult
 */
export function successResult(data: any): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}

/**
 * Wrap a tool handler function with error handling that catches exceptions
 * and converts them to MCP error results.
 *
 * @param handler the async handler function
 * @returns a wrapped handler that catches errors
 */
export function withErrorHandling(
    handler: (args: any) => Promise<CallToolResult>,
): (args: any) => Promise<CallToolResult> {
    return async (args: any): Promise<CallToolResult> => {
        try {
            return await handler(args);
        } catch (err: any) {
            const message = err?.message ?? String(err);
            return errorResult(message);
        }
    };
}
