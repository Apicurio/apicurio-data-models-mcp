import {
    type AsyncApiChannelItem,
    type AsyncApiChannels,
    CombinedVisitorAdapter,
    type MappedNode,
    type OpenApiPathItem,
    type OpenApiPaths,
} from "@apicurio/data-models";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;

/** Describes a single OpenAPI path with its available HTTP methods. */
export interface PathEntry {
    path: string;
    methods: string[];
}

/** Describes a single AsyncAPI channel with its operations. */
export interface ChannelEntry {
    channel: string;
    operations: string[];
}

/**
 * Visitor that collects all paths (OpenAPI) or channels (AsyncAPI)
 * along with their operations.
 *
 * Works uniformly across OpenAPI 2.0/3.0/3.1 and AsyncAPI 2.x/3.0.
 * Use with `Library.visitTree(doc, visitor, TraverserDirection.down)`.
 */
export class PathCollectorVisitor extends CombinedVisitorAdapter {
    paths: PathEntry[] = [];
    channels: ChannelEntry[] = [];

    /** @inheritDoc */
    visitPaths(node: OpenApiPaths): void {
        const names = node.getItemNames() ?? [];
        for (const name of names) {
            const pi = node.getItem(name);
            const methods: string[] = [];
            for (const method of HTTP_METHODS) {
                const getter =
                    `get${method.charAt(0).toUpperCase()}${method.slice(1)}` as keyof OpenApiPathItem;
                const op = (pi as any)[getter]?.();
                if (op != null) {
                    methods.push(method.toUpperCase());
                }
            }
            this.paths.push({ path: name, methods });
        }
    }

    /** @inheritDoc */
    visitChannels(node: AsyncApiChannels): void {
        const mapped = node as unknown as MappedNode<AsyncApiChannelItem>;
        const names = mapped.getItemNames?.() ?? [];
        for (const name of names) {
            const ch = mapped.getItem(name);
            const operations: string[] = [];
            if (ch.getPublish?.() != null) operations.push("publish");
            if (ch.getSubscribe?.() != null) operations.push("subscribe");
            this.channels.push({ channel: name, operations });
        }
    }
}
