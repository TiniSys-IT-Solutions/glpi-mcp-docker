# Architecture

## Decision

The `v2` branch was reconstructed into a clean TypeScript application instead
of extending the old Docker wrapper.

Reason: the previous branch had no local application source. Its Dockerfile
cloned `GMS64260/mcp-glpi` during build, which made API routing, adapter
separation, tests, and ticket-field mapping hard to own in this repository.

Useful parts kept:

- Docker-first distribution;
- Supergateway stdio to Streamable HTTP bridge;
- non-root runtime;
- healthcheck;
- upstream MIT attribution;
- hardened Legacy behavior from `GMS64260/mcp-glpi` v3.3.0.

## Runtime Flow

```text
AI client
  |
  | MCP Streamable HTTP
  v
Supergateway
  |
  | MCP stdio
  v
src/index.ts
  |
  v
src/routing/api-router.ts
  |
  +-- legacy    -> src/api/legacy -> /apirest.php
  +-- highlevel -> src/api/highlevel -> /api.php/v{GLPI_API_VERSION}
  +-- hybrid    -> explicit compatibility matrix
```

## Source Layout

```text
src/
|-- api/
|   |-- legacy/
|   |   |-- glpi-client.ts
|   |   |-- http.ts
|   |   |-- mapper.ts
|   |   |-- printers.ts
|   |   |-- rules.ts
|   |   |-- search.ts
|   |   `-- search-options.ts
|   `-- highlevel/
|       |-- client.ts
|       |-- rules.ts
|       |-- printers.ts
|       `-- tickets.ts
|-- auth/
|-- config/
|   `-- env.ts
|-- core/
|   |-- rules/
|   |-- assets/
|   `-- tickets/
|-- routing/
|   `-- api-router.ts
|-- tools/
`-- index.ts
```

`src/index.ts` still contains most upstream MCP tool registration and dispatch.
The first vertical slice is now decoupled for tickets:

```text
MCP ticket tools
  |
  v
TicketService
  |
  +-- LegacyTicketService
  `-- HighLevelTicketService
```

The refactored ticket tools are:

- `glpi_list_tickets`
- `glpi_get_ticket`
- `glpi_search_tickets`
- `glpi_create_ticket`
- `glpi_update_ticket`

The entity-assignment rule vertical slice also uses a shared service contract:

```text
MCP RuleImportEntity tools
  |
  v
ImportEntityRuleService
  |
  +-- LegacyImportEntityRuleService
  `-- HighLevelImportEntityRuleService

MCP entity/location tools
  |
OrganizationService
  +-- LegacyOrganizationService    -> Entity / Location via `/apirest.php`
  `-- HighLevelOrganizationService -> `/Administration/Entity` and `/Dropdown/Location`

MCP printer tools
  |
PrinterService
  +-- LegacyPrinterService    -> Printer and validated related objects
  `-- HighLevelPrinterService -> explicit not-supported pending Swagger
```

It exposes rule, criterion and action inspection plus idempotent criterion
addition. Criterion writes validate the `RuleImportEntity` subtype, reject
unknown native criterion keys, prevent exact duplicates and verify the child
after creation. Stable Hybrid is explicitly routed to Legacy, while Preview
uses the same official High-Level Criteria route already used by complete rule
creation.

Other domains still use the Legacy client directly while parity is validated.

## Adapter Rules

- MCP tools must not contain raw GLPI HTTP details.
- Legacy and High-Level mappings stay inside their adapters.
- Runtime code must not vendor or import the retired upstream snapshot.
- High-Level implementation must be based on the target Swagger/OpenAPI, not on
  Legacy endpoint guessing.
- High-Level API versions are normalized so `2.3` and `v2.3` both build
  `/api.php/v2.3`.

## Supergateway Decision

Supergateway is kept for this first V2 implementation because the upstream
server is still stdio-based and the existing deployment model already works.
This avoids spending the first migration step on transport churn.

Re-evaluate native Streamable HTTP after the tool/core split is cleaner.

## Dual endpoint launcher

The container launcher can supervise two isolated Supergateway/stdio process
pairs from the same image:

```text
launcher
  +-- stable  :8000 -> Hybrid/Legacy process (critical)
  `-- preview :8001 -> High-Level process (optional)
```

Each child receives its own `GLPI_API_MODE`. Stable retains the existing
single-port behavior by default, while Preview must be explicitly enabled.
See `docs/DUAL_ENDPOINTS.md`.
