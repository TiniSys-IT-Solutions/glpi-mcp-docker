# Changelog

## 0.4.10 — 2026-10-06

- Connect the MCP stdio transport before warming the upstream GLPI session, so Streamable HTTP `initialize` can complete immediately even when GLPI is slow or unavailable.
- Upgrade Supergateway from 3.4.3 to 4.1.0 for corrected session recovery, notification delivery, subprocess isolation and connection hardening.
- Keep the gateway process input open for its full lifetime, as required by Supergateway 4.1.0.

## 0.4.8 — 2026-10-06

- Add explicit `GLPI_ADDRESSING_REPORT_TRANSPORT=companion_api` for the GenBio Custom GLPI plugin, using OAuth v2 for Addressing reports and comment compare-and-set writes.
- Preserve the Addressing MCP tool names and keep all other Addressing operations on the Legacy adapter without error fallback.

## 0.4.7 — 2026-10-06

- Add explicit `GLPI_ADDRESSING_REPORT_TRANSPORT=native_web` for GLPI 11 Addressing reports and per-IP comments, reusing service-account credentials with in-memory cookies and native CSRF.
- Match the REST profile, select the authorized range entity, parse the native report tab and reject incomplete or incompatible rows; never probe IPs or fall back after denied access.
- Retain expected-comment checks, serialize writes to one IP within this MCP service, verify saved text and report unknown write outcomes without replaying POSTs. Native GLPI supplies no atomic compare-and-set.
- Add synthetic HTTP regressions for both authentication methods, report pagination, permissions, CSRF, stale callers, Unicode, MFA, unsafe routes and failed writes/readback. Docker remains the official runtime; no GLPI-side changes are required.
- Update the locked proxy-addr dependency to 2.0.8 to resolve the audit finding.

## 0.4.6 — 2026-10-05

- Replace the exact report/comment version pin with stable Addressing >=3.2.0 plus compatible native REST schemas and permissions.
- Explain the deliberate IpComment/PingInfo class denial in active Addressing 3.2.14, even with Super-Admin; never assume that an unreadable comment is empty.
- Require active-profile Addressing UPDATE for IP comments, retain expected-text checks and verify written text/parent/IP afterward.
- Expose stored ping state/date and selection reasons for replies without visible equipment and Unmanaged equipment, without launching probes.
- Add unit and authenticated HTTP regressions. Docker/MCP architecture and the 288-tool catalogue are retained; no GLPI-side plugin is added. Stock Addressing 3.2.14 report/comment success remains blocked by its native API permissions.

## 0.4.5 — 2026-10-05

- Add 14 business tools for phone lines: filtered search, overview, typed creation/update, comment append, equipment links, installed SIM line changes, audits and statistics.
- Distinguish direct links from SIM associations; fingerprint removals and SIM reassignment, respect recursive entity scope and exclude SIM authentication secrets.
- Extend dropdown catalogues to line types/operators and existing relation/metadata tools to line contracts, documents, financial information and notes.
- Implement confirmed High-Level line operations with explicit errors for unsupported relations/fields; Hybrid uses Legacy routing. The catalogue now contains 288 tools.

## 0.4.4 — 2026-10-05

- Add paginated IP Addressing reports with per-IP comments and visible inventory assignments.
- Add native report comment creation, replacement and clearing with a current-text precondition.
- Add previewed IP reservations on existing equipment, with explicit entity checks, visible conflict detection and verification of native network children.
- Report partial writes with object ids and block duplicate reservation ports.
- Document Addressing capabilities, REST/version requirements and inventory visibility limits. The MCP catalogue now contains 274 tools.

## 0.4.3

- Expand the business catalogue to 270 tools for assets, inventory, governance, network relationships and site network provisioning.
