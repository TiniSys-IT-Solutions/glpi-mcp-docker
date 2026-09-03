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

## Verified GLPI 11 High-Level flow

The GLPI 11 implementation exposes:

```text
GET/POST /api.php/authorize
POST     /api.php/token
GET      /api.php/v2.3/session
GET      /api.php/v2.3/User/Me
```

Its OAuth server enables Authorization Code, Password, Refresh Token, and a
restricted Client Credentials grant. Client Credentials cannot represent a
normal GLPI user for general API access. The Preview endpoint therefore uses
Authorization Code with `api user` scopes as the target per-user flow.

`src/api/highlevel/oauth.ts` contains the protocol client only. It deliberately
does not persist refresh tokens. Encrypted token storage, callback state/PKCE
validation, and per-user session binding must be implemented before enabling
`GLPI_AUTH_MODE=per_user` in production.

## High-Level Placeholders

`.env.example` includes:

```env
GLPI_OAUTH_CLIENT_ID=
GLPI_OAUTH_CLIENT_SECRET=
GLPI_OAUTH_USERNAME=
GLPI_OAUTH_PASSWORD=
GLPI_OAUTH_REDIRECT_URI=
```

These variables are placeholders until the real High-Level authentication flow
is confirmed.

## Startup Validation

Legacy and Hybrid service-account modes require a Legacy auth method.

High-Level mode does not require Legacy credentials at configuration parsing
time. Session, entity-assignment rules, entities and locations are implemented;
other domains return explicit not-supported errors until their GLPI 11 contract
has been validated.
