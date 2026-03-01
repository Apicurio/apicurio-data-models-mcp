import {
    type AsyncApiChannels,
    CombinedVisitorAdapter,
    type Components,
    type Info,
    type MappedNode,
    type OpenApi20Definitions,
    type OpenApiComponents,
    type OpenApiPaths,
} from "@apicurio/data-models";

/**
 * Visitor that collects document-level metadata: title, description, version,
 * and counts of paths/channels and schemas.
 *
 * Works uniformly across OpenAPI 2.0, 3.0, 3.1, and AsyncAPI 2.x/3.0.
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class DocumentInfoVisitor extends CombinedVisitorAdapter {
    title: string | null = null;
    description: string | null = null;
    version: string | null = null;
    pathCount: number = 0;
    channelCount: number = 0;
    schemaCount: number = 0;

    /** @inheritDoc */
    visitInfo(node: Info): void {
        this.title = node.getTitle() ?? null;
        this.description = node.getDescription() ?? null;
        this.version = node.getVersion() ?? null;
    }

    /** @inheritDoc */
    visitPaths(node: OpenApiPaths): void {
        this.pathCount = node.getItems()?.length ?? 0;
    }

    /** @inheritDoc */
    visitChannels(node: AsyncApiChannels): void {
        const mapped = node as unknown as MappedNode<unknown>;
        this.channelCount = mapped.getItems?.()?.length ?? 0;
    }

    /** Handles OpenAPI 2.0 definitions. */
    visitDefinitions(node: OpenApi20Definitions): void {
        this.schemaCount = node.getItems()?.length ?? 0;
    }

    /** Handles OpenAPI 3.x and AsyncAPI components with schemas. */
    visitComponents(node: Components): void {
        const schemas = (node as OpenApiComponents).getSchemas?.();
        if (schemas) {
            this.schemaCount = Object.keys(schemas).length;
        }
    }
}
