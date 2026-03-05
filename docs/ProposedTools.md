# Proposed New MCP Tools

This document proposes 33 new tools to extend the apicurio-data-models MCP server beyond
its current 18 tools, providing comprehensive coverage for AI-assisted API design and editing.

## Current State

The server currently has **18 tools** across 5 categories: session management (5), document
querying (5), document editing (5), validation (1), and transformation (2). The generic tools
`document_set_node`, `document_get_node`, and `document_remove_node` provide a fallback for
any operation, but they require the AI agent to understand internal node path syntax and
construct raw JSON payloads without validation. The proposed tools below provide semantic,
validated operations at the conceptual level an AI agent thinks at when designing APIs.

### Priority Levels

- **HIGH** — Core API design actions; implement first
- **MEDIUM** — Complete CRUD lifecycles and add useful queries; implement second
- **LOW** — Less common operations with reasonable generic-tool fallbacks; implement last

---

## Category 1: Operation Management

Operations (GET, POST, PUT, DELETE, etc.) are the core building blocks of an API. Currently,
an agent must use `document_add_path` with a fully-formed JSON body to create operations, or
use `document_set_node` to modify them. There are no dedicated tools for adding, removing, or
modifying individual operations on an existing path.

### 1.1 `document_add_operation` — HIGH

Add a new HTTP operation to an existing path item. Creates an empty operation skeleton that
can be further configured with parameters, request body, and responses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path (e.g., `/pets`) |
| `method` | `string` | yes | HTTP method (`get`, `post`, `put`, `delete`, `patch`, `options`, `head`) |

**Library command:** `CommandFactory.createCreateOperationCommand(pathItem, method)`

**Rationale:** This is the most common incremental edit when building an API. Currently
requires `document_set_node` with a full operation JSON, or using `document_add_path` with
the entire path item pre-built. The command creates the operation and wires it to the path
item properly.

### 1.2 `document_remove_operation` — HIGH

Remove a specific HTTP operation from a path item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path (e.g., `/pets`) |
| `method` | `string` | yes | HTTP method to remove |

**Library command:** `CommandFactory.createDeleteOperationCommand(pathItem, method)`

**Rationale:** Deleting an operation is a common editing action. Using `document_remove_node`
requires the agent to know the exact node path syntax (`/paths[/pets]/get`). This tool
provides a cleaner semantic interface.

---

## Category 2: Response Management

Responses are essential to every operation. An agent helping design an API will almost always
need to add/remove responses (200, 201, 400, 404, 500, etc.).

### 2.1 `document_add_response` — HIGH

Add a response to an operation by status code and description.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |
| `statusCode` | `string` | yes | HTTP status code (e.g., `200`, `404`, `default`) |
| `description` | `string` | yes | Response description |

**Library command:**
`CommandFactory.createAddResponseCommand(operation, statusCode, description)`

**Rationale:** Responses are the first thing an agent adds after creating an operation. The
command properly creates the responses container if it doesn't exist and handles the
status-code-keyed map structure that varies between OAS 2.0 and 3.x.

### 2.2 `document_remove_response` — MEDIUM

Remove a response from an operation by status code.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |
| `statusCode` | `string` | yes | HTTP status code to remove |

**Library command:**
`CommandFactory.createDeleteResponseCommand(operation, statusCode)`

**Rationale:** Pairs with `document_add_response` for complete response lifecycle management.

### 2.3 `document_add_response_definition` — MEDIUM

Add a reusable response definition to the document's components/definitions section.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Response definition name |
| `response` | `string` | yes | JSON string with the response definition content |

**Library command:**
`CommandFactory.createAddResponseDefinitionCommand(name, json)`

**Rationale:** Reusable response definitions (e.g., a standard `ErrorResponse`) are a best
practice that an AI agent should encourage. This mirrors the existing `document_add_schema`
tool for schemas.

---

## Category 3: Parameter Management

Parameters (query, path, header, cookie) are fundamental to operation design and are tedious
to construct manually via `document_set_node`.

### 3.1 `document_add_parameter` — HIGH

Add a parameter to a path item or operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | no | HTTP method (omit to add to path item level) |
| `name` | `string` | yes | Parameter name |
| `location` | `string` | yes | Parameter location: `query`, `path`, `header`, `cookie` |
| `description` | `string` | no | Parameter description |
| `required` | `boolean` | no | Whether the parameter is required (auto-set to `true` for path params) |
| `type` | `string` | no | Schema type: `string`, `integer`, `number`, `boolean`, `array` (defaults to `string`) |

**Library command:**
`CommandFactory.createAddParameterCommand(parent, name, location, description, required, type)`

**Rationale:** Parameters are the most common element added to operations. The command handles
the complex differences between OAS 2.0 (parameters are on the operation directly with a
`type` field) and OAS 3.x (parameters have a `schema` sub-object). Getting this right with
`document_set_node` requires spec-version-specific knowledge the agent shouldn't need.

### 3.2 `document_remove_parameter` — MEDIUM

Remove a parameter from a path item or operation by name and location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | no | HTTP method (omit for path item level) |
| `name` | `string` | yes | Parameter name |
| `location` | `string` | yes | Parameter location: `query`, `path`, `header`, `cookie` |

**Library command:**
`CommandFactory.createDeleteParameterCommand(parent, name, location)`

**Rationale:** Pairs with `document_add_parameter`. Parameters are identified by their
name+location combination, which the command handles correctly.

---

## Category 4: Request Body Management

Request bodies (OAS 3.x) are essential for POST/PUT/PATCH operations.

### 4.1 `document_add_request_body` — HIGH

Add an empty request body to an operation (OpenAPI 3.x only). The request body can then be
configured with media types using `document_add_media_type`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |

**Library command:** `CommandFactory.createAddRequestBodyCommand(operation)`

**Rationale:** In OAS 3.x, the request body is a separate object that must be created before
media types can be added to it. This is a prerequisite step for defining what a POST/PUT
endpoint accepts.

### 4.2 `document_remove_request_body` — LOW

Remove the request body from an operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path |
| `method` | `string` | yes | HTTP method |

**Library command:** `CommandFactory.createDeleteRequestBodyCommand(operation)`

**Rationale:** Less common than adding, but needed for completeness.

---

## Category 5: Media Type Management

Media types define the content format (e.g., `application/json`) and schema for request
bodies and responses.

### 5.1 `document_add_media_type` — HIGH

Add a media type entry to a request body or response (OpenAPI 3.x).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the request body or response (e.g., `/paths[/pets]/post/requestBody` or `/paths[/pets]/get/responses[200]`) |
| `mediaType` | `string` | yes | Media type string (e.g., `application/json`, `application/xml`) |

**Library command:**
`CommandFactory.createAddMediaTypeCommand(parent, mediaTypeName)`

**Rationale:** Media types are the bridge between operations and schemas in OAS 3.x. After
adding a request body or response, the next step is always to add a media type. This is
awkward with `document_set_node` because the agent must construct the correct nested content
map structure.

### 5.2 `document_set_media_type_schema` — HIGH

Set the schema for a media type, either as a `$ref` to a schema definition or as an inline
type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the media type (e.g., `/paths[/pets]/post/requestBody/content[application/json]`) |
| `schemaRef` | `string` | no | Schema `$ref` string (e.g., `#/components/schemas/Pet`) |
| `schemaType` | `string` | no | Inline schema type (`string`, `integer`, `object`, `array`, etc.) |

**Library command:**
`CommandFactory.createChangeMediaTypeSchemaCommand(mediaType, schemaRef, schemaType)`

**Rationale:** Wiring a schema to a media type is the critical step that connects the data
model to the API operations. The command handles the `$ref` vs inline type distinction
correctly.

---

## Category 6: Security Scheme Management

Security schemes define the authentication mechanisms for an API (API keys, OAuth2, HTTP
bearer, etc.). An AI agent designing an API will frequently need to set up security.

### 6.1 `document_add_security_scheme` — HIGH

Add a security scheme definition to the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Security scheme name (e.g., `bearerAuth`, `apiKey`) |
| `scheme` | `string` | yes | JSON string with the security scheme definition |

**Library command:**
`CommandFactory.createAddSecuritySchemeCommand(name, schemeObj)`

**Rationale:** Security is a critical part of API design. The command ensures the security
scheme is added to the correct location (OAS 2.0 `securityDefinitions` vs OAS 3.x
`components/securitySchemes`) and creates the container if needed.

### 6.2 `document_update_security_scheme` — LOW

Update an existing security scheme definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Security scheme name |
| `scheme` | `string` | yes | JSON string with the updated security scheme definition |

**Library command:**
`CommandFactory.createUpdateSecuritySchemeCommand(name, newSchemeObj)`

**Rationale:** Less common than initial creation, but important for iterating on security
configuration.

### 6.3 `document_remove_security_scheme` — MEDIUM

Remove a security scheme definition from the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Security scheme name to remove |

**Library command:** `CommandFactory.createDeleteSecuritySchemeCommand(name)`

**Rationale:** Completes the CRUD lifecycle for security schemes.

---

## Category 7: Tag Management

Tags are used to group operations logically (e.g., "pets", "users", "orders"). They are a
top-level document concept and are commonly managed during API design.

### 7.1 `document_add_tag` — MEDIUM

Add a tag to the document's top-level tags list.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Tag name |
| `description` | `string` | no | Tag description |

**Library command:** `CommandFactory.createAddTagCommand(name, description)`

**Rationale:** Tags are recommended best practice for API organization. The command ensures
the tag is added to the document-level `tags` array with proper deduplication.

### 7.2 `document_remove_tag` — LOW

Remove a tag from the document's top-level tags list.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Tag name to remove |

**Library command:** `CommandFactory.createDeleteTagCommand(name)`

### 7.3 `document_rename_tag` — LOW

Rename a tag across the entire document (updates both the tag definition and all operation
references).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `oldName` | `string` | yes | Current tag name |
| `newName` | `string` | yes | New tag name |

**Library command:** `CommandFactory.createRenameTagCommand(oldName, newName)`

**Rationale:** Renaming a tag is a refactoring operation that must update all references.
Doing this manually via `document_set_node` would require finding and updating every
operation that references the tag.

---

## Category 8: Server Management

Servers define the base URLs where the API is hosted. This is commonly configured during API
design.

### 8.1 `document_add_server` — MEDIUM

Add a server to the document (or to a specific path item or operation for OAS 3.x).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `url` | `string` | yes | Server URL (e.g., `https://api.example.com/v1`) |
| `description` | `string` | no | Server description |
| `nodePath` | `string` | no | Node path for scoped servers (e.g., `/paths[/pets]` for path-level). Omit for document-level. |

**Library command:**
`CommandFactory.createAddServerCommand(parent, serverUrl, serverDescription)` (OpenAPI
variant)

**Rationale:** Server URLs are one of the first things configured when creating an API. The
command handles spec-version differences (OAS 2.0 uses `host`/`basePath`, OAS 3.x has a
`servers` array).

### 8.2 `document_remove_server` — LOW

Remove a server from the document or a specific scope.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `url` | `string` | yes | Server URL to remove |
| `nodePath` | `string` | no | Node path for scoped servers. Omit for document-level. |

**Library command:**
`CommandFactory.createDeleteServerCommand(parent, serverUrl)` (OpenAPI variant)

---

## Category 9: Contact and License Management

Contact and license information is part of the document's `info` section. These are commonly
set during initial API setup.

### 9.1 `document_set_contact` — MEDIUM

Set or update the API contact information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | no | Contact name |
| `email` | `string` | no | Contact email |
| `url` | `string` | no | Contact URL |

**Library command:** `CommandFactory.createChangeContactCommand(name, email, url)`

**Rationale:** Setting contact info is a common initial setup step. The command creates the
contact object if it doesn't exist.

### 9.2 `document_set_license` — MEDIUM

Set or update the API license information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | License name (e.g., `Apache 2.0`, `MIT`) |
| `url` | `string` | no | License URL |

**Library command:** `CommandFactory.createChangeLicenseCommand(name, url)`

**Rationale:** License information is a best practice for public APIs. The command creates
the license object if it doesn't exist.

---

## Category 10: Schema Management (Enhancements)

The existing `document_add_schema` tool handles creation. These tools complete the lifecycle.

### 10.1 `document_remove_schema` — MEDIUM

Remove a schema definition from the document by name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Schema name to remove |

**Library command:** `CommandFactory.createDeleteSchemaCommand(name)`

**Rationale:** While `document_remove_node` can do this, it requires the agent to know the
exact path syntax (`/components/schemas[Pet]` for OAS 3.x vs `/definitions[Pet]` for OAS
2.0). This tool abstracts away the spec-version difference.

### 10.2 `document_get_schema` — MEDIUM

Get the full definition of a schema by name, without needing to know the node path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `name` | `string` | yes | Schema name |

**Implementation:** Uses a visitor to find the schema container, then retrieves the named
schema and serializes it with `Library.writeNode()`.

**Rationale:** The existing `document_list_schemas` returns only names. Getting the actual
schema body requires `document_get_node` with spec-version-dependent paths. This tool
provides a clean shortcut.

---

## Category 11: Path Management (Enhancements)

### 11.1 `document_remove_path` — MEDIUM

Remove a path item from the document by path string.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `path` | `string` | yes | The API path to remove (e.g., `/pets/{petId}`) |

**Library command:** `CommandFactory.createDeletePathCommand(pathName)`

**Rationale:** While `document_remove_node` can do this with `/paths[/pets/{petId}]`, the
semantic tool is cleaner and doesn't require the agent to know node path syntax with the
bracket notation.

### 11.2 `document_add_channel` — MEDIUM

Add a channel item to an AsyncAPI document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `channel` | `string` | yes | Channel name (e.g., `user/signedup`) |
| `channelItem` | `string` | no | JSON string with channel item content |

**Library command:**
`CommandFactory.createAddChannelItemCommand(channelName, json)`

**Rationale:** This is the AsyncAPI equivalent of `document_add_path` for OpenAPI. Currently
there is no dedicated tool for adding AsyncAPI channels.

---

## Category 12: Extension Management

Extensions (`x-*` properties) are widely used for documentation, code generation hints, and
vendor-specific metadata.

### 12.1 `document_add_extension` — LOW

Add a vendor extension (`x-*` property) to any node in the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the parent (e.g., `/info`, `/paths[/pets]/get`) |
| `name` | `string` | yes | Extension name (must start with `x-`) |
| `value` | `string` | yes | JSON string with the extension value |

**Library command:**
`CommandFactory.createAddExtensionCommand(parent, name, value)`

**Rationale:** Extensions are a common need for API tooling integration (code generators,
gateways, documentation tools). The command validates that the name starts with `x-`.

### 12.2 `document_remove_extension` — LOW

Remove a vendor extension from a node.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the parent |
| `name` | `string` | yes | Extension name to remove |

**Library command:**
`CommandFactory.createDeleteExtensionCommand(parent, name)`

---

## Category 13: Response Header Management

### 13.1 `document_add_response_header` — MEDIUM

Add a header to a response definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the response (e.g., `/paths[/pets]/get/responses[200]`) |
| `name` | `string` | yes | Header name (e.g., `X-Rate-Limit`) |
| `description` | `string` | no | Header description |
| `schemaType` | `string` | no | Schema type (defaults to `string`) |
| `schemaRef` | `string` | no | Schema `$ref` (alternative to `schemaType`) |

**Library command:**
`CommandFactory.createAddResponseHeaderCommand(response, name, description, schemaType,
schemaRef)`

**Rationale:** Response headers (rate limits, pagination cursors, correlation IDs) are common
in well-designed APIs. Constructing the correct header structure manually varies between OAS
2.0 and 3.x.

### 13.2 `document_remove_response_header` — LOW

Remove a header from a response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `nodePath` | `string` | yes | Node path to the response |
| `name` | `string` | yes | Header name to remove |

**Library command:**
`CommandFactory.createDeleteResponseHeaderCommand(response, name)`

---

## Category 14: Enhanced Query Tools

The current query tools cover document-level information but lack the ability to answer
specific questions about an API's structure.

### 14.1 `document_list_operations` — HIGH

List all operations across the entire document, returning path, method, operationId, summary,
and tags for each.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Implementation:** A new `OperationCollectorVisitor` that extends `CombinedVisitorAdapter`,
overriding `visitOperation()` and using reverse traversal to determine the parent path and
method.

**Rationale:** The current `document_list_paths` returns paths with their methods, but not
operationId, summary, or tags. An AI agent frequently needs to answer "what operations
exist?" and "what does operation X do?" — this tool provides the complete picture in a
single call.

### 14.2 `document_list_security_schemes` — MEDIUM

List all security scheme definitions in the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Implementation:** A new `SecuritySchemeCollectorVisitor` that visits security definitions
(OAS 2.0) and components (OAS 3.x).

**Rationale:** There is no current way to list security schemes without using
`document_get_node` and knowing the exact path. An agent setting up or reviewing API security
needs this information.

### 14.3 `document_list_servers` — MEDIUM

List all servers defined in the document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Implementation:** A new `ServerCollectorVisitor` or direct access through the document
model.

**Rationale:** Servers are fundamental metadata about where the API is hosted. An agent
reviewing or modifying server configuration needs to see the current state.

### 14.4 `document_list_tags` — MEDIUM

List all tags defined in the document with their descriptions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |

**Implementation:** Direct access through the OpenAPI document's `getTags()` method.

**Rationale:** Tags are used for API organization and documentation. An agent needs to see
existing tags before assigning them to operations or adding new ones.

---

## Category 15: Document-Level Utility Tools

### 15.1 `document_export` — MEDIUM

Export the document as a JSON or YAML string without writing to a file. Returns the
serialized content directly in the MCP response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Session name |
| `format` | `string` | no | Output format: `json` or `yaml` (defaults to session format) |

**Implementation:** Uses `Library.writeNode()` and `serializeContent()` from
`util/format.ts`.

**Rationale:** Currently, the only way to see the full document is to save it to a file and
then read the file. An agent may need to inspect or share the full document content without
file I/O.

### 15.2 `document_clone_session` — LOW

Clone an existing session into a new session, creating a deep copy of the document. Useful
for experimenting with changes without affecting the original.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session` | `string` | yes | Source session name |
| `newSession` | `string` | yes | Name for the cloned session |

**Implementation:** Uses `Library.cloneDocument()` to deep-copy the document model.

**Rationale:** An AI agent may want to try multiple design approaches or create a variant
without losing the current state. This supports a "branch and experiment" workflow.

---

## Priority Summary

### HIGH — 9 tools (implement first)

These represent the most common operations when an AI agent is helping design an API:

| # | Tool | Category |
|---|------|----------|
| 1 | `document_add_operation` | Operation Management |
| 2 | `document_remove_operation` | Operation Management |
| 3 | `document_add_response` | Response Management |
| 4 | `document_add_parameter` | Parameter Management |
| 5 | `document_add_request_body` | Request Body Management |
| 6 | `document_add_media_type` | Media Type Management |
| 7 | `document_set_media_type_schema` | Media Type Management |
| 8 | `document_add_security_scheme` | Security Scheme Management |
| 9 | `document_list_operations` | Enhanced Query Tools |

### MEDIUM — 17 tools (implement second)

These complete the CRUD lifecycle and add useful query capabilities:

| # | Tool | Category |
|---|------|----------|
| 10 | `document_remove_response` | Response Management |
| 11 | `document_add_response_definition` | Response Management |
| 12 | `document_remove_parameter` | Parameter Management |
| 13 | `document_remove_security_scheme` | Security Scheme Management |
| 14 | `document_add_tag` | Tag Management |
| 15 | `document_add_server` | Server Management |
| 16 | `document_set_contact` | Contact and License |
| 17 | `document_set_license` | Contact and License |
| 18 | `document_remove_schema` | Schema Enhancements |
| 19 | `document_get_schema` | Schema Enhancements |
| 20 | `document_remove_path` | Path Enhancements |
| 21 | `document_add_channel` | Path Enhancements |
| 22 | `document_add_response_header` | Response Headers |
| 23 | `document_list_security_schemes` | Enhanced Query Tools |
| 24 | `document_list_servers` | Enhanced Query Tools |
| 25 | `document_list_tags` | Enhanced Query Tools |
| 26 | `document_export` | Utility Tools |

### LOW — 9 tools (implement last)

These handle less common scenarios or have reasonable fallbacks with generic tools:

| # | Tool | Category |
|---|------|----------|
| 27 | `document_remove_request_body` | Request Body Management |
| 28 | `document_update_security_scheme` | Security Scheme Management |
| 29 | `document_remove_tag` | Tag Management |
| 30 | `document_rename_tag` | Tag Management |
| 31 | `document_remove_server` | Server Management |
| 32 | `document_add_extension` | Extension Management |
| 33 | `document_remove_extension` | Extension Management |
| 34 | `document_remove_response_header` | Response Headers |
| 35 | `document_clone_session` | Utility Tools |

---

## Tool Count by Category

| Category | New Tools | HIGH | MEDIUM | LOW |
|----------|-----------|------|--------|-----|
| Operation Management | 2 | 2 | 0 | 0 |
| Response Management | 3 | 1 | 2 | 0 |
| Parameter Management | 2 | 1 | 1 | 0 |
| Request Body Management | 2 | 1 | 0 | 1 |
| Media Type Management | 2 | 2 | 0 | 0 |
| Security Scheme Management | 3 | 1 | 1 | 1 |
| Tag Management | 3 | 0 | 1 | 2 |
| Server Management | 2 | 0 | 1 | 1 |
| Contact and License | 2 | 0 | 2 | 0 |
| Schema Enhancements | 2 | 0 | 2 | 0 |
| Path Enhancements | 2 | 0 | 2 | 0 |
| Extension Management | 2 | 0 | 0 | 2 |
| Response Headers | 2 | 0 | 1 | 1 |
| Enhanced Query Tools | 4 | 1 | 3 | 0 |
| Utility Tools | 2 | 0 | 1 | 1 |
| **Total** | **35** | **9** | **17** | **9** |

After implementation, the server would have **53 tools** total (18 existing + 35 new),
providing comprehensive coverage for AI-assisted API design.

---

## Implementation Notes

### File Organization

New tools should follow the existing pattern of registering in category-specific files:

- **Operation, Response, Parameter, Request Body, Media Type tools** →
  `src/tools/edit.ts` (or split into a new `src/tools/operation.ts` if `edit.ts` becomes
  too large)
- **Security, Tag, Server, Contact/License tools** → `src/tools/edit.ts` or new
  `src/tools/metadata.ts`
- **New query tools** → `src/tools/query.ts`
- **Extension tools** → `src/tools/edit.ts`
- **Export, Clone tools** → `src/tools/session.ts`

### New Visitors Needed

1. **`OperationCollectorVisitor`** — For `document_list_operations`. Visits all operations
   and collects path, method, operationId, summary, tags, and response status codes.
2. **`SecuritySchemeCollectorVisitor`** — For `document_list_security_schemes`. Visits
   security definitions/components and collects scheme names and types.
3. **`ServerCollectorVisitor`** — For `document_list_servers`. Visits servers and collects
   URL and description.
4. **`TagCollectorVisitor`** — For `document_list_tags`. Visits document tags and collects
   name and description.

### Common Implementation Pattern

Every new edit tool follows this pattern (visible in the existing `document_add_path` and
`document_set_info` implementations):

```typescript
server.tool(
    "document_<verb>_<noun>",
    "<description>",
    {
        session: z.string().describe("Session name"),
        // ... other params with z.string(), z.boolean(), z.enum(), etc.
    },
    withErrorHandling(async (args) => {
        const { session, ...rest } = args;
        const entry = sessionManager.getSession(session);
        const doc = entry.document;

        // Resolve parent node(s) via NodePath if needed
        // Validate preconditions
        // Create and execute command(s)

        const command = CommandFactory.createXxxCommand(...);
        command.execute(doc);

        sessionManager.touchSession(session);

        return successResult({ session, /* result fields */ });
    }),
);
```

### Node Resolution Helper

Many of the new tools need to resolve a path+method to an operation node, or a path to a
path item node. Consider extracting a shared helper:

```typescript
function resolveOperation(
    doc: Document,
    apiPath: string,
    method: string,
): Node | null {
    const nodePath = NodePath.parse(`/paths[${apiPath}]/${method.toLowerCase()}`);
    return Library.resolveNodePath(nodePath, doc);
}

function resolvePathItem(
    doc: Document,
    apiPath: string,
): Node | null {
    const nodePath = NodePath.parse(`/paths[${apiPath}]`);
    return Library.resolveNodePath(nodePath, doc);
}
```
