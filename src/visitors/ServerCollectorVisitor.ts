import { CombinedVisitorAdapter } from "@apicurio/data-models";

/** Describes a single server entry. */
export interface ServerEntry {
    url: string;
    description?: string;
}

/**
 * Visitor that collects all server definitions from a document.
 *
 * For OpenAPI 3.x documents, collects servers from the servers array.
 * For OpenAPI 2.0, synthesizes a server URL from host and basePath on the document.
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class ServerCollectorVisitor extends CombinedVisitorAdapter {
    servers: ServerEntry[] = [];

    /** Handles OpenAPI 3.x server nodes. */
    visitServer(node: any): void {
        this.servers.push({
            url: node.getUrl?.() ?? "",
            description: node.getDescription?.() ?? undefined,
        });
    }

    /** Handles OpenAPI 2.0 documents by synthesizing a server from host/basePath. */
    visitDocument(node: any): void {
        // Only apply to OpenAPI 2.0 documents that have a host field
        if (typeof node.getHost === "function" && node.getHost?.()) {
            const host = node.getHost() ?? "";
            const basePath = node.getBasePath?.() ?? "";
            const schemes: string[] = node.getSchemes?.() ?? ["https"];
            const scheme = schemes[0] ?? "https";
            this.servers.push({
                url: `${scheme}://${host}${basePath}`,
            });
        }
    }
}
