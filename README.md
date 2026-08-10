# glpi-mcp-docker

## Présentation

Ce dépôt fournit une couche Docker propre autour du serveur MCP upstream [`GMS64260/mcp-glpi`](https://github.com/GMS64260/mcp-glpi), sans modifier son code source.

L'objectif est de construire une image immuable à partir d'un tag upstream explicite, puis d'exposer le serveur MCP GLPI sur le réseau local via le transport MCP Streamable HTTP.

La version upstream embarquée par défaut est :

```text
MCP_GLPI_VERSION=v3.3.0
```

Le tag `v3.3.0` existe côté Git upstream. Le paquet NPM `mcp-glpi` peut être en retard par rapport aux tags Git ; l'image construit donc depuis GitHub, sur le tag demandé, et pas depuis `main` ni depuis `npx mcp-glpi@latest`.

## Architecture

```text
                        GLPI
                         ^
                         | API HTTP/HTTPS
                         |
                  mcp-glpi upstream
                         ^
                         | stdio
                         |
                 supergateway
                         ^
                         | MCP Streamable HTTP
                         |
                 reseau local uniquement
                         |
        +----------------+----------------+
        |                |                |
      Cursor           Codex            Claude
```

`mcp-glpi` fonctionne nativement en MCP stdio. La passerelle retenue est [`supergateway`](https://www.npmjs.com/package/supergateway), car elle supporte explicitement `stdio -> Streamable HTTP`, expose un endpoint de healthcheck et reste simple à embarquer dans une image Node. La version est figée par `SUPERGATEWAY_VERSION`.

## Prérequis

- Docker
- Docker Compose v2
- Un GLPI joignable depuis le serveur Docker

Node.js, npm, Git et les dépendances applicatives ne sont pas requis sur l'hôte au runtime.

## Installation

```bash
git clone git@github.com:DooSys/glpi-mcp-docker.git
cd glpi-mcp-docker
cp .env.example .env
nano .env
docker compose build
docker compose up -d
```

Le service écoute par défaut sur :

```text
http://IP_SERVEUR:8000/mcp
```

Pour limiter l'écoute à l'hôte local ou à une IP précise, modifiez `MCP_BIND_ADDRESS` dans `.env`.

## Vérification

```bash
docker compose config
docker compose ps
docker compose logs -f
curl http://127.0.0.1:8000/healthz
```

## Configuration GLPI

Variables principales :

```env
GLPI_URL=https://glpi.example.local
GLPI_APP_TOKEN=CHANGE_ME
GLPI_USER_TOKEN=CHANGE_ME
GLPI_TIMEOUT_MS=15000
GLPI_MAX_RETRIES=2
```

Privilégiez `GLPI_APP_TOKEN + GLPI_USER_TOKEN`. L'upstream supporte aussi `GLPI_USERNAME + GLPI_PASSWORD`, mais ce n'est pas le mode recommandé ici.

Le compte GLPI associé au token doit être un compte technique dédié, avec un profil volontairement limité. Les annotations MCP comme `readOnlyHint` et `destructiveHint` aident les clients à afficher des confirmations, mais elles ne remplacent jamais les ACL GLPI.

## Connexion des clients MCP

### Cursor

Cursor supporte les transports `stdio`, `SSE` et `Streamable HTTP` pour les serveurs MCP distants.

Exemple dans `~/.cursor/mcp.json` ou dans le fichier MCP du projet :

```json
{
  "mcpServers": {
    "glpi": {
      "url": "http://IP_SERVEUR:8000/mcp"
    }
  }
}
```

Selon la version de Cursor, vous pouvez aussi préciser le transport :

```json
{
  "mcpServers": {
    "glpi": {
      "transport": "http",
      "url": "http://IP_SERVEUR:8000/mcp"
    }
  }
}
```

### Codex

Codex utilise `~/.codex/config.toml` pour les serveurs MCP. Exemple :

```toml
[mcp_servers.glpi]
url = "http://IP_SERVEUR:8000/mcp"
enabled = true
```

Vous pouvez aussi l'ajouter via la CLI :

```bash
codex mcp add glpi --url http://IP_SERVEUR:8000/mcp
codex mcp list
```

### Claude Code

Claude Code sait ajouter un serveur MCP HTTP distant :

```bash
claude mcp add --transport http glpi http://IP_SERVEUR:8000/mcp
```

Pour une configuration projet partageable, `.mcp.json` :

```json
{
  "mcpServers": {
    "glpi": {
      "type": "http",
      "url": "http://IP_SERVEUR:8000/mcp"
    }
  }
}
```

Claude Desktop peut varier selon les versions et plateformes. Si votre version ne consomme pas directement un MCP HTTP distant, utilisez Claude Code ou un bridge local HTTP/SSE vers stdio côté poste client.

## Mise a jour upstream

Pour passer de `v3.3.0` à une version suivante :

1. Vérifiez le tag upstream.
2. Modifiez `.env` :

```env
MCP_GLPI_VERSION=v3.4.0
```

3. Reconstruisez et relancez :

```bash
docker compose build --no-cache
docker compose up -d
docker inspect glpi-mcp --format '{{ index .Config.Labels "org.opencontainers.image.upstream.version" }}'
```

Ne construisez pas automatiquement depuis `main` en production.

## Rollback

Remettez le tag précédent dans `.env` :

```env
MCP_GLPI_VERSION=v3.3.0
```

Puis :

```bash
docker compose build --no-cache
docker compose up -d
```

## Upload de fichiers

`mcp-glpi` expose `glpi_upload_document` avec un argument `file_path`.

Dans cette architecture Docker, ce chemin désigne un fichier visible par le conteneur, pas automatiquement un fichier présent sur le PC Cursor, Codex ou Claude distant. Le conteneur ne monte volontairement aucun filesystem arbitraire du serveur pour contourner cette limite.

L'upload de fichiers depuis les postes clients devra être traité séparément, avec un flux contrôlé et auditable.

## Sauvegarde / PRA

Le service est presque stateless. Les éléments importants à sauvegarder sont :

- ce dépôt Git ;
- le `.env` réel ou le coffre de secrets externe ;
- le tag upstream utilisé ;
- l'image publiée dans un registry si vous en utilisez un ;
- la configuration du reverse proxy éventuel.

## Sécurité

- V1 prévue pour réseau local/interne uniquement.
- Ne publiez pas directement ce service sur Internet.
- Ne commitez jamais `.env`.
- N'utilisez jamais un compte GLPI Super-Admin.
- Utilisez un token dédié et le minimum de privilèges.
- Commencez idéalement avec un profil GLPI principalement en lecture.
- Placez plus tard Traefik, HTTPS, authentification et filtrage réseau devant le service si l'exposition s'élargit.

## Versioning

Ce projet et l'upstream ont deux versions distinctes :

```text
glpi-mcp-docker      couche Docker maintenue ici
GMS64260/mcp-glpi    serveur MCP applicatif upstream
```

L'image contient des labels OCI permettant d'identifier l'upstream :

```bash
docker inspect glpi-mcp --format '{{ json .Config.Labels }}' | jq
```

Labels notables :

- `org.opencontainers.image.source`
- `org.opencontainers.image.upstream.source`
- `org.opencontainers.image.upstream.version`
- `org.opencontainers.image.supergateway.version`
