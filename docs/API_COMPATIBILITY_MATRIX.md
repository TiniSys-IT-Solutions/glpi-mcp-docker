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
| Create ticket | OK | TODO | OK VIA LEGACY | Mapper + TicketService tests | Supports friendly fields and Legacy mapping. |
| Update ticket | OK | TODO | OK VIA LEGACY | Mapper + TicketService tests | Supports `location_id`, `entity_id`, `category_id`, requester, assignment, priority fields, and `time_to_resolve`. |
| Ticket location | OK | TODO | OK VIA LEGACY | Mapper + TicketService tests | Create and update map `location_id -> locations_id`. |
| List tickets | OK | TODO | OK VIA LEGACY | TicketService + inherited tests | Routed through `TicketService`. |
| Get ticket | OK | TODO | OK VIA LEGACY | TicketService + inherited tests | Routed through `TicketService`; output adds friendly aliases while keeping Legacy fields. |
| Search tickets | OK | TODO | OK VIA LEGACY | Search tests | Routed through `TicketService`; friendly filters are mapped through Legacy search options. |
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
| IP networks / LANs | OK | TODO | OK VIA LEGACY | IPNetwork service tests | Dedicated list/get/create/update tools use CIDR and friendly entity fields. GLPI computes hierarchy implicitly. |
| Printers | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Monitors | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Phones | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Software | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Projects | OK | TODO | OK VIA LEGACY | Smoke read-only planned | ProjectTask/teams still need study. |
| Contracts/suppliers | OK | TODO | OK VIA LEGACY | Inherited | Lower priority. |
| Knowledge base | OK | TODO | OK VIA LEGACY | Inherited | Search options tested upstream. |
| Generic search/count | OK | TODO | OK VIA LEGACY | Search tests | `glpi_search_v2`, `glpi_count`. |
| High-Level client | N/A | PARTIAL | N/A | High-Level URL + router tests | Base URL normalizes to `/api.php/v2.3`; no domain calls yet. |
| High-Level ticket service | N/A | TODO | N/A | Router tests | Contract exists; methods return clear not-supported errors pending Swagger. |
| Per-user auth | N/A | TODO | TODO | N/A | Requires OAuth/session confirmation. |

## Code Matrix

The executable Hybrid routing matrix lives in:

```text
src/routing/api-router.ts
```

Unknown tools in Hybrid are rejected. They are not routed to Legacy by default.
