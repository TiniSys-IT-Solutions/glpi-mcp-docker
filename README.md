# glpi-mcp-docker

Docker-first MCP server for GLPI.

This repository now contains the application code, Docker build, tests, and
documentation for the DooSys GLPI MCP server. The stable V1 remains on
`main`. Active V2 development happens only on `v2`.

## Status

V2 has started.

- `GLPI_API_MODE=legacy` is the first functional mode.
- `GLPI_API_MODE=highlevel` is scaffolded and intentionally returns clear
  not-supported errors until the target GLPI 11 Swagger/OpenAPI is inspected.
- `GLPI_API_MODE=hybrid` uses an explicit compatibility matrix. It never tries
  High-Level and then silently falls back to Legacy after an error.

The immediate ticket-location need is implemented on the MCP contract as:

```json
{
  "entity_id": 12,
  "location_id": 42,
  "category_id": 7
}
```

The Legacy adapter maps those fields to GLPI Legacy names such as
`entities_id`, `locations_id`, and `itilcategories_id`.

Ticket create/update now supports these MCP-facing fields in Legacy mode:

```text
name
content
type
status
urgency
impact
priority
category_id
entity_id
location_id
requester_user_id
requester_group_id
assigned_user_id
assigned_group_id
time_to_resolve
```

`user_id_assign` and `group_id_assign` are still accepted as temporary
compatibility aliases. New clients should prefer `assigned_user_id` and
`assigned_group_id`.

## Quick Start

```bash
git clone git@github.com:DooSys/glpi-mcp-docker.git
cd glpi-mcp-docker
git checkout v2

cp .env.example .env
nano .env

docker compose up -d --build
```

The MCP HTTP endpoint defaults to:

```text
http://127.0.0.1:8000/mcp
```

The healthcheck endpoint defaults to:

```text
http://127.0.0.1:8000/healthz
```

## Configuration

Core settings:

```env
GLPI_URL=https://glpi.example.local

# legacy | highlevel | hybrid
GLPI_API_MODE=legacy

# High-Level API version for /api.php/v{version}
GLPI_API_VERSION=2.3

# service_account | per_user
GLPI_AUTH_MODE=service_account
```

Legacy service-account mode:

```env
GLPI_APP_TOKEN=CHANGE_ME
GLPI_USER_TOKEN=CHANGE_ME
```

High-Level OAuth variables are present as placeholders in `.env.example`, but
the exact flow must be confirmed from the target GLPI 11 Swagger/OpenAPI before
being implemented.

## Development

```bash
npm ci
npm test
npm run build
```

The smoke script is read-only by default:

```bash
npm run smoke
```

Write smoke tests must be explicitly requested:

```bash
npm run smoke -- --write
```

Never run write smoke tests against a production GLPI instance.

The optional write smoke cycle can use `SMOKE_TICKET_*` variables to exercise
ticket create/get/update with `entity_id`, `location_id`, `category_id`,
requester, assignment, priority fields, and `time_to_resolve`.

## Docker

The image builds from this repository source. It no longer clones
`GMS64260/mcp-glpi` during the Docker build.

The runtime remains:

- Node Alpine base image;
- non-root `node` user;
- Supergateway for stdio to Streamable HTTP;
- healthcheck;
- OCI labels for source and upstream reference.

## Upstream Reference

The upstream MIT project `GMS64260/mcp-glpi` is vendored only as a migration
snapshot under:

```text
upstream/legacy-mcp-glpi/
```

Runtime code must not import from that directory. Adapted code belongs under
`src/`.

See:

- `docs/ARCHITECTURE.md`
- `docs/API_COMPATIBILITY_MATRIX.md`
- `docs/AUTHENTICATION.md`
- `docs/UPSTREAM.md`
