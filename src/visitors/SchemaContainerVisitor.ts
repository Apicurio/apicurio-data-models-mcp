import {
    CombinedVisitorAdapter,
    type Components,
    type OpenApi20Definitions,
    type Schema,
} from "@apicurio/data-models";

/**
 * Interface representing a container that can hold named schema definitions.
 * This abstracts over OpenAPI 2.0 Definitions, OpenAPI 3.x Components, and
 * AsyncAPI Components which all have different APIs for managing schemas.
 */
export interface SchemaContainer {
    createSchema(): Schema;
    addSchema(name: string, schema: Schema): void;
}

/**
 * Adapter that wraps an OpenAPI 2.0 Definitions node to conform to the
 * SchemaContainer interface.
 */
class DefinitionsSchemaContainer implements SchemaContainer {
    constructor(private definitions: OpenApi20Definitions) {}

    createSchema(): Schema {
        return this.definitions.createSchema() as unknown as Schema;
    }

    addSchema(name: string, schema: Schema): void {
        this.definitions.addItem(name, schema as any);
    }
}

/**
 * Adapter that wraps an OpenAPI 3.x or AsyncAPI Components node to conform
 * to the SchemaContainer interface.
 */
class ComponentsSchemaContainer implements SchemaContainer {
    constructor(private components: Components) {}

    createSchema(): Schema {
        return (this.components as any).createSchema();
    }

    addSchema(name: string, schema: Schema): void {
        (this.components as any).addSchema(name, schema);
    }
}

/**
 * Visitor that finds the schema definition container in a document.
 *
 * Works uniformly across OpenAPI 2.0 (Definitions), OpenAPI 3.x (Components),
 * and AsyncAPI (Components). The found container is wrapped in a SchemaContainer
 * adapter so callers can add schemas without version-specific branching.
 *
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class SchemaContainerVisitor extends CombinedVisitorAdapter {
    container: SchemaContainer | null = null;

    /**
     * Returns true if a schema container was found.
     */
    isFound(): boolean {
        return this.container != null;
    }

    /** Handles OpenAPI 2.0 definitions. */
    visitDefinitions(node: OpenApi20Definitions): void {
        this.container = new DefinitionsSchemaContainer(node);
    }

    /** Handles OpenAPI 3.x and AsyncAPI components with schemas. */
    visitComponents(node: Components): void {
        if (typeof (node as any).createSchema === "function") {
            this.container = new ComponentsSchemaContainer(node);
        }
    }
}
