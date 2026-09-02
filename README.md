# GLPI MCP Docker

Serveur [Model Context Protocol](https://modelcontextprotocol.io/) Docker-first
pour GLPI, maintenu par DooSys / TiniSys IT Solutions. Il expose **133 outils**
pour les tickets, actifs, réseaux IP, GLPI Inventory, entités, LDAP, règles,
référentiels et statistiques.

Ce projet est une évolution de
[`GMS64260/mcp-glpi`](https://github.com/GMS64260/mcp-glpi), basée sur son
adaptateur Legacy `v3.3.0`. Ce n'est pas un produit officiel GLPI. Voir
[NOTICE](NOTICE), [LICENSE](LICENSE) et [docs/UPSTREAM.md](docs/UPSTREAM.md).

## Documentation

| Besoin | Document |
| --- | --- |
| Liste exhaustive, rôle et niveau d'accès de chaque outil | [Catalogue des 133 outils](docs/TOOLS.md) |
| Compatibilité Legacy, High-Level et Hybrid | [Matrice API](docs/API_COMPATIBILITY_MATRIX.md) |
| Authentification | [Authentification](docs/AUTHENTICATION.md) |
| Réseaux IP et scans Inventory | [Réseaux IP](docs/IP_NETWORKS.md) |
| Architecture et routage | [Architecture](docs/ARCHITECTURE.md) |
| Versions et tags | [Versioning](docs/VERSIONING.md) |
| Exposition du service | [Sécurité](SECURITY.md) |

## État de la version 0.3.1

| Composant | État |
| --- | --- |
| API Legacy `/apirest.php` | Production |
| API High-Level `/api.php/v2.3` | Preview, domaines explicitement supportés |
| Mode Hybrid | Production, sans fallback silencieux après erreur |
| Authentification App Token + User Token | Recommandée |
| OAuth par utilisateur | Planifiée |

La création d'une entité ou d'un lieu distingue désormais l'écriture réussie
de l'échec éventuel de sa relecture. Les entités prennent aussi en charge le DN
LDAP, le filtre LDAP, l'annuaire associé, le TAG d'inventaire et les mises à
jour partielles avec lecture avant/après écriture.

## Démarrage rapide

```bash
cp .env.example .env
nano .env
docker compose up -d
```

Configuration Legacy minimale recommandée :

```env
GLPI_URL=https://glpi.example.local
GLPI_API_MODE=legacy
GLPI_AUTH_MODE=service_account
GLPI_APP_TOKEN=CHANGE_ME
GLPI_USER_TOKEN=CHANGE_ME
```

Points d'accès par défaut :

```text
MCP:    http://127.0.0.1:8000/mcp
Health: http://127.0.0.1:8000/healthz
```

Image publiée :

```text
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:latest
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:0.3.1
ghcr.io/tinisys-it-solutions/glpi-mcp-docker:0.3
```

Mise à jour :

```bash
docker compose pull glpi-mcp
docker compose up -d --force-recreate --no-deps glpi-mcp
```

Le compte GLPI doit être dédié et disposer d'ACL minimales. Le serveur MCP n'a
pas d'authentification utilisateur intégrée en mode service account : conservez
l'écoute locale ou placez-le derrière un reverse proxy TLS authentifié. Ne
commitez jamais `.env`, jetons, mots de passe ou secrets OAuth.

Les fichiers destinés à `glpi_upload_document` doivent être placés dans
`MCP_UPLOAD_SOURCE` (`./uploads` par défaut). Le montage Docker est en lecture
seule et le serveur bloque les traversées, liens symboliques, fichiers non
réguliers et dépassements de taille.

## Développement

```bash
git clone git@github.com:TiniSys-IT-Solutions/glpi-mcp-docker.git
cd glpi-mcp-docker
npm ci
npm test
npm run build
docker build -t glpi-mcp-docker:local .
```

`npm run smoke` est en lecture seule tant que `--write` n'est pas fourni. Les
tests génériques résident dans `test-public/`; `test/` est réservé aux données
privées de validation et reste ignoré.

Le handshake MCP et la ressource `glpi://server/info` identifient la version
`glpi-mcp-docker` **0.3.1**. Les versions de l'adaptateur Legacy, du SDK MCP, de
Supergateway, de Zod et de Node.js sont exposées séparément.

## Licence

MIT. Les mentions amont et aval sont conservées dans [LICENSE](LICENSE) et
[NOTICE](NOTICE).
