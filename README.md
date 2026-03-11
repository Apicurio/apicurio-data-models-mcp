# apicurio-data-models-mcp

An MCP (Model Context Protocol) server that wraps the `@apicurio/data-models` library, making it
easy for AI coding agents to query, validate, and edit OpenAPI and AsyncAPI documents.

## Supported Specifications

- OpenAPI 2.0 (Swagger)
- OpenAPI 3.0.x
- AsyncAPI 2.x

## Quick Start

### Install from npm

```bash
npm install -g @apicurio/data-models-mcp
```

### Configure in Claude Code

The easiest way is to use the `claude mcp add` command:

```bash
claude mcp add apicurio-data-models apicurio-data-models-mcp
```

## Tool Catalog

The server provides **102 tools** across 5 categories: session management (7), document
querying (16), document editing (76), validation (1), and transformation (2).

See the [full tools reference](docs/Tools.md) for detailed documentation on every tool and
its parameters.

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
