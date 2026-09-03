# Security Policy

## Supported versions

Security fixes are applied to the latest published release and the current
`main` branch.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities or exposed secrets.
Use GitHub's private vulnerability reporting feature on this repository.
Include affected versions, reproduction steps, impact, and any suggested
mitigation. Maintainers will acknowledge a complete report as soon as
practical and coordinate disclosure after a fix is available.

## Deployment boundary

This server can perform privileged GLPI operations using a service account.
Deploy it only behind an authenticated reverse proxy or on a trusted private
network. Use a least-privilege GLPI account, keep `GLPI_DEBUG` disabled in
production, and never publish the MCP port directly to an untrusted network.

Document uploads are restricted to `MCP_UPLOAD_ROOT` and capped by
`MCP_UPLOAD_MAX_BYTES`. Mount only a dedicated upload directory into the
container; never mount host system directories or the Docker socket.
