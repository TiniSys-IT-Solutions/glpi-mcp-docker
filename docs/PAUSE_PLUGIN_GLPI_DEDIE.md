# Mise en pause du plugin GLPI dédié

Décision du 23 octobre 2026, à la demande du mainteneur.

## Décision et direction du projet

La séparation de l’intégration MCP vers un plugin GLPI dédié est mise en pause.
Le projet actif reste `glpi-mcp-docker`, avec son runtime Docker, ses outils
métier et ses adaptateurs Legacy, High-Level et Hybrid. L’intégration existante
avec GenBio Custom est conservée, notamment le transport explicite
`companion_api` pour les rapports et commentaires IP Addressing.

Le prototype `mcpbridge` n’est plus compilé, testé par la CI, empaqueté ni proposé
comme point d’entrée du produit actif. Le travail est conservé dans `.local`
pour permettre une reprise ultérieure ; aucune migration de production n’est
effectuée par cette réorganisation.

## Ce qui avait été développé

Le chantier avait dépassé une simple extraction des routes GenBio Custom. Il
avait préparé une nouvelle architecture d’intégration comprenant :

- Un plugin GLPI `mcpbridge` 0.1.0, avec installation, configuration native,
  politique d’accès, approbations humaines, état des opérations et audit.
- Un serveur MCP distinct utilisant OAuth individuel, Authorization Code avec
  PKCE, consentement par application et jetons MCP séparés des jetons GLPI.
- Un stockage chiffré des délégations, la rotation des jetons et la révocation.
- Un parcours de changement du titre d’un ticket avec aperçu, empreinte,
  expiration, approbation GLPI, contrôle de concurrence et résultat persistant.
- Des tests TypeScript et PHP, des scripts d’archive et de smoke test, une
  configuration Docker et un environnement GLPI jetable.
- Une documentation de contrat, d’installation, de migration, de décisions et
  de validation, conservée avec le prototype.

Le nouvel endpoint exposait cinq outils. Il ne constituait pas une migration
du catalogue historique de 288 outils et ne remplaçait pas les routes Addressing
de GenBio Custom.

## Pourquoi faire une pause maintenant

Le mainteneur a indiqué que la demande de séparation était une erreur à ce stade.
La priorité redevient la stabilisation du serveur et de l’intégration existante.

Le prototype introduit simultanément un plugin à maintenir, un endpoint
supplémentaire, un contrat métier distinct et un cycle de vie OAuth individuel.
Ces responsabilités demandent une décision de périmètre et des validations
supplémentaires avant de devenir une dépendance du produit.

Son premier parcours ticket ne répond pas encore à la séparation effective des
fonctions Addressing utilisées via GenBio Custom. Présenter ce travail comme une
extraction terminée ou comme le remplacement du serveur existant serait inexact.

La pause conserve les acquis techniques sans imposer cette architecture à la
prochaine livraison. Elle ne conclut pas que le concept est inutilisable.

## Niveau de validation connu

Le document archivé `plugin-glpi/docs/VALIDATION.md` rapporte notamment :

- 334 tests TypeScript réussis à l’ajout du socle et une compilation réussie ;
- 11 scénarios PHP synthétiques réussis ;
- une construction Docker et une validation locale du runtime individuel ;
- une installation sur un GLPI 11.0.11 jetable, avec flux OAuth navigateur,
  approbation et écriture sur des tickets synthétiques.

Ces résultats sont le bilan documenté du prototype, pas une nouvelle exécution
de ces scénarios lors de la mise en pause. Le document indique qu’aucun
déploiement ni test d’écriture sur l’instance du mainteneur ou d’un client n’a
été effectué. Il conserve les réserves sur la distribution officielle GLPI,
SSO/MFA, les écritures concurrentes, les interruptions et l’exploitation.

## Emplacement et contenu de l’archive locale

Racine relative au dépôt :

```text
.local/paused/glpi-mcpbridge-2026-10-23/
├── plugin-glpi/                     # Plugin PHP, docs, configuration et tests
├── src/integration/                 # Serveur MCP individuel TypeScript
├── test-public/integration-auth.test.ts
├── scripts/                        # Tests, packaging et smoke du prototype
├── dist/integration/               # Ancienne compilation locale, si présente
├── .local/mcpbridge-fixture/         # État local du fixture, si présent
└── active-wiring-before-pause.patch # Branchement avant la pause
```

Le patch conserve les différences préexistantes des fichiers de branchement et
de documentation concernés. Il sert de référence ; il ne doit pas être appliqué
aveuglément sur une version future du dépôt.

Les chemins relatifs et les commandes du prototype décrivent son emplacement
d’origine. L’archive est un rangement de travail, pas un projet autonome prêt à
exécuter depuis ce nouveau chemin.

`.local/` est déjà exclu de Git et du contexte Docker. Le prototype et l’état du
fixture restent donc locaux, y compris leurs éventuels fichiers privés. Un clone
du dépôt ne les récupère pas. Une conservation durable exige une sauvegarde
privée appropriée ; ne pas publier le fixture ou des secrets dans Git.

## Nettoyage du projet actif

Les scripts npm `test:plugin`, `package:plugin` et `start:integration`, ainsi que
les étapes CI correspondantes, ont été retirés. Les exclusions spécifiques à
l’ancien emplacement `plugin-glpi/` ont été retirées : l’exclusion globale de
`.local/` protège désormais l’ensemble déplacé.

Le README, l’authentification, la matrice API, la roadmap et le changelog
décrivent maintenant la pause. Les sources et la compilation locale du serveur
individuel quittent `src/` et `dist/`, et son test quitte la suite active.

Les corrections en cours du démarrage MCP, de validation de configuration et
de diagnostic Addressing sont conservées avec leurs tests et le document
`MCP_STARTUP_DIAGNOSTIC.md`. Le dépôt GenBio Custom n’est pas modifié par cette
opération. Aucun commit, déploiement ou changement de configuration GLPI réelle
n’est inclus dans ce rangement.

Vérifications effectuées après le rangement :

- `npm test` : **329 tests réussis**, aucun échec ; exécution autorisée hors du
  bac à sable pour permettre les sockets des serveurs de test locaux.
- `npm run build` : compilation TypeScript réussie.
- `git diff --check` : aucune erreur d’espaces.
- Absence de `plugin-glpi`, `src/integration` et `dist/integration` dans leurs
  anciens emplacements, y compris après compilation ; aucune référence active
  au prototype dans les sources, tests, scripts ou la CI.
- Archive confirmée comme ignorée par Git ; aucun fichier `.local` suivi.

## Conditions d’une éventuelle reprise

1. Confirmer explicitement le besoin : extraction Addressing, authentification
   individuelle ou autre périmètre métier précis.
2. Comparer ce besoin au maintien dans GenBio Custom et justifier le coût d’un
   plugin et d’un endpoint supplémentaires.
3. Relire les décisions, le contrat, l’audit des sources et les réserves de
   validation du prototype archivé.
4. Réintégrer les fichiers sélectionnés à leurs chemins attendus, adapter les
   branchements à la version courante et reconstruire les artefacts. Ne pas
   livrer l’ancienne compilation `dist/integration`.
5. Relancer les tests du serveur, du plugin et du fixture jetable ; confirmer la
   compatibilité GLPI et les clients MCP visés avant toute promotion.
6. Préparer un plan de migration et de retour arrière. Toute écriture de test
   sur une instance réelle reste soumise à une demande explicite.

La reprise n’est pas automatique et l’authentification `per_user` reste
indisponible sur le point d’entrée actif.
