# apicurio-data-models-mcp

An MCP (Model Context Protocol) server that wraps the `@apicurio/data-models` library, making it
easy for AI coding agents to query, validate, and edit OpenAPI and AsyncAPI documents.

## Supported Specifications

- OpenAPI 2.0 (Swagger)
- OpenAPI 3.0.x
- AsyncAPI 2.x

## Quick Start

```bash
npm install
npm run build
```

### Configure in Claude Code

Add to your MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
    "mcpServers": {
        "apicurio-data-models": {
            "command": "node",
            "args": ["/path/to/apicurio-data-models-mcp/dist/index.js"]
        }
    }
}
```

## Tool Catalog

### Session Management (5 tools)

| Tool | Description |
|------|-------------|
| `document_load` | Load an OpenAPI/AsyncAPI file into a named session |
| `document_create` | Create a new empty document in a named session |
| `document_save` | Save a session's document to a file (JSON or YAML) |
| `document_close` | Close a named session and release memory |
| `document_list_sessions` | List all active sessions |

### Query (5 tools)

| Tool | Description |
|------|-------------|
| `document_get_info` | Get document overview (type, title, version, path/schema counts) |
| `document_list_paths` | List all paths or channels with their operations |
| `document_get_operation` | Get full details of a specific operation |
| `document_list_schemas` | List all schema/component definitions |
| `document_get_node` | Get any node by its node path |

### Validation (1 tool)

| Tool | Description |
|------|-------------|
| `document_validate` | Validate the document and return structured problems |

### Editing (5 tools)

| Tool | Description |
|------|-------------|
| `document_set_info` | Set document title, description, and/or version |
| `document_add_path` | Add a new path item to an OpenAPI document |
| `document_add_schema` | Add a schema definition |
| `document_set_node` | Set/replace any node at a given node path |
| `document_remove_node` | Remove any node by its node path |

### Transformation (2 tools)

| Tool | Description |
|------|-------------|
| `document_transform` | Convert between spec versions (OpenAPI 2.0 -> 3.0) |
| `document_dereference` | Resolve all `$ref` references inline |

## MCP Resources

| URI Pattern | Description |
|-------------|-------------|
| `api://{session}/info` | Document metadata |
| `api://{session}/paths` | List of paths/channels |
| `api://{session}/schemas` | List of schema definitions |

## Usage Examples

### Load and inspect an existing API

```
> Load /path/to/petstore.yaml into session "petstore"
> What paths does the petstore API have?
> Show me the GET /pets operation
> Validate the document
```

### Create a new API from scratch

```
> Create a new OpenAPI 3.0 document called "widgets"
> Set the title to "Widget API" and version to "1.0.0"
> Add a path /widgets with GET and POST operations
> Add a Widget schema with id, name, and color properties
> Save it to ./widget-api.yaml as YAML
```

### Transform a Swagger document

```
> Load my swagger.json as "legacy"
> Transform it to OpenAPI 3.0
> Validate the transformed document
> Save it to openapi3.json
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```
