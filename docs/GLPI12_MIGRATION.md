# GLPI 12 MCP migration

`glpi-v12` prepares MCP 0.5.0. The server remains a Docker product; PHP is required only by the disposable integration fixture.

GLPI 12.0.1 advertises Legacy v1, High-Level v2.3 and High-Level v3.0. Existing adapters keep their explicit Legacy/v2.3 contracts; `GLPI_API_VERSION=2.3` remains the default. Native v3 schemas are not implemented and major versions >=3 are rejected before a request is made. There is no automatic fallback between API modes.

## Validation

- Full public regression suite and TypeScript build.
- Native HTTP checks against disposable GLPI 12.0.1 / MariaDB 11.4: Legacy authentication, ticket search options, asset reads; OAuth password grant, v2.3 session and asset reads.
- No real GLPI instance or external service is used, and no business-object writes are performed by the smoke runner.

Create a fresh GLPI 12.0.1 installation with only synthetic data and mark its root with `.tinisys-disposable-test`. Then initialize synthetic API credentials (this resets the fresh-install administrator password):

```bash
GLPI_TEST_ROOT=/absolute/disposable/glpi GLPI12_TEST_FIXTURE=/private/path/fixture.json php scripts/setup-glpi12-test.php
GLPI12_DISPOSABLE=1 GLPI12_TEST_URL=http://127.0.0.1:8080 GLPI12_TEST_FIXTURE=/private/path/fixture.json node --import tsx scripts/smoke-glpi12.ts
```

The fixture file must not already exist. It contains randomly generated credentials and is created with mode 0600. Do not commit it. The smoke runner accepts only loopback instances and never loads a repository `.env` file.

## Remaining review

High-Level API v3 adapters are out of scope. The native smoke checks do not certify every business operation or the optional Addressing/GenBio integrations. Validate those workflows in the target test deployment before production use.

## References

- [GLPI 12 API versions](https://github.com/glpi-project/glpi/blob/12.0.1/src/Glpi/Api/HL/Router.php)
- [Official GLPI Docker image](https://github.com/glpi-project/docker-images)
- [Tag migration](https://github.com/pluginsGLPI/tag/commit/d7f547592c5e6627dc0c42fb573c5e2f448c3ff5)
- [Fields migration](https://github.com/pluginsGLPI/fields/commit/8a679ffd01067b38c6ce98367fa047e778da6493)
- [Addressing migration](https://github.com/pluginsGLPI/addressing/commit/ba3a3ba1e65cfb3ee7f577e5b9f89e1798b0d563)
- [GLPI 12.0.1 source](https://github.com/glpi-project/glpi/tree/12.0.1)
