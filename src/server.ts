import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "./resources/document.js";
import { registerEditTools } from "./tools/edit.js";
import { registerQueryTools } from "./tools/query.js";
import { registerSessionTools } from "./tools/session.js";
import { registerTransformTools } from "./tools/transform.js";
import { registerValidationTools } from "./tools/validation.js";

/**
 * Create and configure the MCP server with all tools and resources.
 *
 * @returns a fully configured McpServer instance
 */
export function createServer(): McpServer {
    const server = new McpServer({
        name: "apicurio-data-models",
        version: "0.1.0",
    });

    registerSessionTools(server);
    registerQueryTools(server);
    registerValidationTools(server);
    registerEditTools(server);
    registerTransformTools(server);
    registerResources(server);

    return server;
}
