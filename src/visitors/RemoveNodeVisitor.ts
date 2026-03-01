import {
    type AsyncApi30Channel,
    type AsyncApi30MultiFormatSchema,
    type AsyncApi30OperationReply,
    type AsyncApi30OperationReplyAddress,
    type AsyncApi30Operations,
    type AsyncApi30Reference,
    type AsyncApiBinding,
    type AsyncApiChannelBindings,
    type AsyncApiChannelItem,
    type AsyncApiChannels,
    type AsyncApiCorrelationID,
    type AsyncApiMessage,
    type AsyncApiMessageBindings,
    type AsyncApiMessageExample,
    type AsyncApiMessageTrait,
    type AsyncApiOneOfMessages,
    type AsyncApiOperationBindings,
    type AsyncApiOperationTrait,
    type AsyncApiParameters,
    type AsyncApiServerBindings,
    type AsyncApiServers,
    CombinedVisitorAdapter,
    type Components,
    type Contact,
    type Document,
    type ExternalDocumentation,
    type Info,
    type License,
    type Node,
    type OAuthFlow,
    type OAuthFlows,
    type OpenApi20Definitions,
    type OpenApi20Items,
    type OpenApi20ParameterDefinitions,
    type OpenApi20ResponseDefinitions,
    type OpenApi20Scopes,
    type OpenApi20SecurityDefinitions,
    type OpenApiCallback,
    type OpenApiDiscriminator,
    type OpenApiEncoding,
    type OpenApiExample,
    type OpenApiHeader,
    type OpenApiLink,
    type OpenApiMediaType,
    type OpenApiPathItem,
    type OpenApiPaths,
    type OpenApiRequestBody,
    type OpenApiResponse,
    type OpenApiResponses,
    type OpenApiXML,
    type Operation,
    type Parameter,
    ParentPropertyType,
    type Schema,
    type SecurityRequirement,
    type SecurityScheme,
    type Server,
    type ServerVariable,
    type Tag,
} from "@apicurio/data-models";

/**
 * Visitor that removes a node from its parent.
 *
 * Call `node.accept(visitor)` on the node to remove. The visitor dispatches
 * to the correct `visitXxx()` method based on the node's type, and each
 * method knows exactly how to detach that node type from its parent.
 *
 * After calling `accept()`, check the `removed` and `error` fields for
 * the result.
 *
 * Usage:
 * ```typescript
 * const visitor = new RemoveNodeVisitor();
 * node.accept(visitor);
 * if (visitor.error) { throw new Error(visitor.error); }
 * ```
 */
export class RemoveNodeVisitor extends CombinedVisitorAdapter {
    /** Whether the removal succeeded. */
    removed: boolean = false;
    /** Error message if removal failed, null otherwise. */
    error: string | null = null;

    // ── Reusable helper methods ──────────────────────────────────────

    /**
     * Removes a node that is a standard (non-map, non-array) property on
     * its parent by calling the parent's setter with null.
     *
     * Example: Info on Document → `document.setInfo(null)`
     */
    private removeAsProperty(node: Node): void {
        const parent = node.parent();
        const propName = node.parentPropertyName();
        const setter = `set${propName.charAt(0).toUpperCase()}${propName.slice(1)}`;
        if (typeof (parent as any)[setter] === "function") {
            (parent as any)[setter](null);
            this.removed = true;
        } else {
            this.error = `Cannot remove property '${propName}' from parent`;
        }
    }

    /**
     * Removes a node from a parent that implements MappedNode (has a
     * `removeItem(key)` method).
     *
     * Example: PathItem in Paths → `paths.removeItem("/pets")`
     */
    private removeFromMappedParent(node: Node): void {
        const parent = node.parent() as any;
        const key = node.mapPropertyName();
        if (typeof parent.removeItem === "function") {
            parent.removeItem(key);
            this.removed = true;
        } else {
            this.error = `Parent does not support removeItem for key '${key}'`;
        }
    }

    /**
     * Removes a node from a parent's named map property (e.g., Components)
     * using the exact removal method name.
     *
     * Example: Schema in Components → `components.removeSchema("Pet")`
     */
    private removeFromNamedMap(node: Node, removeMethodName: string): void {
        const parent = node.parent() as any;
        const key = node.mapPropertyName();
        if (typeof parent[removeMethodName] === "function") {
            parent[removeMethodName](key);
            this.removed = true;
        } else {
            this.error = `Parent does not have method '${removeMethodName}' for key '${key}'`;
        }
    }

    /**
     * Handles removal of a node that may be either a standard property
     * or a map entry in a MappedNode parent. Used for node types that can
     * appear in multiple parent contexts.
     */
    private removeByParentType(node: Node): void {
        const propType = node.parentPropertyType();
        if (propType === ParentPropertyType.map) {
            this.removeFromMappedParent(node);
        } else {
            this.removeAsProperty(node);
        }
    }

    /**
     * Handles removal of a node that may be a standard property, a
     * MappedNode entry, or a named map entry on a Components-style parent.
     * The `componentRemoveMethod` is the exact method name to call when
     * the node is in a Components-style map (not a MappedNode).
     */
    private removePolymorphic(node: Node, componentRemoveMethod: string): void {
        const propType = node.parentPropertyType();
        if (propType === ParentPropertyType.map) {
            const parent = node.parent() as any;
            if (typeof parent.removeItem === "function") {
                this.removeFromMappedParent(node);
            } else {
                this.removeFromNamedMap(node, componentRemoveMethod);
            }
        } else {
            this.removeAsProperty(node);
        }
    }

    // ── Root document (cannot remove) ────────────────────────────────

    /** @inheritDoc */
    visitDocument(_node: Document): void {
        this.error = "Cannot remove the root document";
    }

    // ── Shared model nodes (always standard properties) ──────────────

    /** @inheritDoc */
    visitInfo(node: Info): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitContact(node: Contact): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitLicense(node: License): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitExternalDocumentation(node: ExternalDocumentation): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitComponents(node: Components): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitOAuthFlows(node: OAuthFlows): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitOAuthFlow(node: OAuthFlow): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** @inheritDoc */
    visitTag(node: Tag): void {
        this.removeByParentType(node as unknown as Node);
    }

    /** @inheritDoc */
    visitSecurityRequirement(node: SecurityRequirement): void {
        this.removeByParentType(node as unknown as Node);
    }

    // ── Shared model nodes (polymorphic: property, MappedNode, or Components map) ─

    /**
     * Server can be:
     * - In AsyncApiServers (MappedNode) → removeItem
     * - In OpenAPI document/pathItem as an array entry
     */
    visitServer(node: Server): void {
        this.removeByParentType(node as unknown as Node);
    }

    /** ServerVariable is in a Server's variables map or as a property. */
    visitServerVariable(node: ServerVariable): void {
        this.removeByParentType(node as unknown as Node);
    }

    /**
     * Schema can be:
     * - In OpenApi20Definitions (MappedNode) → removeItem
     * - In OpenApiComponents (named map) → removeSchema
     * - In AsyncApiComponents (named map) → removeSchema
     * - As a property on another Schema (items, additionalProperties, etc.)
     */
    visitSchema(node: Schema): void {
        this.removePolymorphic(node as unknown as Node, "removeSchema");
    }

    /**
     * Parameter can be:
     * - In OpenApi20ParameterDefinitions (MappedNode) → removeItem
     * - In Components (named map) → removeParameter
     * - In AsyncApiParameters (MappedNode) → removeItem
     * - As an array entry on Operation or PathItem
     */
    visitParameter(node: Parameter): void {
        this.removePolymorphic(node as unknown as Node, "removeParameter");
    }

    /**
     * Operation can be:
     * - On an OpenApiPathItem as a named property (get, post, etc.) → setter
     * - On an AsyncApiChannelItem as publish/subscribe → setter
     * - In AsyncApi30Operations (MappedNode) → removeItem
     */
    visitOperation(node: Operation): void {
        this.removeByParentType(node as unknown as Node);
    }

    /**
     * SecurityScheme can be:
     * - In OpenApi20SecurityDefinitions (MappedNode) → removeItem
     * - In Components (named map) → removeSecurityScheme
     */
    visitSecurityScheme(node: SecurityScheme): void {
        this.removePolymorphic(node as unknown as Node, "removeSecurityScheme");
    }

    // ── OpenAPI-specific nodes ───────────────────────────────────────

    /** Paths is always a standard property on the Document. */
    visitPaths(node: OpenApiPaths): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** PathItem is always in a MappedNode parent (Paths or Callback). */
    visitPathItem(node: OpenApiPathItem): void {
        this.removeFromMappedParent(node as unknown as Node);
    }

    /** Responses container is a standard property on Operation. */
    visitResponses(node: OpenApiResponses): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /**
     * Response can be:
     * - In OpenApiResponses (MappedNode) → removeItem
     * - In OpenApi20ResponseDefinitions (MappedNode) → removeItem
     * - In Components (named map) → removeResponse
     */
    visitResponse(node: OpenApiResponse): void {
        this.removePolymorphic(node as unknown as Node, "removeResponse");
    }

    /**
     * RequestBody can be:
     * - On an Operation as a standard property → setter
     * - In Components (named map) → removeRequestBody
     */
    visitRequestBody(node: OpenApiRequestBody): void {
        this.removePolymorphic(node as unknown as Node, "removeRequestBody");
    }

    /**
     * Header can be:
     * - In Components (named map) → removeHeader
     * - In a Response headers map
     */
    visitHeader(node: OpenApiHeader): void {
        this.removePolymorphic(node as unknown as Node, "removeHeader");
    }

    /**
     * Example can be:
     * - In Components (named map) → removeExample
     * - In a MediaType examples map
     */
    visitExample(node: OpenApiExample): void {
        this.removePolymorphic(node as unknown as Node, "removeExample");
    }

    /**
     * Link can be:
     * - In Components (named map) → removeLink
     * - In a Response links map
     */
    visitLink(node: OpenApiLink): void {
        this.removePolymorphic(node as unknown as Node, "removeLink");
    }

    /**
     * Callback can be:
     * - In Components (named map) → removeCallback
     * - In an Operation callbacks map
     */
    visitCallback(node: OpenApiCallback): void {
        this.removePolymorphic(node as unknown as Node, "removeCallback");
    }

    /** MediaType is in a content map (MappedNode-style or named map). */
    visitMediaType(node: OpenApiMediaType): void {
        this.removeByParentType(node as unknown as Node);
    }

    /** Encoding is in a MediaType encodings map. */
    visitEncoding(node: OpenApiEncoding): void {
        this.removeByParentType(node as unknown as Node);
    }

    /** Discriminator is a standard property on Schema. */
    visitDiscriminator(node: OpenApiDiscriminator): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** XML is a standard property on Schema. */
    visitXML(node: OpenApiXML): void {
        this.removeAsProperty(node as unknown as Node);
    }

    // ── OpenAPI 2.0-specific nodes ───────────────────────────────────

    /** Definitions is a standard property on the Document. */
    visitDefinitions(node: OpenApi20Definitions): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** SecurityDefinitions is a standard property on the Document. */
    visitSecurityDefinitions(node: OpenApi20SecurityDefinitions): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** ParameterDefinitions is a standard property on the Document. */
    visitParameterDefinitions(node: OpenApi20ParameterDefinitions): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** ResponseDefinitions is a standard property on the Document. */
    visitResponseDefinitions(node: OpenApi20ResponseDefinitions): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** Scopes is a standard property on SecurityScheme (OAS 2.0). */
    visitScopes(node: OpenApi20Scopes): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** Items is a standard property on Schema or Parameter (OAS 2.0). */
    visitItems(node: OpenApi20Items): void {
        this.removeAsProperty(node as unknown as Node);
    }

    // ── AsyncAPI-specific nodes ──────────────────────────────────────

    /** Channels is a standard property on the AsyncAPI Document. */
    visitChannels(node: AsyncApiChannels): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** ChannelItem is always in a Channels MappedNode. */
    visitChannelItem(node: AsyncApiChannelItem): void {
        this.removeFromMappedParent(node as unknown as Node);
    }

    /** AsyncAPI Servers is a standard property on the Document. */
    visitServers(node: AsyncApiServers): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** AsyncAPI Parameters is a standard property on ChannelItem. */
    visitParameters(node: AsyncApiParameters): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** OneOfMessages is a standard property on a Message or ChannelItem. */
    visitOneOfMessages(node: AsyncApiOneOfMessages): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /**
     * Message can be:
     * - In Components (named map) → removeMessage
     * - As a property on a ChannelItem operation → setter
     */
    visitMessage(node: AsyncApiMessage): void {
        this.removePolymorphic(node as unknown as Node, "removeMessage");
    }

    /** MessageExample is in an array or map on a Message. */
    visitMessageExample(node: AsyncApiMessageExample): void {
        this.removeByParentType(node as unknown as Node);
    }

    /**
     * MessageTrait can be:
     * - In Components (named map) → removeMessageTrait
     * - As a property or array entry on a Message
     */
    visitMessageTrait(node: AsyncApiMessageTrait): void {
        this.removePolymorphic(node as unknown as Node, "removeMessageTrait");
    }

    /**
     * OperationTrait can be:
     * - In Components (named map) → removeOperationTrait
     * - As a property or array entry on an Operation
     */
    visitOperationTrait(node: AsyncApiOperationTrait): void {
        this.removePolymorphic(node as unknown as Node, "removeOperationTrait");
    }

    /** CorrelationID can be in Components (removeCorrelationId) or as a property. */
    visitCorrelationID(node: AsyncApiCorrelationID): void {
        this.removePolymorphic(node as unknown as Node, "removeCorrelationId");
    }

    /** Binding is in a MappedNode parent (various binding containers). */
    visitBinding(node: AsyncApiBinding): void {
        this.removeFromMappedParent(node as unknown as Node);
    }

    /** ChannelBindings is a standard property or in Components (removeChannelBinding). */
    visitChannelBindings(node: AsyncApiChannelBindings): void {
        this.removePolymorphic(node as unknown as Node, "removeChannelBinding");
    }

    /** MessageBindings is a standard property or in Components (removeMessageBinding). */
    visitMessageBindings(node: AsyncApiMessageBindings): void {
        this.removePolymorphic(node as unknown as Node, "removeMessageBinding");
    }

    /** OperationBindings is a standard property or in Components (removeOperationBinding). */
    visitOperationBindings(node: AsyncApiOperationBindings): void {
        this.removePolymorphic(node as unknown as Node, "removeOperationBinding");
    }

    /** ServerBindings is a standard property or in Components (removeServerBinding). */
    visitServerBindings(node: AsyncApiServerBindings): void {
        this.removePolymorphic(node as unknown as Node, "removeServerBinding");
    }

    // ── AsyncAPI 3.0-specific nodes ──────────────────────────────────

    /** AsyncApi30Operations is a standard property on the Document. */
    visitOperations(node: AsyncApi30Operations): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** AsyncApi30Channel is in a Channels MappedNode. */
    visitChannel(node: AsyncApi30Channel): void {
        this.removeFromMappedParent(node as unknown as Node);
    }

    /** OperationReply is a standard property on an Operation. */
    visitOperationReply(node: AsyncApi30OperationReply): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** OperationReplyAddress is a standard property on an OperationReply. */
    visitOperationReplyAddress(node: AsyncApi30OperationReplyAddress): void {
        this.removeAsProperty(node as unknown as Node);
    }

    /** Reference can appear in various contexts. */
    visitReference(node: AsyncApi30Reference): void {
        this.removeByParentType(node as unknown as Node);
    }

    /** MultiFormatSchema can appear in various contexts. */
    visitMultiFormatSchema(node: AsyncApi30MultiFormatSchema): void {
        this.removeByParentType(node as unknown as Node);
    }
}
