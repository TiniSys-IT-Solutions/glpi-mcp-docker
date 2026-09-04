# Migration roadmap

This roadmap tracks the progressive migration from GLPI Legacy API routes to
the GLPI 11 High-Level API without disrupting the production endpoint.

## Invariants

- One Docker image and one container lifecycle.
- Stable endpoint remains on port 8000 and defaults to Legacy.
- Preview endpoint runs independently on port 8001 and uses High-Level.
- Hybrid routing is explicit per tool; there is no implicit fallback.
- A Preview failure must not interrupt Stable.
- A Stable failure is container-critical and lets Docker restart the service.
- Production changes require public tests, TypeScript build and a rollback path.

## Progress

| Stage | Status | Exit criteria |
| --- | --- | --- |
| Dual endpoint configuration | Implemented and unit-tested; container smoke pending | Existing configuration keeps one Legacy endpoint; Preview is opt-in |
| Process supervision | Implemented and unit-tested; container smoke pending | Stable is critical; Preview restarts independently |
| High-Level OAuth client | Implemented and unit-tested | Authorization Code, Password and Refresh requests are supported without secret leakage |
| High-Level session read | Implemented and unit-tested | `glpi_get_session_info` calls `/api.php/v2.3/session` with a Bearer token |
| High-Level read-only domains | Entity, Location, User and Group slices implemented and unit-tested | Migrate tickets, assets and network reads incrementally |
| High-Level writes | ImportEntity, Entity and Location slices implemented and unit-tested | Validate OAuth writes against a non-production GLPI before promoting additional domains |
| Per-user authentication | Planned | Bind an MCP session to one GLPI identity with auditable authorization context |
| Production release | Prepared (`v0.3.6`; `v0.3.5` published) | Versioned image workflow, compatibility matrix and release procedure are present; host-level container smoke remains required |

## Next validation slice

1. Build the image and start Stable alone to prove backward compatibility.
2. Enable Preview and verify both health endpoints and independent restart.
3. Validate Preview OAuth and `glpi_get_session_info` against a non-production GLPI account.
4. Keep `glpi_get_session_info` routed to Legacy on Stable until the High-Level
   result contract and permissions are confirmed.
5. Smoke-test Entity and Location reads against Preview without creating data.
6. Validate writes only against a dedicated non-production entity tree.
7. Select tickets or assets as the next read-only High-Level domain after
   confirming its response contract against a non-production instance.

Do not route a Stable Hybrid tool to High-Level merely because its Preview
implementation exists. Promotion is a separate, explicit compatibility decision.
