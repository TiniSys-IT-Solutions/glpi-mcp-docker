# GLPI MCP Docker - Plan de migration API V2

Statut du document : cadrage initial.

Statut de la branche : `v2`, branche de préparation et de planification.

Date de création : 2026-08-11.

Important : ce document ne lance pas la migration. Il prépare le futur travail. Aucune implémentation OAuth, GraphQL, client `/api.php/v2.3`, routage applicatif ou migration de tools MCP ne doit être déduite comme déjà réalisée.

## 1. Résumé exécutif

Le dépôt `DooSys/glpi-mcp-docker` fournit actuellement une dockerisation fonctionnelle du projet upstream `GMS64260/mcp-glpi`.

La version stable actuelle repose sur :

- le serveur MCP upstream `GMS64260/mcp-glpi`;
- `supergateway` pour exposer un serveur MCP stdio en MCP Streamable HTTP;
- l'API REST Legacy de GLPI via `/apirest.php`;
- une cible GLPI 11 déjà utilisée en production ou préproduction interne.

La branche `main` représente cette version stable Legacy. Elle ne doit pas être cassée.

La branche `v2` a pour objectif de préparer une future migration progressive vers la GLPI High-Level API v2.3, exposée typiquement sous :

```text
/api.php/v2.3
```

La documentation Swagger/OpenAPI de l'instance GLPI cible, typiquement disponible sous :

```text
/api.php/v2.3/doc
```

sera la source de vérité principale pour tout futur développement V2.

Ce document doit permettre une reprise plusieurs mois plus tard, même dans une nouvelle conversation Codex, sans perdre le contexte, les objectifs, les contraintes et les limites de sécurité.

## 2. Objectifs de cette branche

Cette branche doit préparer :

- un espace de travail séparé de la version stable;
- une base documentaire claire pour la migration GLPI High-Level API v2.3;
- les règles de travail pour Codex et les futurs contributeurs;
- une stratégie de migration progressive;
- une architecture cible à réévaluer au moment du GO;
- une matrice de compatibilité Legacy/V2/Hybrid;
- un cadre de tests et d'observabilité;
- un prompt de reprise directement réutilisable.

Cette branche ne doit pas encore contenir :

- de client OAuth V2;
- de client REST `/api.php/v2.3`;
- de client GraphQL;
- de migration de tools MCP;
- de nouveau serveur applicatif;
- de suppression du fonctionnement Legacy;
- de modification comportementale du Dockerfile pour une V2 réelle.

## 3. Dépôts et attribution

### 3.1 Dépôt DooSys

Dépôt principal :

```text
DooSys/glpi-mcp-docker
```

Rôle :

- dockeriser `GMS64260/mcp-glpi`;
- figer une version upstream explicite;
- exposer le serveur MCP sur le réseau local via Streamable HTTP;
- fournir une configuration Docker Compose simple et reproductible;
- conserver un déploiement Docker-first.

### 3.2 Upstream actuel

Projet upstream :

```text
https://github.com/GMS64260/mcp-glpi
```

Licence :

```text
MIT
```

Le futur développement peut réutiliser, adapter ou s'inspirer de ce travail, sous réserve de conserver les mentions de copyright et de licence nécessaires.

Pendant la future migration, distinguer clairement :

- le code original DooSys;
- le code adapté depuis `GMS64260/mcp-glpi`;
- les dépendances directes;
- l'inspiration ou la logique reprise conceptuellement.

Ne jamais supprimer une attribution nécessaire.

## 4. Architecture actuelle

Le flux actuel est :

```text
Cursor / Codex / Claude
          |
          | MCP Streamable HTTP
          v
     Supergateway
          |
          | STDIO
          v
 GMS64260/mcp-glpi
          |
          | GLPI REST Legacy API
          v
        GLPI 11
```

Le projet upstream utilise actuellement :

```text
/apirest.php
```

Il s'agit de l'API REST Legacy de GLPI.

## 5. Ce qu'il faut préserver

Le projet upstream dispose déjà d'une base fonctionnelle importante :

- environ 84 tools MCP;
- gestion des tickets;
- timeline;
- followups;
- tasks;
- solutions;
- validations;
- problèmes;
- changements;
- assets;
- utilisateurs;
- groupes;
- catégories;
- entités;
- lieux;
- documents;
- statistiques;
- recherches;
- schémas Zod;
- descriptions de tools;
- annotations MCP;
- `readOnlyHint`;
- `destructiveHint`;
- gestion des erreurs;
- timeouts;
- retries;
- pagination;
- tests;
- logique métier déjà éprouvée.

La future migration doit conserver autant que possible :

- les noms de tools MCP existants;
- les contrats d'entrée MCP;
- des formats de sortie suffisamment proches;
- les protections autour des opérations destructives;
- la compatibilité Cursor / Codex / Claude;
- la philosophie Docker-first.

## 6. Pourquoi migrer vers GLPI High-Level API v2.3

GLPI 11 propose une nouvelle High-Level API.

La cible de cette branche est :

```text
GLPI High-Level API v2.3
```

Objectifs à terme :

- réduire ou supprimer la dépendance obligatoire à l'API Legacy;
- cibler GLPI 11 et les versions futures compatibles avec la High-Level API;
- exploiter des endpoints plus modernes lorsque disponibles;
- améliorer la clarté des schémas, relations, filtres et payloads grâce à OpenAPI;
- préparer une couverture plus riche des objets GLPI modernes;
- permettre une migration progressive sans casser l'existant.

La compatibilité GLPI 10 n'est pas un objectif de la branche V2.

## 7. Swagger/OpenAPI comme source de vérité

La future implémentation V2 doit être développée depuis la documentation OpenAPI/Swagger fournie par l'instance GLPI réellement utilisée.

Emplacement typique :

```text
/api.php/v2.3/doc
```

Le Swagger de l'instance cible doit être considéré comme la source de vérité principale pour :

- endpoints;
- méthodes HTTP;
- schémas;
- payloads;
- relations;
- filtres;
- paramètres;
- réponses;
- pagination;
- authentification;
- erreurs;
- fonctionnalités disponibles.

Règle stricte :

```text
Ne jamais extrapoler la structure de la nouvelle API depuis l'ancienne API Legacy.
```

Ne pas convertir mécaniquement :

```text
/apirest.php/xxx
```

vers :

```text
/api.php/v2.3/xxx
```

Chaque fonctionnalité doit être vérifiée dans Swagger v2.3.

## 8. Modes API cibles

La future architecture devra permettre de sélectionner le comportement via `.env`.

Conceptuellement :

```env
GLPI_API_MODE=legacy
```

ou :

```env
GLPI_API_MODE=v2
```

ou :

```env
GLPI_API_MODE=hybrid
```

Les noms définitifs pourront être ajustés, mais les trois concepts doivent être conservés.

## 9. Mode Legacy

Configuration conceptuelle :

```env
GLPI_API_MODE=legacy
```

Flux :

```text
MCP
 |
 v
Legacy client
 |
 v
/apirest.php
```

Le mode Legacy doit conserver autant que possible le comportement actuellement fonctionnel.

Il sert aussi de référence pendant toute la migration.

Contraintes :

- ne pas casser les tools existants;
- ne pas modifier les noms de tools MCP sans nécessité absolue;
- conserver les protections existantes;
- conserver les tests Legacy;
- documenter tout écart découvert.

## 10. Mode V2

Configuration conceptuelle :

```env
GLPI_API_MODE=v2
```

Flux :

```text
MCP
 |
 v
High-Level API client
 |
 v
/api.php/v2.3
```

Dans ce mode, aucun appel Legacy ne doit être réalisé silencieusement.

Si un tool MCP n'est pas encore supporté en V2, il doit retourner une erreur claire, par exemple :

```text
Tool glpi_add_followup is not implemented in GLPI_API_MODE=v2 yet.
```

Objectif :

- mesurer précisément la couverture réelle de la nouvelle API;
- empêcher les confusions entre support V2 réel et fallback Legacy;
- rendre visibles les manques;
- faciliter les tests de parité.

## 11. Mode Hybrid

Configuration conceptuelle :

```env
GLPI_API_MODE=hybrid
```

Flux :

```text
                MCP Tool
                   |
            V2 disponible ?
              /         \
            oui         non
             |           |
         API v2.3     Legacy API
```

Ce mode sera probablement le mode principal pendant la migration.

Principe :

- utiliser V2 en priorité lorsque le tool est officiellement migré et validé;
- utiliser Legacy uniquement comme fallback explicite pour les tools non encore migrés;
- maintenir une matrice de routage tool par tool;
- rendre observable quelle API a traité chaque appel.

Interdiction :

```text
Essayer V2, puis utiliser Legacy si une erreur quelconque survient.
```

Cette approche est interdite car elle pourrait masquer :

- des bugs;
- des erreurs d'autorisation;
- des mauvaises requêtes;
- des régressions;
- des différences de schéma;
- des erreurs de pagination;
- des problèmes de validation.

Le fallback doit être explicite et maîtrisé dans le code.

Exemple conceptuel de matrice :

```typescript
const toolApiMatrix = {
  glpi_get_ticket: "v2",
  glpi_list_tickets: "v2",
  glpi_add_followup: "legacy",
  glpi_delete_ticket: "legacy"
} as const;
```

## 12. Compatibilité des tools MCP

Exigence importante :

```text
Les clients MCP ne doivent pas avoir besoin de savoir quelle API GLPI est utilisée derrière.
```

Les noms des tools MCP existants doivent rester identiques autant que possible.

Exemples :

```text
glpi_list_tickets
glpi_get_ticket
glpi_search_tickets
glpi_get_ticket_timeline
glpi_add_followup
glpi_assign_ticket
```

Architecture souhaitée :

```text
Cursor / Codex / Claude
          |
          v
       MCP Tool
          |
       API mode
       /      \
   Legacy     V2
```

Cela doit permettre de changer :

```env
GLPI_API_MODE=legacy
```

en :

```env
GLPI_API_MODE=v2
```

sans reconfigurer Cursor, Codex ou Claude.

## 13. Parité fonctionnelle

Avant de considérer un tool comme migré en V2, vérifier :

- que le Swagger confirme l'existence des endpoints nécessaires;
- que les entrées MCP sont validées;
- que les payloads V2 sont corrects;
- que les réponses sont normalisées;
- que le comportement utilisateur reste cohérent avec Legacy;
- que les erreurs sont compréhensibles;
- que la pagination est fiable;
- que les permissions insuffisantes produisent des erreurs claires;
- que les tests de parité passent.

Matrice centrale de suivi :

| MCP Tool | Legacy | V2 | Hybrid | Tests | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| glpi_list_tickets | OK | TODO | OK via Legacy | TODO | Verifier endpoint, pagination, filtres |
| glpi_get_ticket | OK | TODO | OK via Legacy | TODO | Verifier schema detail ticket |
| glpi_search_tickets | OK | TODO | OK via Legacy | TODO | Verifier recherche, filtres, RSQL si disponible |
| glpi_get_ticket_timeline | OK | TODO | OK via Legacy | TODO | Verifier timeline, relations, tri |
| glpi_add_followup | OK | TODO | OK via Legacy | TODO | Ecriture; tests explicites seulement |
| glpi_assign_ticket | OK | TODO | OK via Legacy | TODO | Ecriture; verifier payload et ACL |

Cette table est initiale et illustrative. Au moment du GO, générer ou compléter la matrice réelle à partir de la liste complète des tools MCP présents dans le code.

Statuts recommandés :

- `OK` : support valide et testé;
- `TODO` : non encore migré;
- `PARTIAL` : support partiel documenté;
- `N/A` : non applicable;
- `BLOCKED` : bloqué par Swagger, GLPI, ACL ou écart fonctionnel;
- `OK via Legacy` : disponible en mode Hybrid via fallback explicite Legacy.

## 14. Pistes de nouvelles fonctionnalités V2

La migration ne doit pas seulement reproduire l'ancienne API.

Une fois la parité nécessaire obtenue, analyser les fonctionnalités supplémentaires rendues possibles par GLPI High-Level API v2.3.

Pistes à analyser dans Swagger :

- Virtual Machines;
- Antivirus;
- OS installations;
- Software installations;
- Connections;
- Remote management;
- Event logs;
- Database instances;
- LDAP replicas;
- Mail collectors;
- Automatic actions;
- Project teams;
- Project task teams;
- Notes;
- Reservations;
- Webhooks;
- nouveaux assets;
- nouvelles relations entre objets.

Ne pas créer ces tools pendant la phase de préparation.

Pendant une future phase dédiée :

- vérifier l'existence réelle dans Swagger;
- identifier les permissions GLPI nécessaires;
- décider si le tool apporte une valeur MCP claire;
- définir `readOnlyHint`, `destructiveHint` et `idempotentHint`;
- écrire tests et documentation;
- éviter de multiplier les tools peu utiles.

## 15. REST V2 et GraphQL

GLPI 11 propose également GraphQL.

Architecture d'étude possible :

```text
                 MCP
                  |
        +---------+---------+
        |                   |
     GraphQL             REST v2.3
        |                   |
    lectures             écritures
    reporting            créations
    relations            modifications
                         suppressions
```

GraphQL pourrait être intéressant pour :

- lecture;
- relations;
- reporting;
- limitation du nombre de requêtes;
- récupération d'objets imbriqués;
- vues synthétiques multi-objets.

Mais GraphQL ne doit pas être imposé artificiellement.

REST v2.3 reste acceptable pour la lecture lorsqu'il est plus simple, plus stable ou mieux documenté.

Etude à prévoir :

```text
REST v2.3 vs GraphQL selon les tools
```

Critères de décision :

- simplicité;
- robustesse;
- permissions;
- couverture Swagger;
- performance;
- pagination;
- clarté des erreurs;
- maintenabilité;
- facilité de test;
- proximité avec le besoin MCP.

## 16. Architecture logicielle future

Proposition conceptuelle :

```text
src/
|-- index.ts
|
|-- config/
|   `-- api-mode.ts
|
|-- clients/
|   |-- legacy/
|   |   |-- auth.ts
|   |   |-- http.ts
|   |   `-- client.ts
|   |
|   `-- v2/
|       |-- auth.ts
|       |-- http.ts
|       |-- graphql.ts
|       `-- client.ts
|
|-- tools/
|   |-- tickets/
|   |-- users/
|   |-- groups/
|   |-- assets/
|   |-- inventory/
|   `-- reporting/
|
`-- routing/
    `-- api-router.ts
```

Cette structure n'est pas une décision finale.

Au moment du GO, Codex devra réévaluer :

- la structure réelle du code upstream;
- les conventions existantes;
- la manière dont les tools sont déclarés;
- les clients HTTP existants;
- les tests existants;
- la stratégie Docker actuelle;
- l'effort de maintenance.

Principes à conserver :

- routage centralisé par mode API;
- séparation claire Legacy/V2;
- pas de fallback implicite;
- validation Zod en bord de tool;
- erreurs structurées;
- logs sans secrets;
- tests par couche;
- compatibilité MCP.

## 17. Authentification

La nouvelle API utilise une authentification différente de la Legacy.

Le futur développement doit impérativement étudier l'authentification exacte exposée par le Swagger GLPI v2.3 de l'instance cible.

Objectifs :

- compte GLPI technique dédié;
- permissions minimales;
- aucun Super-Admin;
- aucun secret commité;
- tokens OAuth correctement renouvelés si OAuth est requis;
- erreurs 401/403 claires;
- séparation de la configuration Legacy et V2;
- rotation possible des secrets.

Configuration conceptuelle :

```env
GLPI_API_MODE=hybrid

GLPI_URL=

# Legacy
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=

# API V2 / OAuth
GLPI_V2_CLIENT_ID=
GLPI_V2_CLIENT_SECRET=
GLPI_V2_USERNAME=
GLPI_V2_PASSWORD=
```

Les noms exacts pourront être définis plus tard.

Ne jamais commiter :

- `.env`;
- tokens;
- secrets OAuth;
- mots de passe;
- clés privées;
- dumps de requêtes contenant des secrets;
- logs contenant Authorization ou cookies.

## 18. Sécurité MCP

Conserver les bonnes pratiques du projet upstream :

- `readOnlyHint`;
- `destructiveHint`;
- `idempotentHint`;
- validation Zod;
- erreurs structurées;
- descriptions de tools précises.

Les opérations destructives doivent rester clairement identifiées.

Exemples d'opérations sensibles :

- suppression de ticket;
- modification de ticket;
- ajout de followup;
- ajout de solution;
- assignation;
- création ou suppression de document;
- modification d'asset;
- modification d'utilisateur ou de groupe;
- action déclenchant notification ou workflow.

Le fait d'utiliser GLPI API v2.3 ne doit jamais être considéré comme une sécurité en soi.

Les ACL GLPI restent le véritable mécanisme de contrôle.

## 19. Tests futurs

### 19.1 Tests unitaires

Couvrir :

- parsing de `GLPI_API_MODE`;
- validation des variables d'environnement;
- client HTTP Legacy;
- client HTTP V2;
- auth Legacy;
- auth V2;
- refresh de token si applicable;
- gestion 401/403;
- retry;
- timeout;
- pagination;
- mapping payload MCP vers GLPI;
- mapping réponse GLPI vers MCP;
- routage Legacy/V2/Hybrid.

### 19.2 Tests de parité

Pour un même tool :

```text
Legacy result
vs
V2 result
```

Les formats MCP doivent rester suffisamment similaires pour ne pas perturber Cursor, Codex ou Claude.

Les différences acceptées doivent être documentées.

### 19.3 Smoke tests lecture seule

Ne modifiant aucune donnée :

```text
get session
list tickets
get ticket
list users
list groups
list assets
list entities
list locations
```

Ces tests doivent pouvoir être lancés contre une instance de test GLPI.

### 19.4 Tests d'écriture

Seulement explicitement activés.

Exemple conceptuel :

```bash
npm run smoke -- --write
```

Ne jamais lancer automatiquement des tests destructifs contre un vrai GLPI.

Les tests d'écriture doivent :

- cibler une instance de test;
- utiliser des objets clairement préfixés;
- nettoyer si possible;
- produire un rapport clair;
- être désactivés par défaut.

### 19.5 Tests Docker

Vérifier :

- `docker compose config`;
- build reproductible;
- lancement du conteneur;
- healthcheck;
- variables d'environnement;
- absence de secrets dans l'image;
- labels OCI;
- logs de démarrage.

## 20. Observabilité

Prévoir des logs permettant de savoir quelle API a traité un appel.

Exemples :

```text
[MCP] glpi_get_ticket -> API v2.3
```

```text
[MCP] glpi_add_followup -> Legacy fallback
```

En mode Hybrid, ces logs sont essentiels.

Règles :

- aucun secret dans les logs;
- ne pas loguer les tokens;
- ne pas loguer les mots de passe;
- masquer Authorization;
- loguer le mode API actif au démarrage;
- loguer les erreurs de manière structurée;
- garder les logs utiles pour le diagnostic sans exposer de données sensibles.

## 21. Identification runtime

Prévoir à terme la possibilité de connaître facilement :

- version du projet `glpi-mcp-docker`;
- version upstream `mcp-glpi` éventuellement utilisée;
- version de l'API GLPI sélectionnée;
- mode API actif;
- version GLPI cible;
- version de l'image Docker;
- commit source si disponible.

Mécanismes possibles :

- labels OCI Docker;
- logs de démarrage;
- endpoint health/info si pertinent;
- sortie de diagnostic MCP read-only.

Exemple conceptuel :

```text
glpi-mcp-docker version: x.y.z
upstream mcp-glpi: v3.3.0
api mode: hybrid
glpi api: v2.3 + legacy fallback
```

## 22. Migration progressive souhaitée

### Phase 0 - Préparation

Objectifs :

- analyser le code réel;
- récupérer Swagger v2.3;
- comprendre l'authentification;
- lister les tools MCP existants;
- créer la matrice de compatibilité;
- proposer l'architecture finale;
- définir les tests initiaux.

Livrables :

- Swagger archivé ou référencé sans secrets;
- matrice initiale complète;
- plan d'architecture validé;
- aucun changement destructif.

### Phase 1 - Lecture simple

Tools ou domaines candidats :

- session;
- tickets;
- users;
- groups;
- entities;
- locations.

Objectifs :

- valider auth V2;
- valider client HTTP V2;
- valider routing;
- valider mode `v2`;
- valider mode `hybrid`;
- garder Legacy intact.

### Phase 2 - Search, filters, RSQL, pagination

Objectifs :

- comprendre les filtres exposés par Swagger;
- valider la pagination;
- comparer les résultats Legacy/V2;
- documenter les écarts;
- stabiliser les tools de recherche.

### Phase 3 - Assets, inventory, reporting, GraphQL éventuel

Objectifs :

- analyser les assets disponibles en V2;
- identifier les objets inventory modernes;
- étudier GraphQL pour lecture et reporting;
- éviter de sur-complexifier si REST suffit.

### Phase 4 - Ecritures courantes

Domaines :

- create ticket;
- update ticket;
- followup;
- task;
- solution;
- assignment.

Contraintes :

- tests d'écriture désactivés par défaut;
- instance GLPI de test;
- permissions minimales;
- confirmations et annotations MCP conservées.

### Phase 5 - ITIL avancé

Domaines :

- validations;
- documents;
- problems;
- changes;
- SLA;
- satisfaction.

Objectifs :

- vérifier disponibilité V2;
- maintenir parité comportementale;
- documenter les limitations.

### Phase 6 - Nouveaux tools propres à V2.3

Seulement après parité suffisante.

Pistes :

- Virtual Machines;
- Antivirus;
- OS installations;
- Software installations;
- Connections;
- Remote management;
- Event logs;
- Database instances;
- LDAP replicas;
- Mail collectors;
- Automatic actions;
- Project teams;
- Project task teams;
- Notes;
- Reservations;
- Webhooks.

### Phase 7 - Audit de couverture

Objectifs :

- vérifier la matrice complète;
- identifier les derniers fallbacks Legacy;
- valider les tests;
- valider les logs;
- valider la documentation;
- décider si `GLPI_API_MODE=v2` peut devenir recommandé.

La désactivation de l'API Legacy dans GLPI ne sera envisagée qu'après validation complète.

## 23. Configuration `.env` cible conceptuelle

Exemple non définitif :

```env
# API routing
GLPI_API_MODE=hybrid

# Common
GLPI_URL=https://glpi.example.local
GLPI_TIMEOUT_MS=15000
GLPI_MAX_RETRIES=2

# Legacy REST API
GLPI_APP_TOKEN=CHANGE_ME
GLPI_USER_TOKEN=CHANGE_ME

# GLPI High-Level API v2.3 / OAuth
GLPI_V2_CLIENT_ID=CHANGE_ME
GLPI_V2_CLIENT_SECRET=CHANGE_ME
GLPI_V2_USERNAME=CHANGE_ME
GLPI_V2_PASSWORD=CHANGE_ME

# MCP transport
MCP_BIND_ADDRESS=0.0.0.0
MCP_PORT=8000
MCP_PATH=/mcp
MCP_HEALTH_PATH=/healthz
MCP_SESSION_TIMEOUT_MS=600000
MCP_LOG_LEVEL=info
```

Ces noms devront être confirmés au moment de l'implémentation.

Ne pas ajouter ces variables au runtime réel tant que le code ne les utilise pas.

## 24. Ce qu'il ne faut surtout pas casser

Ne pas casser :

- la branche `main`;
- le build Docker actuel;
- le fonctionnement Legacy;
- les noms de tools MCP existants;
- la compatibilité Cursor;
- la compatibilité Codex;
- la compatibilité Claude;
- les annotations MCP;
- la validation Zod;
- la gestion des erreurs;
- la pagination;
- le retry;
- le timeout;
- les règles de sécurité;
- l'attribution upstream MIT.

Ne pas faire sans GO explicite :

- implémenter OAuth;
- appeler `/api.php/v2.3`;
- ajouter un client GraphQL;
- migrer des tools;
- supprimer le clone ou code upstream;
- modifier le modèle Docker de production;
- lancer des tests destructifs;
- commiter des secrets.

## 25. Procédure recommandée au futur GO

Au moment du GO :

1. Relire ce document entièrement.
2. Inspecter l'état réel de la branche `v2`.
3. Vérifier que `main` reste stable.
4. Récupérer la dernière version du code upstream si nécessaire.
5. Inspecter le Swagger v2.3 de l'instance GLPI cible.
6. Lister tous les tools MCP existants.
7. Construire la matrice de compatibilité complète.
8. Proposer l'architecture finale.
9. Implémenter la configuration `GLPI_API_MODE`.
10. Ajouter les tests de routage.
11. Implémenter le client V2 minimal.
12. Migrer un petit groupe de tools read-only.
13. Tester Legacy, V2 et Hybrid.
14. Documenter chaque écart.
15. Continuer par petites étapes.

## 26. Checklist de reprise

Avant d'écrire du code :

- [ ] Lire `AGENTS.md`.
- [ ] Lire `docs/V2_MIGRATION_PLAN.md`.
- [ ] Vérifier la branche courante.
- [ ] Vérifier `git status`.
- [ ] Vérifier que la branche n'est pas `main`.
- [ ] Inspecter `README.md`, `Dockerfile`, `docker-compose.yml`, `.env.example`.
- [ ] Inspecter la structure upstream intégrée.
- [ ] Lister les tools MCP existants.
- [ ] Obtenir Swagger v2.3 de l'instance cible.
- [ ] Vérifier l'authentification dans Swagger.
- [ ] Construire la matrice de compatibilité.
- [ ] Proposer un plan d'implémentation par petits commits.

Pendant le développement :

- [ ] Garder Legacy fonctionnel.
- [ ] Ne pas utiliser de fallback implicite.
- [ ] Tester chaque mode API.
- [ ] Ne pas commiter de secrets.
- [ ] Ne pas lancer de tests destructifs sans demande explicite.
- [ ] Mettre à jour la matrice.
- [ ] Mettre à jour la documentation.

Avant chaque commit :

- [ ] `git status`.
- [ ] `git diff --check`.
- [ ] Vérifier absence de secrets.
- [ ] Lancer les tests pertinents.
- [ ] Vérifier que les changements correspondent au scope.

## 27. PROMPT DE REPRISE POUR CODEX

Copier/coller ce prompt le jour du GO pour lancer réellement le développement V2 :

```text
Nous sommes dans le repository DooSys/glpi-mcp-docker, sur la branche v2.

Objectif : commencer progressivement la migration vers GLPI High-Level API v2.3, sans casser le mode Legacy existant.

Avant toute modification, fais impérativement ceci :

1. Lis entièrement AGENTS.md.
2. Lis entièrement docs/V2_MIGRATION_PLAN.md.
3. Vérifie git status, la branche courante et les remotes.
4. Confirme que tu n'es pas en train de modifier main.
5. Analyse l'état actuel du repository, notamment README.md, Dockerfile, docker-compose.yml, .env.example, package éventuel, tests éventuels et structure upstream.
6. Identifie comment les tools MCP actuels sont définis, validés et exposés.
7. Liste tous les tools MCP existants, avec leur domaine fonctionnel et leur niveau de risque.
8. Récupère ou inspecte le Swagger/OpenAPI GLPI High-Level API v2.3 de l'instance de développement, typiquement /api.php/v2.3/doc.
9. Considère ce Swagger v2.3 comme la source de vérité principale. Ne déduis pas les endpoints V2 depuis /apirest.php.
10. Compare le Swagger v2.3 avec les tools MCP actuels.
11. Construis ou complète une matrice de compatibilité : MCP Tool, Legacy, V2, Hybrid, Tests, Notes.
12. Propose l'architecture finale avant d'implémenter : config GLPI_API_MODE, clients legacy/v2, routage, tests, observabilité.

Contraintes fortes :

- Ne jamais casser le mode Legacy.
- Ne jamais casser la compatibilité Cursor / Codex / Claude.
- Préserver autant que possible les noms de tools MCP existants.
- Maintenir les trois modes conceptuels : legacy, v2, hybrid.
- En mode v2, ne jamais appeler Legacy silencieusement.
- En mode hybrid, utiliser une matrice explicite de fallback tool par tool.
- Ne jamais implémenter un fallback du type "essayer V2 puis Legacy sur n'importe quelle erreur".
- Conserver les validations Zod, descriptions de tools, erreurs structurées et annotations MCP comme readOnlyHint, destructiveHint, idempotentHint.
- Ne jamais commiter de secrets.
- Ne jamais lancer de tests destructifs contre un vrai GLPI sans demande explicite.
- Rester Docker-first : aucun Node/npm requis sur l'hôte final.
- Préserver les attributions et la licence MIT du projet upstream GMS64260/mcp-glpi.

Stratégie :

1. Commence par une phase d'analyse et de matrice, pas par une grosse réécriture.
2. Implémente d'abord la configuration GLPI_API_MODE et le routage minimal avec tests.
3. Ajoute ensuite un client V2 minimal conforme au Swagger et à l'authentification réelle.
4. Migre seulement quelques tools read-only simples au début : session, list tickets, get ticket, users, groups, entities, locations si le Swagger le confirme.
5. Pour chaque tool migré, teste legacy, v2 et hybrid.
6. Mets à jour la matrice après chaque migration.
7. Documente les écarts de comportement.
8. Ne migre les écritures qu'après stabilisation des lectures et avec tests explicitement activés.
9. Etudie GraphQL seulement lorsque cela apporte une valeur claire pour lecture, relations ou reporting.
10. Avance par petits commits vérifiables.

Livrable initial attendu :

- analyse de l'état actuel;
- matrice de compatibilité initiale complète;
- proposition d'architecture finale;
- premier petit changement technique uniquement si l'analyse est suffisante;
- tests associés;
- confirmation que Legacy reste fonctionnel.
```

## 28. Etat actuel après préparation

La branche `v2` créée dans cette phase contient uniquement :

- ce document de cadrage;
- `AGENTS.md`;
- un avertissement README indiquant que la branche est une branche de développement et planification.

Aucune migration fonctionnelle vers GLPI High-Level API v2.3 n'a été réalisée à ce stade.

Le développement V2 reste en attente d'un GO explicite.
