# V2 Migration Plan

Status: implementation started.

The previous pre-GO planning document has been replaced. The GO for V2
implementation was given on 2026-08-14.

## Active Direction

V2 is now a local TypeScript MCP application inside this repository, not only a
Docker wrapper around an upstream clone.

Current implementation order:

1. Keep Legacy functional.
2. Own the source and Docker build in this repository.
3. Add central config and API routing.
4. Support friendly ticket write fields, including `location_id`.
5. Route ticket list/get/search/create/update through `TicketService`.
6. Keep High-Level API scaffolded but blocked until target Swagger/OpenAPI is
   inspected.
7. Move tool domains gradually out of the large upstream-style `src/index.ts`.
8. Implement High-Level read paths first.
9. Implement High-Level write paths after tests and Swagger validation.
10. Add per-user auth only after confirming GLPI 11 OAuth/session behavior.

## Reference Documents

- `docs/ARCHITECTURE.md`
- `docs/API_COMPATIBILITY_MATRIX.md`
- `docs/AUTHENTICATION.md`
- `docs/UPSTREAM.md`
- `AGENTS.md`

## Hard Rules

- Do not modify `main`.
- Do not import runtime code from `upstream/legacy-mcp-glpi`.
- Do not guess High-Level endpoints from Legacy paths.
- Do not implement implicit High-Level-to-Legacy fallback.
- Do not commit secrets.
- Do not run write smoke tests without explicit opt-in.
