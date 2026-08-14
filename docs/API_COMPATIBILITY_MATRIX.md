# API Compatibility Matrix

Status values:

- `OK`: implemented and covered by tests or inherited tested behavior.
- `TODO`: not implemented yet.
- `PARTIAL`: implemented with known limitations.
- `BLOCKED`: blocked by missing Swagger/instance details or external limits.
- `N/A`: not applicable.
- `OK VIA LEGACY`: available in Hybrid through explicit Legacy routing.

## Current Matrix

| MCP capability | Legacy | High-Level | Hybrid | Tests | Notes |
| --- | --- | --- | --- | --- | --- |
| Create ticket | OK | TODO | OK VIA LEGACY | Unit mapper | Supports friendly fields and Legacy mapping. |
| Update ticket | OK | TODO | OK VIA LEGACY | Unit mapper | Supports `location_id`, `entity_id`, `category_id`. |
| Ticket location | OK | TODO | OK VIA LEGACY | Unit mapper | `location_id -> locations_id`. |
| List tickets | OK | TODO | OK VIA LEGACY | Upstream unit coverage | Uses Legacy list/search behavior. |
| Get ticket | OK | TODO | OK VIA LEGACY | Upstream unit coverage | Detail reads default to expanded dropdowns where supported. |
| Search tickets | OK | TODO | OK VIA LEGACY | Search tests | Friendly filters are mapped through Legacy search options. |
| Ticket timeline | OK | TODO | OK VIA LEGACY | Inherited | Followups, tasks, solutions, validations. |
| Followups/tasks/solutions | OK | TODO | OK VIA LEGACY | Inherited | Write operations remain explicit. |
| Validations | OK | TODO | OK VIA LEGACY | Inherited | High-Level pending Swagger. |
| Documents/upload | OK | TODO | OK VIA LEGACY | Upload tests | Snapshot v3.3.0 includes upload support. |
| Users | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Search/list/get/create inherited from upstream. |
| Groups | OK | TODO | OK VIA LEGACY | Smoke read-only planned | User-group linking inherited. |
| Entities | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Legacy list inherited. |
| Locations | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Legacy list/get/create inherited. |
| Computers | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Asset age business logic still TODO. |
| Network equipment | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Printers | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Monitors | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Phones | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Software | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Projects | OK | TODO | OK VIA LEGACY | Smoke read-only planned | ProjectTask/teams still need study. |
| Contracts/suppliers | OK | TODO | OK VIA LEGACY | Inherited | Lower priority. |
| Knowledge base | OK | TODO | OK VIA LEGACY | Inherited | Search options tested upstream. |
| Generic search/count | OK | TODO | OK VIA LEGACY | Search tests | `glpi_search_v2`, `glpi_count`. |
| High-Level client | N/A | PARTIAL | N/A | Router tests | Base URL scaffold only; no domain calls yet. |
| Per-user auth | N/A | TODO | TODO | N/A | Requires OAuth/session confirmation. |

## Code Matrix

The executable Hybrid routing matrix lives in:

```text
src/routing/api-router.ts
```

Unknown tools in Hybrid are rejected. They are not routed to Legacy by default.
