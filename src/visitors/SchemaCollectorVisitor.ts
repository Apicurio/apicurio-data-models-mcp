import {
    CombinedVisitorAdapter,
    type Components,
    type OpenApi20Definitions,
    type OpenApiComponents,
} from "@apicurio/data-models";

/**
 * Visitor that collects all schema/component definition names.
 *
 * Works uniformly across OpenAPI 2.0 (definitions), OpenAPI 3.x (components/schemas),
 * and AsyncAPI (components/schemas).
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class SchemaCollectorVisitor extends CombinedVisitorAdapter {
    schemas: string[] = [];

    /** Handles OpenAPI 2.0 definitions. */
    visitDefinitions(node: OpenApi20Definitions): void {
        this.schemas = node.getItemNames() ?? [];
    }

    /** Handles OpenAPI 3.x and AsyncAPI components with schemas. */
    visitComponents(node: Components): void {
        const schemas = (node as OpenApiComponents).getSchemas?.();
        if (schemas) {
            this.schemas = Object.keys(schemas);
        }
    }
}
