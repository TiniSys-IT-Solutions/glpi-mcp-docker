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
| Users | OK | PARTIAL | OK VIA LEGACY | Legacy + High-Level directory service tests | High-Level list/get/username lookup use official `/Administration/User` routes; create remains Legacy-only. |
| Groups | OK | PARTIAL | OK VIA LEGACY | Legacy + High-Level directory service tests | High-Level list/get use official `/Administration/Group` routes; writes remain Legacy-only. |
| Entities | OK | OK (API >= 2.3) | OK VIA LEGACY | Organization mapper/service tests | List/get/create/update use a shared contract for LDAP DN, LDAP filter, LDAP directory and inventory TAG. Updates are partial with read-before-write and post-write verification. High-Level uses `/Administration/Entity`; advanced fields were introduced in API 2.3. |
| Locations | OK | PARTIAL | OK VIA LEGACY | Organization mapper/service/schema/router tests | List/get/create support code, alias, parent, entity scope, recursion, address and GPS coordinates. Partial update is Legacy-only with read-before-write and verification; High-Level update fails clearly until its Swagger PATCH contract is confirmed. |
| Computers | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Asset age business logic still TODO. |
| Network equipment | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| IP networks / LANs | OK | TODO | OK VIA LEGACY | IPNetwork service tests | Dedicated list/get/create/update tools use CIDR and friendly entity fields. GLPI computes hierarchy implicitly. |
| Entity-assignment rules | OK | OK | OK VIA LEGACY | Legacy + High-Level create/update/criterion/idempotence/verify/rollback/read tests | Both APIs create disabled IPv4 CIDR rules, partially update metadata, idempotently add any of the nine native criteria, and explicitly enable rules after verification. High-Level reuses the official RuleController Criteria route introduced in API 2.0. Hybrid remains explicitly routed to Legacy. |
| GLPI Inventory plugin | OK | TODO | OK VIA LEGACY | Plugin service tests | Ranges, protected credential metadata, ranked IP-range/native-SNMP-credential relations, tasks/jobs/states, time slots, collections and deployment metadata. Association attach rejects duplicate pairs; detach deletes only the relation and requires confirmation. Verified tasks can be safely requeued for the official scheduler; direct web-only force execution remains excluded. |
| Printers | OK | BLOCKED | OK VIA LEGACY | Printer service/schema/mapping/CIDR/idempotence tests | Legacy supports verified partial updates, idempotent comment append and confirmed CIDR-rule reassignment with dry-run. High-Level writes remain blocked until the GLPI 11 Swagger confirms the Printer PATCH contract. |
| Monitors | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Phones | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Software | OK | TODO | OK VIA LEGACY | Smoke read-only planned | Inherited from upstream. |
| Projects | OK | TODO | OK VIA LEGACY | Smoke read-only planned | ProjectTask/teams still need study. |
| Contracts/suppliers | OK | TODO | OK VIA LEGACY | Inherited | Lower priority. |
| Knowledge base | OK | TODO | OK VIA LEGACY | Inherited | Search options tested upstream. |
| Generic search/count | OK | TODO | OK VIA LEGACY | Search tests | `glpi_search_v2`, `glpi_count`. |
| Session information | OK | PARTIAL | OK VIA LEGACY | Legacy adapter + High-Level OAuth/session tests | Preview calls `/api.php/v2.3/session`; Stable Hybrid remains explicitly routed to Legacy. |
| High-Level client | N/A | PARTIAL | N/A | High-Level URL, OAuth, session + router tests | Base URL normalizes to `/api.php/v2.3`; authenticated session read is the first migrated call. |
| High-Level ticket service | N/A | TODO | N/A | Router tests | Contract exists; methods return clear not-supported errors pending Swagger. |
| Per-user auth | N/A | TODO | TODO | N/A | Requires OAuth/session confirmation. |

## Code Matrix

The executable Hybrid routing matrix lives in:

```text
src/routing/api-router.ts
```

Unknown tools in Hybrid are rejected. They are not routed to Legacy by default.
