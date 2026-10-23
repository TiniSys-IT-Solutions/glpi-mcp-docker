# Empty Streamable HTTP initialization response

A `200` response with `mcp-session-id` but no JSON-RPC initialize result,
followed by `No valid session ID provided`, is consistent with a gateway
session whose stdio child exited before replying. HTTP success and the
gateway's `/healthz` alone do not establish that the MCP child is usable.
The exact production cause requires the deployed image and child stderr;
the symptoms alone do not prove which failure occurred.

The current 0.4.10 source already connects the stdio transport before the
background GLPI session warmup. It also keeps Supergateway's stdin open:
closing that pipe makes Supergateway 4.1.0 exit. An older deployed image can
still have either startup defect.

Another failure path exists before transport connection: `loadConfig()`
rejects `companion_api` unless all four settings are nonempty:

- `GLPI_OAUTH_CLIENT_ID`
- `GLPI_OAUTH_CLIENT_SECRET`
- `GLPI_OAUTH_USERNAME`
- `GLPI_OAUTH_PASSWORD`

Legacy/hybrid also require `GLPI_USER_TOKEN`, or both `GLPI_USERNAME` and
`GLPI_PASSWORD`. The effective stable mode is `MCP_STABLE_API_MODE`, falling
back to `GLPI_API_MODE`. A missing parameter used to be discovered only
when the gateway spawned its MCP child; the gateway could remain healthy
while each initialization failed.

The launcher now validates the application configuration for all enabled
endpoints before spawning any gateway. Invalid configuration exits with a
configuration error instead of opening an apparently healthy endpoint.
Validation makes no GLPI request and does not introduce a transport fallback.
Runtime failures, such as a missing module or crashed child, still require
inspection of container stderr; this validation is not an end-to-end health
probe.

`test-public/startup-handshake.test.ts` uses the official MCP SDK and a local
synthetic GLPI server that deliberately never answers authentication. It
verifies initialize, tools/list, server/info and both Addressing tool names
while GLPI warmup remains pending. A second test verifies launcher failure
before gateway startup with incomplete companion OAuth configuration.
These checks neither contact production GLPI nor write any GLPI data.
