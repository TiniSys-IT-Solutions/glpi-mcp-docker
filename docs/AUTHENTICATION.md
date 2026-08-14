# Authentication

## Current Mode

The initial functional mode is:

```env
GLPI_AUTH_MODE=service_account
```

For Legacy API:

```env
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
```

`GLPI_USERNAME + GLPI_PASSWORD` remain supported by the imported Legacy client,
but token-based service-account auth is preferred.

## Per-User Mode

The planned mode is:

```env
GLPI_AUTH_MODE=per_user
```

It is not implemented yet.

Before implementing it:

1. Inspect the target GLPI 11 Swagger/OpenAPI.
2. Confirm the OAuth/session flow actually supported by the instance.
3. Prefer Authorization Code flow if appropriate.
4. Document refresh-token storage requirements before adding state.

Do not store GLPI user passwords in this project. Do not create a parallel IAM
database. GLPI remains the source of identity, ACLs, profiles, groups, and
entity visibility.

## High-Level Placeholders

`.env.example` includes:

```env
GLPI_OAUTH_CLIENT_ID=
GLPI_OAUTH_CLIENT_SECRET=
GLPI_OAUTH_REDIRECT_URI=
```

These variables are placeholders until the real High-Level authentication flow
is confirmed.

## Startup Validation

Legacy and Hybrid service-account modes require a Legacy auth method.

High-Level mode does not require Legacy credentials, but currently returns
not-supported errors because no High-Level domain has been implemented from
Swagger yet.
