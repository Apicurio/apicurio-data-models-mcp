# MCP Tools Reference

This document lists all tools provided by the apicurio-data-models MCP server, organized by
category.

---

## Session

Tools for loading, creating, saving, closing, and listing document sessions.

### `document_load`

Load an OpenAPI or AsyncAPI file into a named session.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Name for this session |
| `filePath` | string | yes | Absolute or relative path to the file |
| `format` | `"json"` \| `"yaml"` | no | Force format; auto-detected if omitted |

### `document_create`

Create a new empty OpenAPI or AsyncAPI document in a named session.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Name for this session |
| `modelType` | string | yes | Document type to create (`openapi2`, `openapi3`, `asyncapi2`, etc.) |
| `title` | string | no | Document title |
| `version` | string | no | Document version |

### `document_save`

Save the document from a session to a file.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `filePath` | string | no | File path to save to; defaults to the original load path |
| `format` | `"json"` \| `"yaml"` | no | Output format; defaults to session format |

### `document_close`

Close a named session and release the document from memory.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name to close |

### `document_list_sessions`

List all active document sessions.

_No arguments._

### `document_export`

Export the document content as a JSON or YAML string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `format` | `"json"` \| `"yaml"` | no | Output format; defaults to the session's current format |

### `document_clone_session`

Clone an existing session into a new session with a deep copy of the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Source session name to clone |
| `newSession` | string | yes | Name for the cloned session |

---

## Query

Tools for inspecting and navigating document content.

### `document_get_info`

Get document overview: type, title, version, path/schema counts.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_list_paths`

List all paths (OpenAPI) or channels (AsyncAPI) with their operations.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_get_operation`

Get full details of a specific operation by path and HTTP method.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets/{petId}`) |
| `method` | string | no | HTTP method (`get`, `post`, `put`, etc.); if omitted, returns all operations on the path |

### `document_list_schemas`

List all schema/component definitions in the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_get_node`

Get any node by its node path (e.g. `/paths[/pets]/get`, `/info`,
`/components/schemas[Pet]`).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path string (e.g. `/info`, `/paths[/pets]/get`) |

### `document_list_operations`

List all operations across the entire document with path, method, operationId, summary, and
tags.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_get_schema`

Get a specific schema definition by name with its full content.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Schema name (e.g. `Pet`, `Error`) |

### `document_list_security_schemes`

List all security scheme definitions in the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_list_servers`

List all server definitions in the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

### `document_list_tags`

List all tag definitions in the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |

---

## Edit

Tools for modifying document content.

### `document_set_info`

Set document title, description, and/or version.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `title` | string | no | New document title |
| `description` | string | no | New document description |
| `version` | string | no | New document version |

### `document_add_path`

Add a new path item to an OpenAPI document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The path string (e.g. `/users`) |
| `pathItem` | string | no | JSON string with path item content (operations, etc.) |

### `document_add_schema`

Add a schema definition to the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Schema name |
| `schema` | string | yes | JSON string with the schema definition |

### `document_set_node`

Set or replace any node at a given node path using in-place update.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to set (e.g. `/info`, `/paths[/pets]/get`) |
| `value` | string | yes | JSON string with the new node value |

### `document_remove_node`

Remove any node at a given node path.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to remove (e.g. `/paths[/pets]`, `/components/schemas[Pet]`) |

### `document_add_operation`

Add a new HTTP operation to an existing path item.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method (`get`, `post`, `put`, `delete`, `patch`, `options`, `head`) |

### `document_remove_operation`

Remove a specific HTTP operation from a path item.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method to remove |

### `document_add_response`

Add a response to an operation by status code and description.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path |
| `method` | string | yes | HTTP method |
| `statusCode` | string | yes | HTTP status code (e.g. `200`, `404`, `default`) |
| `description` | string | yes | Response description |

### `document_add_parameter`

Add a parameter to a path item or operation.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path |
| `method` | string | no | HTTP method (omit to add to path item level) |
| `name` | string | yes | Parameter name |
| `location` | string | yes | Parameter location: `query`, `path`, `header`, `cookie` |
| `description` | string | no | Parameter description |
| `required` | boolean | no | Whether the parameter is required (auto-set to `true` for path params) |
| `type` | string | no | Schema type (`string`, `integer`, `number`, `boolean`, `array`). Defaults to `string` |

### `document_add_request_body`

Add an empty request body to an operation (OpenAPI 3.x only).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path |
| `method` | string | yes | HTTP method (e.g. `post`, `put`, `patch`) |

### `document_add_media_type`

Add a media type to a request body or response (OpenAPI 3.x).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the request body or response (e.g. `/paths[/pets]/post/requestBody`) |
| `mediaType` | string | yes | Media type string (e.g. `application/json`, `application/xml`) |

### `document_set_media_type_schema`

Set the schema for a media type, either as a `$ref` or inline type.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the media type (e.g. `/paths[/pets]/post/requestBody/content[application/json]`) |
| `schemaRef` | string | no | Schema `$ref` string (e.g. `#/components/schemas/Pet`) |
| `schemaType` | string | no | Inline schema type (`string`, `integer`, `object`, `array`, etc.) |

### `document_add_security_scheme`

Add a security scheme definition to the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Security scheme name (e.g. `bearerAuth`, `apiKey`) |
| `scheme` | string | yes | JSON string with the security scheme definition |

### `document_remove_response`

Remove a response from an operation by status code.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method |
| `statusCode` | string | yes | HTTP status code to remove (e.g. `200`, `404`, `default`) |

### `document_add_response_definition`

Add a reusable response definition to the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Response definition name (e.g. `NotFound`, `ErrorResponse`) |
| `response` | string | yes | JSON string with the response definition |

### `document_remove_parameter`

Remove a parameter from a path item or operation.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path |
| `method` | string | no | HTTP method (omit to remove from path item level) |
| `name` | string | yes | Parameter name to remove |
| `location` | string | yes | Parameter location: `query`, `path`, `header`, `cookie` |

### `document_remove_security_scheme`

Remove a security scheme definition from the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Security scheme name to remove |

### `document_add_tag`

Add a tag definition to the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Tag name |
| `description` | string | no | Tag description |

### `document_add_server`

Add a server to the document or to a specific path/operation.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `url` | string | yes | Server URL (e.g. `https://api.example.com/v1`) |
| `description` | string | no | Server description |
| `nodePath` | string | no | Node path to add the server to; if omitted, adds to document level |

### `document_set_contact`

Set the contact information in the document info.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | no | Contact name |
| `email` | string | no | Contact email |
| `url` | string | no | Contact URL |

### `document_set_license`

Set the license information in the document info.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | License name (e.g. `Apache 2.0`, `MIT`) |
| `url` | string | no | License URL |

### `document_remove_schema`

Remove a schema definition from the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Schema name to remove (e.g. `Pet`, `Error`) |

### `document_remove_path`

Remove a path item from the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path to remove (e.g. `/pets/{petId}`) |

### `document_add_channel`

Add a channel item to an AsyncAPI document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `channel` | string | yes | Channel name (e.g. `user/signedup`) |
| `channelItem` | string | no | JSON string with channel item content |

### `document_add_response_header`

Add a header to an OpenAPI response.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the response (e.g. `/paths[/pets]/get/responses[200]`) |
| `name` | string | yes | Header name (e.g. `X-Rate-Limit`) |
| `description` | string | no | Header description |
| `schemaType` | string | no | Schema type (defaults to `string`) |
| `schemaRef` | string | no | Schema `$ref` string |

### `document_remove_request_body`

Remove the request body from an operation (OpenAPI 3.x only).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method (e.g. `post`, `put`, `patch`) |

### `document_update_security_scheme`

Update an existing security scheme definition.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Security scheme name to update |
| `scheme` | string | yes | JSON string with the updated security scheme definition |

### `document_remove_tag`

Remove a tag definition from the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `name` | string | yes | Tag name to remove |

### `document_rename_tag`

Rename a tag across the entire document (updates both the tag definition and all operation
references).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `oldName` | string | yes | Current tag name |
| `newName` | string | yes | New tag name |

### `document_remove_server`

Remove a server from the document or a specific scope.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `url` | string | yes | Server URL to remove |
| `nodePath` | string | no | Node path for scoped servers; if omitted, removes from document level |

### `document_add_extension`

Add a vendor extension (`x-*` property) to any node in the document.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the parent (e.g. `/info`, `/paths[/pets]/get`) |
| `name` | string | yes | Extension name (must start with `x-`) |
| `value` | string | yes | JSON string with the extension value |

### `document_remove_extension`

Remove a vendor extension (`x-*` property) from a node.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the parent |
| `name` | string | yes | Extension name to remove (must start with `x-`) |

### `document_remove_response_header`

Remove a header from an OpenAPI response.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the response (e.g. `/paths[/pets]/get/responses[200]`) |
| `name` | string | yes | Header name to remove (e.g. `X-Rate-Limit`) |

### `document_add_schema_property`

Add a named property to an object schema definition.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `schemaName` | string | yes | Name of the schema definition (e.g. `Pet`) |
| `propertyName` | string | yes | Property name to add (e.g. `status`) |
| `schema` | string | yes | JSON string with the property schema (e.g. `{"type":"string"}`) |

### `document_remove_schema_property`

Remove a named property from an object schema definition.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `schemaName` | string | yes | Name of the schema definition (e.g. `Pet`) |
| `propertyName` | string | yes | Property name to remove |

### `document_add_security_requirement`

Add a security requirement to the document or to a specific operation.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `requirement` | string | yes | JSON object mapping scheme names to scopes (e.g. `{"bearerAuth":[]}`) |
| `path` | string | no | API path (required if applying to an operation) |
| `method` | string | no | HTTP method (required if applying to an operation) |

### `document_add_example`

Add a named example to a media type, parameter, or header (OpenAPI 3.x only).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the media type, parameter, or header |
| `name` | string | yes | Example name |
| `value` | string | yes | JSON string with the example value |
| `summary` | string | no | Example summary |
| `description` | string | no | Example description |

### `document_set_operation_info`

Set metadata properties on an operation (operationId, summary, description, deprecated).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method (`get`, `post`, `put`, etc.) |
| `operationId` | string | no | Operation ID |
| `summary` | string | no | Operation summary |
| `description` | string | no | Operation description |
| `deprecated` | boolean | no | Whether the operation is deprecated |

### `document_set_operation_tags`

Set the tags array on an operation.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `path` | string | yes | The API path (e.g. `/pets`) |
| `method` | string | yes | HTTP method (`get`, `post`, `put`, etc.) |
| `tags` | string | yes | JSON array of tag names (e.g. `["pets","admin"]`) |

### `document_set_schema_required`

Set the `required` array on a schema, controlling which properties are mandatory.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `schemaName` | string | yes | Name of the schema definition (e.g. `Pet`) |
| `required` | string | yes | JSON array of required property names (e.g. `["id","name"]`) |

### `document_set_schema_type`

Set the `type` field on a schema (string, object, array, integer, number, boolean).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the schema |
| `type` | string | yes | Schema type value |

### `document_add_schema_enum`

Set enum values on a schema.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | yes | Node path to the schema |
| `values` | string | yes | JSON array of enum values (e.g. `["active","inactive"]`) |

---

## Validation

Tools for validating documents against their specification.

### `document_validate`

Validate the document and return structured validation problems.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `nodePath` | string | no | Optional node path to validate a specific subtree |

---

## Transform

Tools for converting document format and spec version.

### `document_transform`

Convert an OpenAPI document between spec versions (e.g. OpenAPI 2.0 to 3.0, 3.0 to 3.1).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
| `targetType` | string | yes | Target document type (e.g. `openapi3`) |

### `document_dereference`

Resolve all `$ref` references in the document, pulling external references inline.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session` | string | yes | Session name |
