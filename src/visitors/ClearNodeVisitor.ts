import {
    CombinedVisitorAdapter,
    type Document,
    type Info,
    Library,
    type Node,
    type OpenApiPathItem,
    type OpenApiResponse,
    type Operation,
    type Schema,
} from "@apicurio/data-models";

/**
 * Visitor that clears all properties from a node, preparing it for
 * re-population via `Library.readNode()`.
 *
 * This enables the "clear then populate" pattern for in-place node
 * updates without full document re-serialization.
 *
 * Usage:
 * ```typescript
 * const clearVisitor = new ClearNodeVisitor();
 * node.accept(clearVisitor);             // clears all properties
 * Library.readNode(newContent, node);     // re-populates from JSON
 * ```
 *
 * For nodes not explicitly handled by a specific visit method, the
 * generic approach serializes the node, clears properties by
 * re-reading an empty object.
 */
export class ClearNodeVisitor extends CombinedVisitorAdapter {
    /**
     * Generic handler: clears a node by writing it out to discover its
     * properties, then setting each to null/undefined.
     */
    private clearNode(node: Node): void {
        const serialized = Library.writeNode(node) as Record<string, unknown>;
        for (const key of Object.keys(serialized)) {
            const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            if (typeof (node as any)[setterName] === "function") {
                (node as any)[setterName](null);
            }
        }
    }

    /** @inheritDoc */
    visitDocument(node: Document): void {
        this.clearNode(node as unknown as Node);
    }

    /** @inheritDoc */
    visitInfo(node: Info): void {
        this.clearNode(node as unknown as Node);
    }

    /** @inheritDoc */
    visitPathItem(node: OpenApiPathItem): void {
        this.clearNode(node as unknown as Node);
    }

    /** @inheritDoc */
    visitSchema(node: Schema): void {
        this.clearNode(node as unknown as Node);
    }

    /** @inheritDoc */
    visitResponse(node: OpenApiResponse): void {
        this.clearNode(node as unknown as Node);
    }

    /** @inheritDoc */
    visitOperation(node: Operation): void {
        this.clearNode(node as unknown as Node);
    }
}
