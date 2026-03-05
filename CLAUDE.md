# Project Guidelines

## Overview

This is an MCP (Model Context Protocol) server that wraps the `@apicurio/data-models` library to
provide AI-assisted querying, editing, validation, and transformation of OpenAPI and AsyncAPI
documents. It is a TypeScript project using the `@modelcontextprotocol/sdk`.

## Architecture

### Source Layout

```
src/
  index.ts              # Entry point (stdio transport)
  server.ts             # MCP server creation and tool/resource registration
  session-manager.ts    # In-memory session store (Map<string, SessionEntry>)
  tools/
    session.ts          # Session lifecycle tools (create, list, get, close, export)
    query.ts            # Document query tools (info, paths, schemas, nodes, operations)
    edit.ts             # Document editing tools (set, remove, add schema)
    transform.ts        # Format conversion tools (JSON/YAML, version conversion)
    validation.ts       # Document validation tool
  resources/
    document.ts         # MCP resource templates (info, paths, schemas per session)
  visitors/
    index.ts            # Barrel export for all visitors
    DocumentInfoVisitor.ts
    OperationCollectorVisitor.ts
    PathCollectorVisitor.ts
    SchemaCollectorVisitor.ts
    SchemaContainerVisitor.ts
    SecuritySchemeCollectorVisitor.ts
    ServerCollectorVisitor.ts
    TagCollectorVisitor.ts
    ClearNodeVisitor.ts
    RemoveNodeVisitor.ts
  util/
    errors.ts           # Error result helpers
    format.ts           # JSON/YAML format detection and serialization
    model-type-map.ts   # ModelType string-to-enum mapping
```

### Session Model

Documents are managed through named sessions stored in a singleton `SessionManager`. Each session
holds a parsed `Document` object from the data-models library, along with metadata (model type,
file path, format, timestamps). Tools receive a `session_name` parameter to identify which
document to operate on.

### Tool Categories

- **Session tools** (6): `document_load`, `document_create`, `document_save`,
  `document_close`, `document_list_sessions`, `document_export`
- **Query tools** (10): `document_get_info`, `document_list_paths`, `document_get_operation`,
  `document_list_schemas`, `document_get_node`, `document_list_operations`,
  `document_get_schema`, `document_list_security_schemes`, `document_list_servers`,
  `document_list_tags`
- **Edit tools** (25): `document_set_info`, `document_add_path`, `document_add_schema`,
  `document_set_node`, `document_remove_node`, `document_add_operation`,
  `document_remove_operation`, `document_add_response`, `document_add_parameter`,
  `document_add_request_body`, `document_add_media_type`, `document_set_media_type_schema`,
  `document_add_security_scheme`, `document_remove_response`,
  `document_add_response_definition`, `document_remove_parameter`,
  `document_remove_security_scheme`, `document_add_tag`, `document_add_server`,
  `document_set_contact`, `document_set_license`, `document_remove_schema`,
  `document_remove_path`, `document_add_channel`, `document_add_response_header`
- **Validation tool** (1): `document_validate`
- **Transform tools** (2): `document_transform`, `document_dereference`

## Visitor and Traverser Patterns (IMPORTANT)

**Always use the Visitor and Traverser patterns from `@apicurio/data-models` as the primary
mechanism for querying, analyzing, transforming, and editing document models.** These patterns
replace direct `instanceof` checks, `(doc as any)` casts, and manual tree walking.

### Core API

```typescript
import {
    Library, CombinedVisitorAdapter, TraverserDirection,
    Node, Document,
} from "@apicurio/data-models";

// Traverse a subtree depth-first
Library.visitTree(node, visitor, TraverserDirection.down);

// Dispatch to a single node (no traversal)
node.accept(visitor);

// Resolve a NodePath string to a Node
Library.resolveNodePath(document, nodePath);

// In-place update: clear then re-populate
clearVisitor = new ClearNodeVisitor();
node.accept(clearVisitor);
Library.readNode(newJsonContent, node);
```

### Visitor Base Classes

- **`CombinedVisitorAdapter`** - No-op implementations for all 67+ visit methods. Extend and
  override only the methods you need.
- **`AllNodeVisitor`** - Funnels every `visitXxx()` call into a single abstract `visitNode()`.
  Use when you need uniform handling of all node types.

### Common Visitor Patterns

1. **Finder** - Query by criteria: override specific `visitXxx()` methods, set a `found` field.
2. **Collector** - Aggregate data across the tree: push to an array during traversal.
3. **In-place update** - Clear a node's properties with `ClearNodeVisitor`, then repopulate with
   `Library.readNode()`.
4. **Type-safe removal** - Use `RemoveNodeVisitor` which has a `visitXxx()` for every node type,
   each knowing exactly how to detach that node from its parent.
5. **Reverse traversal** - Use `TraverserDirection.up` to walk from a node toward the root.

### Anti-patterns to Avoid

- **`instanceof` branching** (e.g., `if (doc instanceof OpenApi30DocumentImpl)`) - Use visitor
  dispatch instead. The visitor infrastructure handles spec-version differences automatically.
- **`(doc as any)` casting** (e.g., `(doc as any).getPaths()`) - Visitor methods receive
  strongly-typed node arguments.
- **Serialize-Modify-Deserialize (SMD)** - Never do `Library.writeNode(doc)` then mutate the
  JSON then `Library.readDocument(json)`. This destroys internal parent/child references. Use
  `Library.readNode()` or the clear-then-populate pattern for in-place replacements.

### Adding New Visitors

Place new visitor classes in `src/visitors/` and export them from `src/visitors/index.ts`. Extend
`CombinedVisitorAdapter` and override only the visit methods relevant to your use case.

## Coding Standards

### TypeScript

- Target: ES2022, module: Node16
- Strict mode enabled
- 4-space indentation, double quotes, semicolons, trailing commas
- Linting and formatting via Biome (see `biome.json`)
- `noExplicitAny` is disabled - `any` casts are acceptable when interfacing with the
  data-models library's internal APIs

### Testing

- Test framework: Vitest
- Tests live in `test/` with `unit/` and `integration/` subdirectories
- Test fixtures (sample OpenAPI/AsyncAPI documents) are in `test/fixtures/`
- Run tests: `npm test`
- Run lint: `npm run lint`
- Run lint with auto-fix: `npm run lint:fix`

### Code Style

- Include JSDoc comments on all public functions and exported types
- Use `camelCase` for variables and functions, `PascalCase` for classes and types
- Prefer explicit types over `var`/inference when the type is not obvious
- Tool handler functions should return `{ content: [{ type: "text", text: ... }] }` using the
  MCP response format
- Use the error helpers from `src/util/errors.ts` (`errorResult`, `sessionNotFoundResult`) for
  consistent error responses

### Dependencies

- `@apicurio/data-models` (v2.3.1) - Core document model library
- `@modelcontextprotocol/sdk` - MCP server framework
- `js-yaml` - YAML parsing/serialization
- `zod` - Schema validation for tool parameters

## Reference Material

The `.work/` directory (git-ignored) contains reference repositories that can be consulted for
understanding the data-models library internals:

- `.work/apicurio-data-models` - The data-models library source code (Java)
- `.work/apicurio-openapi-editor` - An example consumer application showing visitor usage patterns
