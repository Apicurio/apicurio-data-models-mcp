import { CombinedVisitorAdapter } from "@apicurio/data-models";

/** Describes a single tag entry. */
export interface TagEntry {
    name: string;
    description?: string;
}

/**
 * Visitor that collects all tag definitions from a document.
 *
 * Collects tags from the top-level tags array (OpenAPI 2.0/3.x).
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class TagCollectorVisitor extends CombinedVisitorAdapter {
    tags: TagEntry[] = [];

    /** Handles individual tag nodes. */
    visitTag(node: any): void {
        this.tags.push({
            name: node.getName?.() ?? "",
            description: node.getDescription?.() ?? undefined,
        });
    }
}
