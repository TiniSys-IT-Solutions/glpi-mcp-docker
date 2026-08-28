# Codex Working Rules

This repository is the active V2 implementation of
`TiniSys-IT-Solutions/glpi-mcp-docker`.

## Branch Safety

- `main` is the active V2 release branch.
- The former V1 Docker wrapper is archived on `v1-legacy`.
- Inspect `git status` before edits and before commits.
- Do not discard local changes unless the maintainer explicitly asks for it.

## Product Direction

This repository is the complete product:

- MCP server;
- business-oriented tools;
- Legacy adapter;
- High-Level adapter;
- API routing;
- authentication architecture;
- tests;
- Docker distribution;
- documentation.

Docker is the official runtime. A final host should not need Node.js, npm, or
Git to run the service.

## API Modes

Supported configuration values:

- `GLPI_API_MODE=legacy`
- `GLPI_API_MODE=highlevel`
- `GLPI_API_MODE=hybrid`

Legacy calls `/apirest.php`.

High-Level will call `/api.php/v{GLPI_API_VERSION}` once implemented. Until
the target GLPI 11 Swagger/OpenAPI confirms a domain, return a clear
not-supported error instead of guessing.

`GLPI_API_VERSION` accepts `2.3` or `v2.3`; code must normalize both to
`/api.php/v2.3`.

Hybrid must use the explicit compatibility matrix in code and docs. Never
implement this pattern:

```text
try High-Level
if error:
  retry Legacy
```

## MCP Contract

Tools should be business-oriented and useful to an AI agent. Do not mirror
every GLPI endpoint by default.

MCP-facing names should be durable and friendly:

- `entity_id`
- `location_id`
- `category_id`
- `requester_user_id`
- `assigned_user_id`

Adapters map those fields to API-specific payloads. For Legacy tickets,
`location_id` maps to `locations_id`.

The ticket vertical slice now uses a common `TicketService` contract:

```text
MCP ticket tools -> TicketService -> LegacyTicketService / HighLevelTicketService
```

Continue this pattern domain by domain. Do not force High-Level adapters to
pretend they are `GlpiClient`.

## Authentication

`GLPI_AUTH_MODE=service_account` is the initial functional mode.

`GLPI_AUTH_MODE=per_user` is planned, but must be implemented only after the
real GLPI 11 OAuth/session behavior is confirmed. GLPI remains the source of
identity and permissions. Do not add a local IAM database or store GLPI user
passwords.

## Upstream Source

The retired migration snapshot is available in Git history. Runtime code must
not vendor or import the upstream project.

Preserve the MIT license and attribution for `GMS64260/mcp-glpi`.

## Security

- Never commit `.env`, tokens, passwords, OAuth secrets, private keys, cookies,
  Authorization headers, or GLPI dumps containing secrets.
- Do not log secrets.
- Keep Zod validation and MCP annotations.
- Mark destructive operations with `destructiveHint`.
- Do not run write smoke tests against a real GLPI instance unless explicitly
  requested.

## Tests

Run relevant tests before commits:

```bash
npm test
npm run build
git diff --check
```

Read-only smoke tests are allowed when credentials target a suitable instance.
Write smoke tests require explicit opt-in:

```bash
npm run smoke -- --write
```
