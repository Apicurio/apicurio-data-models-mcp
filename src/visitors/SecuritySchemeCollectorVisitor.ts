import { CombinedVisitorAdapter, type Components } from "@apicurio/data-models";

/** Describes a single security scheme entry. */
export interface SecuritySchemeEntry {
    name: string;
    type: string;
    description?: string;
}

/**
 * Visitor that collects all security scheme definitions from a document.
 *
 * Works uniformly across OpenAPI 2.0 (securityDefinitions) and
 * OpenAPI 3.x (components/securitySchemes).
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class SecuritySchemeCollectorVisitor extends CombinedVisitorAdapter {
    securitySchemes: SecuritySchemeEntry[] = [];

    /** Handles OpenAPI 2.0 security definitions. */
    visitSecurityDefinitions(node: any): void {
        const names: string[] = node.getItemNames?.() ?? [];
        for (const name of names) {
            const item = node.getItem(name);
            this.securitySchemes.push({
                name,
                type: item?.getType?.() ?? "unknown",
                description: item?.getDescription?.() ?? undefined,
            });
        }
    }

    /** Handles OpenAPI 3.x components with security schemes. */
    visitComponents(node: Components): void {
        const comp = node as any;
        if (typeof comp.getSecuritySchemes === "function") {
            const schemes = comp.getSecuritySchemes();
            if (schemes) {
                for (const [name, scheme] of Object.entries<any>(schemes)) {
                    this.securitySchemes.push({
                        name,
                        type: scheme?.getType?.() ?? "unknown",
                        description: scheme?.getDescription?.() ?? undefined,
                    });
                }
            }
        }
    }
}
