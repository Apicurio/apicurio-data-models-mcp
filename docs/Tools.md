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
