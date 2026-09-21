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

Addressing synchronization follows
`MCP -> AddressingSyncService -> LegacyAddressingSyncService`; its deterministic
planner is independent of `GlpiClient`. Hybrid explicitly selects Legacy.
High-Level returns not-supported because no official plugin route is confirmed.

The Legacy adapter probes `listSearchOptions` for the GLPI 11 itemtype
`GlpiPlugin\\Addressing\\Addressing`, then the historical
`PluginAddressingAddressing`. It requires every known REST field before writing.
Namespaced itemtypes are URL-encoded as a single path segment (`%5C` for `\`),
otherwise standard URL parsing changes the PHP namespace into path separators.
Detection follows Addressing 3.2.11's actual `rawSearchOptions()` subset; the
complete persisted field set is checked on a REST row immediately before writes.
If there is no row yet, GLPI must report the source-audited plugin version 3.2.11.

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

MCP native-form tools
  |
FormService
  +-- LegacyFormService    -> namespaced `Glpi\\Form\\*` itemtypes
  `-- HighLevelFormService -> explicit not-supported pending Swagger

MCP location-integrity tools
  |
LocationIntegrityService
  +-- LegacyLocationIntegrityService -> raw FK verification, audit and guarded writes
  `-- HighLevelLocationIntegrityService -> explicit not-supported pending Swagger

MCP unmanaged reconciliation tools
  |
UnmanagedReconciliationService
  +-- LegacyUnmanagedReconciliationService -> explainable read-only matching audit
  `-- HighLevelUnmanagedReconciliationService -> explicit not-supported pending Swagger
```

Location-integrity writes resolve and compare raw identifiers with
`expand_dropdowns=false`; expanded values are presentation-only. Reassignment
never calls Location creation. Deletion scans known referencing domains and
fails closed if any reference scan is incomplete.

Unmanaged reconciliation never emulates a merge with delete-plus-create. Until
a confirmed GLPI 11 contract exists, its guarded apply entry point returns
`not_supported` without issuing an API write.

The native-form adapter reconstructs the editor order by merging questions and
rich-text comments within each section. It decodes JSON-backed options,
conditions, validation data, destinations and access policies. Its proofreading
view preserves original HTML, adds normalized plain text and records an exact
object path for each string. Secret-like policy fields, including direct-access
tokens, are recursively redacted.

Legacy printer orchestration resolves expanded foreign keys through the shared
`core/glpi-relations.ts` utility. It uses strict numeric values or typed GLPI
relation links, so localized dropdown labels never enter ID comparisons.
Equivalent matching CIDR rules are normalized to their destination pair and
selected deterministically; conflicting destinations remain blocked.

The same relation resolver verifies `RuleCriteria -> RuleImportEntity` parent
links. Criterion creation performs a direct read and a parent-collection read;
the collection is the safe fallback when expanded dropdowns or permissions
prevent the direct verification. An inconclusive POST outcome is never retried
automatically and is reported as `write_outcome_uncertain`.

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
