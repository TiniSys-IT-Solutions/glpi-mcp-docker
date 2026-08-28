# GLPI MCP Docker

Docker-first Model Context Protocol server for GLPI, maintained by DooSys /
TiniSys IT Solutions.

This repository is a downstream fork and substantial evolution of
[`GMS64260/mcp-glpi`](https://github.com/GMS64260/mcp-glpi). The Legacy
adapter is based on upstream `v3.3.0` (commit
`0f8e802c39a6b37156ad2e315c0b9a8d0e26056e`), distributed under the MIT
license. See [NOTICE](NOTICE), [LICENSE](LICENSE), and
[docs/UPSTREAM.md](docs/UPSTREAM.md).

This is an independent integration and is not an official GLPI product.

## Status and versions

Current release line: `0.2.x`.

| Component | Status | Notes |
| --- | --- | --- |
| Legacy REST API `/apirest.php` | Active | Functional production backend. |
| High-Level API `/api.php/v2.3` | In preparation | Client and routing scaffold exist; unsupported domains fail explicitly. |
| Hybrid mode | Active | Uses an explicit compatibility matrix; never silently falls back after an error. |
| Service-account authentication | Active | App Token + User Token recommended. |
| Per-user OAuth authentication | Planned | Waiting for validated GLPI 11 OAuth behavior. |
| Docker image | Active | Published automatically from `main` to GHCR. |

The original Docker-wrapper generation is preserved on `v1-legacy`. The
current application is released from `main`. See
[docs/VERSIONING.md](docs/VERSIONING.md).

## Active capabilities

The server currently exposes 89 MCP tools for:

- tickets, timelines, followups, tasks, solutions, validations and documents;
- problems and changes;
- computers, software, network equipment, printers, monitors and phones;
- IP networks/LANs with IPv4 and IPv6 CIDR validation;
- users, groups, entities, locations and categories;
- projects, contracts, suppliers and knowledge-base articles;
- statistics, generic multi-criteria search, counts and session information.

The exhaustive tool/function table is maintained in
[docs/TOOLS.md](docs/TOOLS.md). API-mode coverage is documented in
[docs/API_COMPATIBILITY_MATRIX.md](docs/API_COMPATIBILITY_MATRIX.md).

## Production deployment

Published image:

```text
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:latest
```

Versioned releases also publish immutable and minor-line tags, for example:

```text
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:0.2.0
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:0.2
```

Create the production configuration:

```bash
cp .env.example .env
nano .env
docker compose up -d
```

Future updates require no source checkout or server-side build:

```bash
docker compose pull glpi-mcp
docker compose up -d --force-recreate --no-deps glpi-mcp
```

If the GHCR package is private, authenticate the Docker host once using a
GitHub token with `read:packages`:

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u GITHUB_USERNAME --password-stdin
```

## Configuration

The supplied [.env.example](.env.example) is the authoritative variable
template. Minimum recommended Legacy configuration:

```env
GLPI_URL=https://glpi.example.local
GLPI_API_MODE=legacy
GLPI_AUTH_MODE=service_account
GLPI_APP_TOKEN=CHANGE_ME
GLPI_USER_TOKEN=CHANGE_ME
```

Use a dedicated GLPI technical account with deliberately limited ACLs. Never
commit `.env`, tokens, passwords, OAuth secrets, private keys, or session
tokens.

Default endpoints:

```text
MCP:    http://127.0.0.1:8000/mcp
Health: http://127.0.0.1:8000/healthz
```

The included [docker-compose.yml](docker-compose.yml) is a minimal standalone
example. Reverse proxies such as Traefik can add their own external network,
router and middleware labels without changing the image or `.env` contract.

## Local development

```bash
git clone git@github.com:TiniSys-IT-Solutions/glpi-mcp-docker.git
cd glpi-mcp-docker
npm ci
npm test
npm run build
```

Local Docker build:

```bash
docker build -t glpi-mcp-docker:local .
```

The smoke test is read-only unless `--write` is explicitly supplied:

```bash
npm run smoke
```

Never run write smoke tests against production without explicit authorization.

## Architecture

```text
MCP client
  -> Streamable HTTP / Supergateway
  -> MCP stdio server
  -> API router
     -> Legacy adapter     /apirest.php
     -> High-Level adapter /api.php/v2.3 (in preparation)
```

Business-facing MCP fields use durable names such as `entity_id`,
`location_id`, `category_id`, and `cidr`. API-specific field names remain in
the adapters.

Further documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication](docs/AUTHENTICATION.md)
- [IP networks](docs/IP_NETWORKS.md)
- [Upstream provenance](docs/UPSTREAM.md)
- [Versioning](docs/VERSIONING.md)

## License

MIT. The upstream and downstream copyright notices are preserved in
[LICENSE](LICENSE). See [NOTICE](NOTICE) for provenance and attribution.
