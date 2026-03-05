import {
    type AsyncApiChannelItem,
    type AsyncApiChannels,
    CombinedVisitorAdapter,
    type MappedNode,
    type OpenApiPathItem,
    type OpenApiPaths,
} from "@apicurio/data-models";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

/** Describes a single OpenAPI operation with its path, method, and metadata. */
export interface OperationEntry {
    path: string;
    method: string;
    operationId: string | undefined;
    summary: string | undefined;
    tags: string[];
}

/** Describes a single AsyncAPI operation with its channel, type, and metadata. */
export interface AsyncOperationEntry {
    channel: string;
    type: string;
    operationId: string | undefined;
    summary: string | undefined;
}

/**
 * Visitor that collects all operations across an OpenAPI or AsyncAPI document.
 *
 * For OpenAPI documents, collects path, HTTP method, operationId, summary, and tags.
 * For AsyncAPI 2.x documents, collects channel, operation type (publish/subscribe),
 * operationId, and summary.
 *
 * Works uniformly across OpenAPI 2.0/3.0/3.1 and AsyncAPI 2.x.
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class OperationCollectorVisitor extends CombinedVisitorAdapter {
    operations: OperationEntry[] = [];
    asyncOperations: AsyncOperationEntry[] = [];

    /** @inheritDoc */
    visitPaths(node: OpenApiPaths): void {
        const names = node.getItemNames() ?? [];
        for (const name of names) {
            const pi = node.getItem(name);
            for (const method of HTTP_METHODS) {
                const getter =
                    `get${method.charAt(0).toUpperCase()}${method.slice(1)}` as keyof OpenApiPathItem;
                const op = (pi as any)[getter]?.();
                if (op != null) {
                    const tags: string[] = (op.getTags?.() ?? []).map((t: any) =>
                        typeof t === "string" ? t : (t.getName?.() ?? String(t)),
                    );
                    this.operations.push({
                        path: name,
                        method: method.toUpperCase(),
                        operationId: op.getOperationId?.() ?? undefined,
                        summary: op.getSummary?.() ?? undefined,
                        tags,
                    });
                }
            }
        }
    }

    /** @inheritDoc */
    visitChannels(node: AsyncApiChannels): void {
        const mapped = node as unknown as MappedNode<AsyncApiChannelItem>;
        const names = mapped.getItemNames?.() ?? [];
        for (const name of names) {
            const ch = mapped.getItem(name);
            const pub = ch.getPublish?.();
            if (pub != null) {
                this.asyncOperations.push({
                    channel: name,
                    type: "publish",
                    operationId: (pub as any).getOperationId?.() ?? undefined,
                    summary: (pub as any).getSummary?.() ?? undefined,
                });
            }
            const sub = ch.getSubscribe?.();
            if (sub != null) {
                this.asyncOperations.push({
                    channel: name,
                    type: "subscribe",
                    operationId: (sub as any).getOperationId?.() ?? undefined,
                    summary: (sub as any).getSummary?.() ?? undefined,
                });
            }
        }
    }
}
