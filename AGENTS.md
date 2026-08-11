# Codex Working Rules

This repository contains the Docker-first wrapper for `GMS64260/mcp-glpi` and a dedicated `v2` planning branch for a future GLPI High-Level API migration.

## Branch Safety

- Do not break or modify `main` during V2 work.
- `main` is the stable branch for the current GLPI Legacy REST API deployment.
- Use the `v2` branch for all GLPI High-Level API v2.3 planning and future migration work.
- Do not backport V2 planning changes to `main` unless the maintainer explicitly asks for it.

## Scope Of The V2 Branch

- This branch is currently a development and planning branch.
- Do not present it as production-ready or functionally migrated to GLPI API v2.3.
- Do not add OAuth, GraphQL, `/api.php/v2.3` calls, or application migration code until the maintainer gives an explicit GO.
- Keep the current Docker wrapper behavior intact until a deliberate migration step is approved.

## Source Of Truth

- GLPI High-Level API v2.3 Swagger/OpenAPI documentation is the primary source of truth for future V2 work.
- Inspect the target GLPI instance documentation, typically `/api.php/v2.3/doc`, before designing endpoints, payloads, schemas, filters, relations, authentication, or response handling.
- Do not mechanically translate Legacy REST paths from `/apirest.php` to `/api.php/v2.3`.
- Do not assume V2 behavior from Legacy behavior without verifying it in Swagger.

## API Modes

Future work must preserve these three concepts:

- `legacy`: MCP tools call the existing Legacy REST API through `/apirest.php`.
- `v2`: MCP tools call only GLPI High-Level API v2.3 and return clear not-implemented errors for unsupported tools.
- `hybrid`: migrated tools use V2, while explicitly mapped non-migrated tools use Legacy fallback.

Hybrid fallback must be explicit and controlled by a compatibility matrix. Never implement a broad "try V2, then silently fall back to Legacy on any error" behavior.

## MCP Compatibility

- Preserve existing MCP tool names whenever possible.
- Cursor, Codex, and Claude should not need different tool names depending on the selected GLPI API mode.
- Keep Zod validation, tool descriptions, structured errors, and MCP annotations such as `readOnlyHint`, `destructiveHint`, and `idempotentHint`.
- Destructive operations must stay clearly identified and should require explicit user intent.

## Security

- Never commit `.env` files, tokens, passwords, OAuth secrets, private keys, dumps, local logs, or generated files containing secrets.
- Use a dedicated GLPI technical account with minimal permissions.
- Do not rely on MCP annotations or API V2 as a security boundary; GLPI ACLs remain the authoritative control.
- Do not log secrets.
- Do not run destructive operations against a real GLPI instance unless the maintainer explicitly requests them.

## Tests

- Tests are required for future implementation work.
- Cover API mode routing, auth, HTTP behavior, payload mapping, pagination, retry, and error handling.
- Add parity tests comparing Legacy and V2 behavior before marking a tool as migrated.
- Keep read-only smoke tests separate from write/destructive tests.
- Never run destructive smoke tests automatically against a real GLPI instance.

## Docker First

- Keep the project Docker-first.
- Node.js, npm, Git, and application dependencies must not be required on the final runtime host.
- Local development may use tooling as needed, but deployment should remain containerized.

## Attribution

- Preserve license and attribution for `GMS64260/mcp-glpi`, which is MIT licensed.
- Clearly distinguish DooSys original work from adapted upstream code during future implementation.
