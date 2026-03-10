# Proposed New MCP Tools

This document proposes new tools to extend the apicurio-data-models MCP server beyond its
current 53 tools, closing remaining gaps for AI-assisted API design and visual editing.

## Current State

The server currently has **81 tools** across 5 categories: session management (7), document
querying (16), document editing (55), validation (1), and transformation (2). These cover
session lifecycle, document CRUD for paths/operations/responses/parameters/schemas/tags/
servers/security schemes/extensions/media types/response headers/request bodies/channels,
plus validation and spec-version transformation.

The generic tools `document_set_node`, `document_get_node`, and `document_remove_node`
provide a fallback for any operation, but they require the AI agent to understand internal
node path syntax and construct raw JSON payloads without validation. The proposed tools
below address remaining semantic gaps — operations that are either common enough to deserve
first-class support or complex enough that the generic tools are error-prone.

## Command-Backed Implementation Directive

> **Every edit tool in this MCP server MUST be backed by a Command implementation (or an
> aggregation of Command implementations) from the `@apicurio/data-models` library.**
> Direct model manipulation in edit tool handlers should be used only in rare, exceptional
> cases.
>
> If a required Command does not already exist in `@apicurio/data-models`, it **must be
> implemented in that library first** before the corresponding MCP tool can be added here.
> This ensures consistency with the library's undo/redo infrastructure, proper
> serialization support, and alignment with the visual editor's command history.

Throughout this document, each tool's command status is tracked:

- **Cmd: EXISTS** — The required `CommandFactory` method(s) already exist in the library.
  The tool can be implemented immediately.
- **Cmd: NEEDS NEW** — No suitable command exists. A new command must be created in
  `@apicurio/data-models` before this tool can be implemented. The required command name
  is listed.
- **Cmd: N/A** — The tool is read-only (query) or session-management; no command is
  needed.

## Methodology

Gaps were identified by cross-referencing three data sources:

1. The 53 tools currently implemented
2. The ~60 `CommandFactory` methods in `@apicurio/data-models` (many not yet exposed)
3. The complete OpenAPI 3.x node model (28+ node types, 68 visitor methods)

### Priority Levels

- **HIGH** — Covers the most common gaps; implement first
- **MEDIUM** — Completes CRUD lifecycles and adds useful queries; implement second
- **LOW** — Advanced features, refactoring operations, and bulk utilities; implement last

---

## Category 1: Schema Property Management — HIGH

Individual schema properties (fields within an `object` schema) are the most frequently
edited elements in API design. "Add a `status` field of type string with enum values
`active`, `inactive` to the `User` schema" is one of the most common things an AI agent
needs to do. Today it requires exporting the full schema, modifying JSON, and using
`document_set_node`.

### 1.1 `document_add_schema_property` — HIGH

Add a named property to an object schema.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `schemaName` | `string` | yes | Name of the schema definition (e.g. `Pet`) |
| `propertyName` | `string` | yes | Property name to add (e.g. `status`) |
| `schema` | `string` | yes | JSON string with the property schema (e.g. `{"type":"string"}`) |

**Cmd: EXISTS** — Uses `CommandFactory.createAddSchemaPropertyCommand(schemaName,
propertyName, schemaObj)`. Added in `@apicurio/data-models` v2.5.1.

### 1.2 `document_remove_schema_property` — HIGH

Remove a named property from an object schema.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `schemaName` | `string` | yes | Name of the schema definition |
| `propertyName` | `string` | yes | Property name to remove |

**Cmd: EXISTS** — Uses `CommandFactory.createDeleteSchemaPropertyCommand(schemaName,
propertyName)`. Added in `@apicurio/data-models` v2.5.1.

### 1.3 `document_set_schema_required` — MEDIUM

Set the `required` array on a schema, controlling which properties are mandatory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `schemaName` | `string` | yes | Name of the schema definition |
| `required` | `string` | yes | JSON array of required property names |

**Cmd: EXISTS** — Uses `CommandFactory.createChangePropertyCommand(schema, "required",
value)`.

### 1.4 `document_set_schema_type` — MEDIUM

Set the `type` field on a schema (string, object, array, integer, number, boolean).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the schema |
| `type` | `string` | yes | Schema type value |

**Cmd: EXISTS** — Uses `CommandFactory.createChangePropertyCommand(schema, "type", value)`.

### 1.5 `document_add_schema_enum` — MEDIUM

Set enum values on a schema property.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the schema |
| `values` | `string` | yes | JSON array of enum values |

**Cmd: EXISTS** — Uses `CommandFactory.createChangePropertyCommand(schema, "enum",
values)`.

---

## Category 2: Security Requirements — HIGH

Security *schemes* define authentication mechanisms; security *requirements* assign them to
the document or individual operations. We have full scheme CRUD but no requirement tools.
Defining a security scheme is useless without assigning it as a requirement.

### 2.1 `document_add_security_requirement` — HIGH

Add a security requirement to the document or to a specific operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `requirement` | `string` | yes | JSON object mapping scheme names to scopes (e.g. `{"bearerAuth":[]}`) |
| `path` | `string` | no | API path (required if applying to an operation) |
| `method` | `string` | no | HTTP method (required if applying to an operation) |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddDocumentSecurityRequirementCommand(document, requirement)` when
path/method are omitted, or
`CommandFactory.createAddOperationSecurityRequirementCommand(operation, requirement)` when
path/method are provided.

### 2.2 `document_remove_all_security_requirements` — MEDIUM

Remove all security requirements from the document or from a specific operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | no | API path (if targeting an operation) |
| `method` | `string` | no | HTTP method (if targeting an operation) |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllDocumentSecurityRequirementsCommand(document)` or
`CommandFactory.createDeleteAllOperationSecurityRequirementsCommand(operation)`.

---

## Category 3: Example Management — HIGH

Examples are critical for AI agents generating API documentation and for visual editors
showing sample request/response bodies. No tools exist for managing examples on media
types, parameters, or headers.

### 3.1 `document_add_example` — HIGH

Add a named example to a media type, parameter, or header.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the media type, parameter, or header |
| `name` | `string` | yes | Example name |
| `value` | `string` | yes | JSON string with the example value |
| `summary` | `string` | no | Example summary |
| `description` | `string` | no | Example description |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddMediaTypeExampleCommand(mediaType, example, name, summary, desc)`,
`CommandFactory.createAddParameterExampleCommand(parameter, ...)`, or
`CommandFactory.createAddHeaderExampleCommand(header, ...)`. A single tool can dispatch to
the correct command based on the resolved node type.

### 3.2 `document_remove_all_examples` — LOW

Remove all examples from a media type, parameter, or header.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the parent node |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllMediaTypeExamplesCommand(mediaType)`,
`CommandFactory.createDeleteAllParameterExamplesCommand(parameter)`, or
`CommandFactory.createDeleteAllHeaderExamplesCommand(header)`.

---

## Category 4: Operation Metadata — HIGH

Setting individual operation properties is extremely common but currently requires
`document_set_node` with a full operation JSON or `document_get_node` + manual
modification.

### 4.1 `document_set_operation_info` — HIGH

Set metadata properties on an operation (operationId, summary, description, deprecated).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |
| `operationId` | `string` | no | Operation ID |
| `summary` | `string` | no | Operation summary |
| `description` | `string` | no | Operation description |
| `deprecated` | `boolean` | no | Whether the operation is deprecated |

**Cmd: EXISTS** — Uses `CommandFactory.createChangePropertyCommand(operation, property,
value)` for each provided property, wrapped in an `AggregateCommand`.

### 4.2 `document_set_operation_tags` — HIGH

Set the tags array on an operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |
| `tags` | `string` | yes | JSON array of tag names (e.g. `["pets","admin"]`) |

**Cmd: EXISTS** — Uses `CommandFactory.createChangePropertyCommand(operation, "tags",
tagArray)`.

---

## Category 5: Media Type Deletion — MEDIUM

We can add media types but not remove individual ones.

### 5.1 `document_remove_media_type` — MEDIUM

Remove a specific media type from a request body or response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the media type (e.g. `/paths[/pets]/post/requestBody/content[application/json]`) |

**Cmd: EXISTS** — Uses `CommandFactory.createDeleteMediaTypeCommand(mediaType)`.

---

## Category 6: Reusable Component Definitions — MEDIUM

The `components` object in OAS 3.x has 9 sub-maps. We have tools for schemas and responses
but not for the other 7. Reusable components are a best practice — an AI agent encouraging
DRY API design needs to create shared parameters (e.g. `pageSize`, `Authorization`
header), shared request bodies, shared examples, etc.

### 6.1 `document_add_parameter_definition` — MEDIUM

Add a reusable parameter definition to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Parameter definition name (e.g. `pageSize`) |
| `parameter` | `string` | yes | JSON string with the parameter definition |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddParameterDefinitionCommand(name, paramObj)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.2 `document_remove_parameter_definition` — MEDIUM

Remove a reusable parameter definition from components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Parameter definition name to remove |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteParameterDefinitionCommand(name)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.3 `document_add_header_definition` — MEDIUM

Add a reusable header definition to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Header definition name (e.g. `X-Rate-Limit`) |
| `header` | `string` | yes | JSON string with the header definition |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddHeaderDefinitionCommand(name, headerObj)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.4 `document_remove_header_definition` — MEDIUM

Remove a reusable header definition from components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Header definition name to remove |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteHeaderDefinitionCommand(name)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.5 `document_add_example_definition` — MEDIUM

Add a reusable example to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Example name |
| `example` | `string` | yes | JSON string with the example definition |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddExampleDefinitionCommand(name, exampleObj)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.6 `document_remove_example_definition` — MEDIUM

Remove a reusable example from components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Example name to remove |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteExampleDefinitionCommand(name)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.7 `document_add_request_body_definition` — MEDIUM

Add a reusable request body definition to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Request body definition name |
| `requestBody` | `string` | yes | JSON string with the request body definition |

**Cmd: EXISTS** — Uses
`CommandFactory.createAddRequestBodyDefinitionCommand(name, reqBodyObj)`. Added in
`@apicurio/data-models` v2.5.1.

### 6.8 `document_remove_request_body_definition` — MEDIUM

Remove a reusable request body definition from components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Request body definition name to remove |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteRequestBodyDefinitionCommand(name)`. Added in
`@apicurio/data-models` v2.5.1.

---

## Category 7: Query Tools for Deeper Inspection — MEDIUM

The current query tools cover document-level lists but lack the ability to inspect the
internals of specific operations, responses, or schemas without using `document_get_node`.

**These are read-only query tools and do not require Commands.**

### 7.1 `document_list_parameters` — MEDIUM

List parameters on a specific path item or operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | no | HTTP method (omit for path-item-level parameters) |

**Cmd: N/A** — Read-only; implemented via visitor/node resolution.

### 7.2 `document_list_responses` — MEDIUM

List responses on a specific operation with status codes and descriptions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |

**Cmd: N/A** — Read-only; implemented via visitor/node resolution.

### 7.3 `document_list_media_types` — MEDIUM

List media types on a request body or response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the request body or response |

**Cmd: N/A** — Read-only; implemented via visitor/node resolution.

### 7.4 `document_list_extensions` — MEDIUM

List all vendor extensions on a specific node.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the node |

**Cmd: N/A** — Read-only; calls `getExtensions()` on the resolved node.

### 7.5 `document_list_examples` — MEDIUM

List examples on a media type, parameter, or header.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the parent node |

**Cmd: N/A** — Read-only; implemented via node resolution.

### 7.6 `document_find_refs` — MEDIUM

Find all `$ref` references to a given definition throughout the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `ref` | `string` | yes | The `$ref` string to search for (e.g. `#/components/schemas/Pet`) |

**Cmd: N/A** — Read-only; implemented via a `RefCollectorVisitor` that traverses the
entire document collecting all nodes whose `$ref` value matches the target string.
Returns node paths and parent context for each reference.

**Rationale:** Essential for understanding the impact of renaming or removing a schema,
response, or parameter definition.

---

## Category 8: Delete Contact / Delete License — MEDIUM

We can set contact and license info but not remove them entirely.

### 8.1 `document_delete_contact` — MEDIUM

Remove the contact object from the document info.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Cmd: EXISTS** — Uses `CommandFactory.createDeleteContactCommand(info)`.

### 8.2 `document_delete_license` — MEDIUM

Remove the license object from the document info.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Cmd: EXISTS** — Uses `CommandFactory.createDeleteLicenseCommand(info)`.

---

## Category 9: Update Extension — MEDIUM

We can add and remove extensions but not update them in place.

### 9.1 `document_update_extension` — MEDIUM

Update the value of an existing vendor extension.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the parent node |
| `name` | `string` | yes | Extension name (must start with `x-`) |
| `value` | `string` | yes | JSON string with the new extension value |

**Cmd: EXISTS** — Uses
`CommandFactory.createChangeExtensionCommand(parent, name, newValue)`.

---

## Category 10: Refactoring / Structural Operations — LOW

Higher-level operations that AI agents and visual editors frequently need but that don't
map to a single command. These are implemented as aggregations of existing commands.

### 10.1 `document_rename_path` — LOW

Rename a path (e.g. `/users` → `/accounts`), preserving all operations and configuration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `oldPath` | `string` | yes | Current path string |
| `newPath` | `string` | yes | New path string |

**Cmd: EXISTS** — Aggregate of `DeletePathCommand(oldPath)` +
`AddPathItemCommand(newPath, serializedContent)`. Serialize the old path item content
before deleting, then add the new path with the serialized content.

### 10.2 `document_rename_schema` — LOW

Rename a schema definition and update all `$ref` references throughout the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `oldName` | `string` | yes | Current schema name |
| `newName` | `string` | yes | New schema name |

**Cmd: NEEDS NEW** — Requires `RenameSchemaDefinitionCommand(oldName, newName)` in
`@apicurio/data-models`. Must atomically rename the definition and update all `$ref`
strings (e.g. `#/components/schemas/OldName` → `#/components/schemas/NewName`) throughout
the document. A simple aggregate of delete + add would not update `$ref` references.

### 10.3 `document_copy_operation` — LOW

Copy an operation from one path/method to another.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `sourcePath` | `string` | yes | Source API path |
| `sourceMethod` | `string` | yes | Source HTTP method |
| `targetPath` | `string` | yes | Target API path |
| `targetMethod` | `string` | yes | Target HTTP method |

**Cmd: EXISTS** — Aggregate of `CreateOperationCommand(targetPathItem, targetMethod)` +
`ReplaceOperationCommand(emptyOp, serializedSourceOp)`. Serialize the source operation,
create an empty target operation, then replace it with the serialized content.

### 10.4 `document_move_operation` — LOW

Move an operation from one path/method to another.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `sourcePath` | `string` | yes | Source API path |
| `sourceMethod` | `string` | yes | Source HTTP method |
| `targetPath` | `string` | yes | Target API path |
| `targetMethod` | `string` | yes | Target HTTP method |

**Cmd: EXISTS** — Aggregate of copy (10.3) + `DeleteOperationCommand(sourcePathItem,
sourceMethod)`.

---

## Category 11: Callback Management — LOW

Callbacks (webhooks) are an OAS 3.x feature with no command support in the library.

### 11.1 `document_add_callback` — LOW

Add a callback definition to an operation or to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the operation or components |
| `name` | `string` | yes | Callback name |
| `callback` | `string` | no | JSON string with the callback definition |

**Cmd: NEEDS NEW** — Requires `AddCallbackCommand(parent, name, callbackObj)` in
`@apicurio/data-models`.

### 11.2 `document_remove_callback` — LOW

Remove a callback from an operation or components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the operation or components |
| `name` | `string` | yes | Callback name to remove |

**Cmd: NEEDS NEW** — Requires `DeleteCallbackCommand(parent, name)`.

---

## Category 12: Link Management — LOW

Links (OAS 3.x runtime expressions connecting operations) have no command support.

### 12.1 `document_add_link` — LOW

Add a link to a response or to components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the response or components |
| `name` | `string` | yes | Link name |
| `link` | `string` | yes | JSON string with the link definition |

**Cmd: NEEDS NEW** — Requires `AddLinkCommand(parent, name, linkObj)` in
`@apicurio/data-models`.

### 12.2 `document_remove_link` — LOW

Remove a link from a response or components.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the response or components |
| `name` | `string` | yes | Link name to remove |

**Cmd: NEEDS NEW** — Requires `DeleteLinkCommand(parent, name)`.

---

## Category 13: External Documentation — LOW

External documentation links can appear on the document, tags, operations, and schemas.
No commands exist for this.

### 13.1 `document_set_external_docs` — LOW

Set external documentation on a node (document, tag, operation, or schema).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | no | Node path to the target; omit for document level |
| `url` | `string` | yes | External documentation URL |
| `description` | `string` | no | Description of the external docs |

**Cmd: NEEDS NEW** — Requires `SetExternalDocsCommand(parent, url, description)` in
`@apicurio/data-models`. The `externalDocs` node is a complex child object, so
`ChangePropertyCommand` (which handles only simple types) is not suitable.

---

## Category 14: Server Variable Management — LOW

Server variables (template parameters in server URLs like
`https://{environment}.api.com`) have no command support.

### 14.1 `document_add_server_variable` — LOW

Add a variable to a server definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the server |
| `name` | `string` | yes | Variable name (e.g. `environment`) |
| `default` | `string` | yes | Default value |
| `description` | `string` | no | Variable description |
| `enum` | `string` | no | JSON array of allowed values |

**Cmd: NEEDS NEW** — Requires `AddServerVariableCommand(server, name, defaultValue,
description, enumValues)` in `@apicurio/data-models`.

### 14.2 `document_remove_server_variable` — LOW

Remove a variable from a server definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the server |
| `name` | `string` | yes | Variable name to remove |

**Cmd: NEEDS NEW** — Requires `DeleteServerVariableCommand(server, name)`.

---

## Category 15: Bulk Delete Operations — LOW

"Delete all X from Y" commands are useful for visual editors doing bulk cleanup and for
AI agents resetting sections of a document.

### 15.1 `document_remove_all_operations` — LOW

Remove all operations from a path item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllPathItemOperationsCommand(pathItem)`.

### 15.2 `document_remove_all_responses` — LOW

Remove all responses from an operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllResponsesCommand(operation)`.

### 15.3 `document_remove_all_parameters` — LOW

Remove all parameters (or parameters of a specific type) from a path item or operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | no | HTTP method (omit for path-item level) |
| `type` | `string` | no | Parameter type filter (`query`, `header`, `path`, `cookie`) |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllPathItemParametersCommand(pathItem, type)` or
`CommandFactory.createDeleteAllOperationParametersCommand(operation, type)`.

### 15.4 `document_remove_all_response_headers` — LOW

Remove all headers from a response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the response |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllResponseHeadersCommand(response)`.

### 15.5 `document_remove_all_schema_properties` — LOW

Remove all properties from a schema.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `schemaName` | `string` | yes | Schema name |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllPropertiesCommand(schema)`.

### 15.6 `document_remove_all_servers` — LOW

Remove all servers from the document, a path item, or an operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | no | Node path; omit for document level |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllDocumentServersCommand(document)`,
`CommandFactory.createDeleteAllPathItemServersCommand(pathItem)`, or
`CommandFactory.createDeleteAllOperationServersCommand(operation)`.

### 15.7 `document_remove_all_tags` — LOW

Remove all tag definitions from the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Cmd: EXISTS** — Uses `CommandFactory.createDeleteAllTagsCommand()`.

### 15.8 `document_remove_all_security_schemes` — LOW

Remove all security scheme definitions from the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Cmd: EXISTS** — Uses
`CommandFactory.createDeleteAllSecuritySchemesCommand()`.

### 15.9 `document_remove_all_extensions` — LOW

Remove all vendor extensions from a node.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the node |

**Cmd: EXISTS** — Uses `new DeleteAllExtensionsCommand(parent)` (direct instantiation;
not exposed via `CommandFactory` but available as a library command class).

---

## Priority Summary

### HIGH — 9 tools (IMPLEMENTED)

| # | Tool | Cmd Status | Status |
|---|------|------------|--------|
| 1 | `document_add_schema_property` | EXISTS | DONE |
| 2 | `document_remove_schema_property` | EXISTS | DONE |
| 3 | `document_add_security_requirement` | EXISTS | DONE |
| 4 | `document_add_example` | EXISTS | DONE |
| 5 | `document_set_operation_info` | EXISTS | DONE |
| 6 | `document_set_operation_tags` | EXISTS | DONE |
| 7 | `document_set_schema_required` | EXISTS | DONE |
| 8 | `document_set_schema_type` | EXISTS | DONE |
| 9 | `document_add_schema_enum` | EXISTS | DONE |

### MEDIUM — 19 tools (IMPLEMENTED)

| # | Tool | Cmd Status | Status |
|---|------|------------|--------|
| 10 | `document_remove_all_security_requirements` | EXISTS | DONE |
| 11 | `document_remove_media_type` | EXISTS | DONE |
| 12 | `document_add_parameter_definition` | EXISTS | DONE |
| 13 | `document_remove_parameter_definition` | EXISTS | DONE |
| 14 | `document_add_header_definition` | EXISTS | DONE |
| 15 | `document_remove_header_definition` | EXISTS | DONE |
| 16 | `document_add_example_definition` | EXISTS | DONE |
| 17 | `document_remove_example_definition` | EXISTS | DONE |
| 18 | `document_add_request_body_definition` | EXISTS | DONE |
| 19 | `document_remove_request_body_definition` | EXISTS | DONE |
| 20 | `document_list_parameters` | N/A | DONE |
| 21 | `document_list_responses` | N/A | DONE |
| 22 | `document_list_media_types` | N/A | DONE |
| 23 | `document_list_extensions` | N/A | DONE |
| 24 | `document_list_examples` | N/A | DONE |
| 25 | `document_find_refs` | N/A | DONE |
| 26 | `document_delete_contact` | EXISTS | DONE |
| 27 | `document_delete_license` | EXISTS | DONE |
| 28 | `document_update_extension` | EXISTS | DONE |

### LOW — 21 tools (implement last)

| # | Tool | Cmd Status |
|---|------|------------|
| 29 | `document_remove_all_examples` | EXISTS |
| 30 | `document_rename_path` | EXISTS |
| 31 | `document_rename_schema` | NEEDS NEW |
| 32 | `document_copy_operation` | EXISTS |
| 33 | `document_move_operation` | EXISTS |
| 34 | `document_add_callback` | NEEDS NEW |
| 35 | `document_remove_callback` | NEEDS NEW |
| 36 | `document_add_link` | NEEDS NEW |
| 37 | `document_remove_link` | NEEDS NEW |
| 38 | `document_set_external_docs` | NEEDS NEW |
| 39 | `document_add_server_variable` | NEEDS NEW |
| 40 | `document_remove_server_variable` | NEEDS NEW |
| 41 | `document_remove_all_operations` | EXISTS |
| 42 | `document_remove_all_responses` | EXISTS |
| 43 | `document_remove_all_parameters` | EXISTS |
| 44 | `document_remove_all_response_headers` | EXISTS |
| 45 | `document_remove_all_schema_properties` | EXISTS |
| 46 | `document_remove_all_servers` | EXISTS |
| 47 | `document_remove_all_tags` | EXISTS |
| 48 | `document_remove_all_security_schemes` | EXISTS |
| 49 | `document_remove_all_extensions` | EXISTS |

---

## Command Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| EXISTS | 36 | Command exists in `@apicurio/data-models`; ready to implement |
| NEEDS NEW | 7 | Requires a new command in `@apicurio/data-models` first |
| N/A | 6 | Read-only query tool; no command needed |
| **Total** | **49** | |

Of these 49, 9 HIGH and 19 MEDIUM priority tools have been implemented, leaving **21
remaining** (all LOW priority). After all tools are implemented, the server would have
**102 tools** total (81 existing + 21 remaining).

### New Commands Required in `@apicurio/data-models`

The following 18 commands must be implemented in the `@apicurio/data-models` library
before the corresponding MCP tools can be built. Each has a tracking issue in
[Apicurio/apicurio-data-models](https://github.com/Apicurio/apicurio-data-models).

| # | Command | For Tool(s) | Priority | Issue |
|---|---------|-------------|----------|-------|
| 1 | `AddSchemaPropertyCommand` | `document_add_schema_property` | HIGH | [#983](https://github.com/Apicurio/apicurio-data-models/issues/983) |
| 2 | `DeleteSchemaPropertyCommand` | `document_remove_schema_property` | HIGH | [#984](https://github.com/Apicurio/apicurio-data-models/issues/984) |
| 3 | `AddParameterDefinitionCommand` | `document_add_parameter_definition` | MEDIUM | [#985](https://github.com/Apicurio/apicurio-data-models/issues/985) |
| 4 | `DeleteParameterDefinitionCommand` | `document_remove_parameter_definition` | MEDIUM | [#986](https://github.com/Apicurio/apicurio-data-models/issues/986) |
| 5 | `AddHeaderDefinitionCommand` | `document_add_header_definition` | MEDIUM | [#987](https://github.com/Apicurio/apicurio-data-models/issues/987) |
| 6 | `DeleteHeaderDefinitionCommand` | `document_remove_header_definition` | MEDIUM | [#988](https://github.com/Apicurio/apicurio-data-models/issues/988) |
| 7 | `AddExampleDefinitionCommand` | `document_add_example_definition` | MEDIUM | [#989](https://github.com/Apicurio/apicurio-data-models/issues/989) |
| 8 | `DeleteExampleDefinitionCommand` | `document_remove_example_definition` | MEDIUM | [#990](https://github.com/Apicurio/apicurio-data-models/issues/990) |
| 9 | `AddRequestBodyDefinitionCommand` | `document_add_request_body_definition` | MEDIUM | [#991](https://github.com/Apicurio/apicurio-data-models/issues/991) |
| 10 | `DeleteRequestBodyDefinitionCommand` | `document_remove_request_body_definition` | MEDIUM | [#992](https://github.com/Apicurio/apicurio-data-models/issues/992) |
| 11 | `RenameSchemaDefinitionCommand` | `document_rename_schema` | LOW | [#994](https://github.com/Apicurio/apicurio-data-models/issues/994) |
| 12 | `AddCallbackCommand` | `document_add_callback` | LOW | [#995](https://github.com/Apicurio/apicurio-data-models/issues/995) |
| 13 | `DeleteCallbackCommand` | `document_remove_callback` | LOW | [#995](https://github.com/Apicurio/apicurio-data-models/issues/995) |
| 14 | `AddLinkCommand` | `document_add_link` | LOW | [#996](https://github.com/Apicurio/apicurio-data-models/issues/996) |
| 15 | `DeleteLinkCommand` | `document_remove_link` | LOW | [#996](https://github.com/Apicurio/apicurio-data-models/issues/996) |
| 16 | `SetExternalDocsCommand` | `document_set_external_docs` | LOW | [#997](https://github.com/Apicurio/apicurio-data-models/issues/997) |
| 17 | `AddServerVariableCommand` | `document_add_server_variable` | LOW | [#998](https://github.com/Apicurio/apicurio-data-models/issues/998) |
| 18 | `DeleteServerVariableCommand` | `document_remove_server_variable` | LOW | [#998](https://github.com/Apicurio/apicurio-data-models/issues/998) |

---

## Implementation Notes

### New Visitors Needed

- **RefCollectorVisitor** — For `document_find_refs`. Traverses entire document collecting
  all nodes with a `$ref` property matching a given target string. Returns node paths and
  parent context for each reference.

### File Organization

Following the established pattern:
- **Schema property tools** → `src/tools/edit.ts`
- **Security requirement tools** → `src/tools/edit.ts`
- **Example tools** → `src/tools/edit.ts`
- **Operation metadata tools** → `src/tools/edit.ts`
- **Component definition tools** → `src/tools/edit.ts`
- **New query tools** → `src/tools/query.ts`
- **Refactoring tools** → new `src/tools/refactor.ts` (if edit.ts becomes too large)
- **Bulk delete tools** → `src/tools/edit.ts`
