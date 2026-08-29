# Stable and Preview MCP endpoints

The Docker image can run two independent MCP processes in one container.

| Profile | Default port | API mode | Criticality |
| --- | ---: | --- | --- |
| Stable | 8000 | Legacy by default; Hybrid when explicitly enabled | Critical |
| Preview | 8001 | High-Level | Optional, independently restarted |

Preview is disabled by default. Existing deployments therefore retain the
single-port Legacy behavior until they opt in.

## Enable the Preview endpoint

```env
GLPI_API_MODE=hybrid
MCP_STABLE_API_MODE=hybrid
MCP_STABLE_PORT=8000

MCP_PREVIEW_ENABLED=true
MCP_PREVIEW_API_MODE=highlevel
MCP_PREVIEW_PORT=8001
```

The Stable Hybrid compatibility matrix remains explicit. Enabling Preview
does not change any Stable route and never enables High-Level-to-Legacy
fallback.

Recommended reverse-proxy routing:

```text
mcp.example.test         -> container:8000
mcp-preview.example.test -> container:8001
```

Restrict the Preview hostname by source IP or strong authentication. Do not
publish it directly to an untrusted network.

## Failure policy

- Stable exit: the launcher terminates so Docker can restart the container.
- Preview exit: the launcher keeps Stable running and restarts Preview.
- Docker health: checks Stable only.
- Container update or stop: both processes stop because they deliberately
  share one image and lifecycle.
