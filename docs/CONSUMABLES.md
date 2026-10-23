# Consommables : outils MCP pour la gestion quotidienne

Ce domaine utilise les objets natifs GLPI : `ConsumableItemType` (catégorie),
`ConsumableItem` (fiche d’une référence) et `Consumable` (unité de stock).
L’Excel est une aide à la préparation en masse ; chaque action ci-dessous est
accessible directement par un outil MCP, sans fichier Excel.

## Types, fiches et seuils

Les outils catalogue existants acceptent maintenant `ConsumableItemType` dans
le domaine `dropdown`, en plus de `ConsumableItem` dans le domaine `asset`.

| Besoin | Outil | Paramètres principaux |
| --- | --- | --- |
| Lister les catégories | `glpi_list_catalog_items` | `domain: dropdown`, `itemtype: ConsumableItemType` |
| Lire une catégorie | `glpi_get_catalog_item` | Même sélection et `id` |
| Préparer une catégorie ou fiche | `glpi_preview_consumable_creation` | `itemtype`, `fields` |
| Créer une catégorie | `glpi_create_catalog_item` | `domain: dropdown`, `itemtype: ConsumableItemType`, `fields`, `correlation_id` UUID |
| Modifier une catégorie | `glpi_update_catalog_item` | Même sélection et `id`, champs partiels |
| Lister/lire les fiches | `glpi_list_catalog_items`, `glpi_get_catalog_item` | `domain: asset`, `itemtype: ConsumableItem` |
| Créer/modifier une fiche et ses seuils | `glpi_create_catalog_item`, `glpi_update_catalog_item` | Même sélection, `fields`, `correlation_id`, `id` pour modification |

Une catégorie accepte `name` et `comment`. La création d’une fiche exige
`name`, `entities_id` explicite (0 accepté) et `consumableitemtypes_id` positif.
Les champs facultatifs autorisés sont `ref`, `manufacturers_id`, `locations_id`,
`users_id`, `users_id_tech`, `is_recursive`, `otherserial`, `comment`,
`alarm_threshold` et `stock_target`.

Les identifiants de relations renseignés sont relus avant écriture. GLPI reste
responsable des droits effectifs. Les champs inconnus sont refusés : `model`,
`quantity`, `groups_id` et les colonnes du plugin ne sont pas envoyés en espérant
que GLPI les interprète. Un modèle commercial peut être intégré au nom de la
fiche, par exemple « Clavier Logitech K120 ».

Le seuil est un entier : `0` est conservé, `-1` désactive l’alerte native. Un seuil
omis à la création laisse GLPI appliquer sa configuration ; une cellule Excel
vide ne doit donc pas être traduite automatiquement par zéro. Le stock cible est
un entier positif ou nul ; zéro laisse l’objectif non défini. Une cible positive
inférieure au seuil est refusée. À la création, une cible positive exige un seuil
explicite pour ne pas deviner le seuil par défaut de GLPI. Une modification partielle compare le nouveau
seuil à la cible existante, et inversement.

L’aperçu ne crée rien et n’ajoute aucun stock. La création refait les contrôles,
y compris la recherche des doublons visibles et des fiches en corbeille. Les
catégories sont comparées par nom normalisé (casse, accents et espaces). Les fiches sont
comparées dans la même entité et le même lieu : même nom, ou même référence
produit et fabricant. Un doublon potentiel bloque l’écriture et indique les
identifiants à examiner. La vérification ne garantit pas l’absence d’un doublon
masqué par les droits GLPI ou créé simultanément par un autre client.

Les types n’ont pas de corbeille native : leur suppression par l’outil générique
est bloquée. Les purges restent bloquées tant que les références ne sont pas
exhaustivement vérifiées. L’audit `glpi_get_dropdown_usage` inclut la relation
`ConsumableItem.consumableitemtypes_id`.

### Exemple de préparation puis création d’une fiche

```json
{
  "itemtype": "ConsumableItem",
  "fields": {
    "name": "Clavier Logitech K120",
    "entities_id": 2,
    "consumableitemtypes_id": 1,
    "manufacturers_id": 4,
    "locations_id": 3,
    "ref": "REFERENCE_A_VERIFIER",
    "alarm_threshold": 3,
    "stock_target": 15
  }
}
```

Appeler `glpi_preview_consumable_creation` avec ce contenu, puis
`glpi_create_catalog_item` en ajoutant `domain: asset` et un `correlation_id`
UUID, après résolution des vrais identifiants. Ces valeurs sont illustratives.
L’aperçu est conseillé pour examiner le résultat ; la création réexécute les
mêmes contrôles même si l’aperçu n’a pas été appelé séparément.

## Stock et mouvements

| Outil | Usage |
| --- | --- |
| `glpi_get_consumable_stock` | `consumable_item_id`, `start`, `limit` : quantités disponibles/attribuées, seuil, cible, réapprovisionnement indicatif et unités paginées |
| `glpi_preview_consumable_stock_change` | Préparer un ajout, une attribution ou un retour ; obtenir l’empreinte de l’état courant |
| `glpi_apply_consumable_stock_change` | Exécuter le changement confirmé, avec la même description et une empreinte encore valide |

Les noms MCP métier sont indépendants des champs GLPI : `consumable_item_id`
est traduit en `consumableitems_id`, et `recipient_type`/`recipient_id` en
`itemtype`/`items_id`. L’attribution est limitée aux utilisateurs et groupes,
comme la liste native `consumables_types` de GLPI 11.0.11.

Les trois descriptions de changement possibles sont :

```json
{"action":"add_stock","consumable_item_id":10,"quantity":15}
```

```json
{"action":"assign","consumable_item_id":10,"consumable_ids":[41,42],"recipient_type":"User","recipient_id":7,"used_on":"2026-10-23"}
```

```json
{"action":"return_to_stock","consumable_item_id":10,"consumable_ids":[41,42]}
```

Pour un groupe, utiliser `recipient_type: Group`. Les identifiants d’unités sont
fournis par la lecture du stock. L’outil refuse les unités d’une autre fiche,
les doublons d’ID, l’attribution d’une unité déjà sortie et le retour d’une unité
déjà disponible. Les quantités et sélections sont limitées à 500 par mouvement.
La date d’utilisation est explicite et doit être une vraie date ISO ; les unités
nouvelles utilisent la date du serveur GLPI, selon son comportement natif.

L’aperçu valide l’existence et l’activation du destinataire, puis son périmètre :
une adhésion `Profile_User` pour l’utilisateur, ou l’entité du groupe. Une portée
récursive sur une entité parente est acceptée. Une lecture de droits/adhésions
impossible bloque le changement plutôt que d’ignorer ce contrôle.

L’application reçoit :

```json
{
  "change": {"action":"add_stock","consumable_item_id":10,"quantity":15},
  "preview_fingerprint": "EMPREINTE_SHA256_RETOURNEE_PAR_L_APERCU",
  "confirmation": "I_HAVE_VERIFIED_THE_CONSUMABLE_STOCK_CHANGE",
  "correlation_id": "123e4567-e89b-42d3-a456-426614174000"
}
```

L’empreinte lie l’opération au stock et au périmètre observés. Chaque unité
modifiée est relue immédiatement avant et après son écriture. Le retour ne vide
que `date_out`, comme l’action native ; les champs du précédent destinataire
restent présents. Le stock disponible dépend de l’absence de `date_out`.
L’outil ne soumet aucune demande et ne crée aucune approbation dans le plugin.

Une même instance du service refuse deux applications simultanées pour la même
fiche. Il ne s’agit pas d’une transaction distribuée : coordonner les mouvements
avec les autres clients et instances GLPI. Un lot est séquentiel et peut être
partiellement appliqué. Au premier incident, le serveur arrête le lot et retourne
les IDs vérifiés, les IDs dont l’écriture a été acquittée et l’unité tentée, avec
`outcome: incomplete_or_uncertain`. Une création ayant perdu sa réponse peut
avoir eu lieu sans ID connu : relire le stock et préparer uniquement le travail
restant, sans réessayer aveuglément. `correlation_id` sert à la traçabilité ; ce
n’est pas une clé d’idempotence persistante.

Les alertes sont signalées à seuil atteint ou franchi vers le bas
(`disponible <= seuil`). Le réapprovisionnement suggéré vaut
`max(0, cible - disponible)` si une cible positive existe. Cette lecture ne
déclenche ni notification, ni achat, ni tâche automatique GLPI.

## Routes et compatibilité

| Domaine | Routes Legacy utilisées |
| --- | --- |
| Types | `GET/POST /apirest.php/ConsumableItemType`, `GET/PUT /apirest.php/ConsumableItemType/{id}` |
| Fiches | `GET/POST /apirest.php/ConsumableItem`, `GET/PUT /apirest.php/ConsumableItem/{id}` |
| Unités | `GET/POST /apirest.php/Consumable`, `GET/PUT /apirest.php/Consumable/{id}` |
| Références et périmètre | `GET` sur `Entity`, `Location`, `Manufacturer`, `User`, `Group`, `Profile_User` |

Legacy est le backend fonctionnel de ce lot. Hybrid route explicitement les
outils catalogue et les nouveaux outils de stock vers Legacy, sans repli après
erreur. Les routes natives et leurs champs ont été examinés dans la référence
locale GLPI 11.0.11 (`ConsumableItem`, `ConsumableItemType`, `Consumable`, schéma
SQL et configuration des destinataires). Les sources GLPI ne sont pas vendues
ni importées dans le runtime.

En High-Level seul, la lecture d’une fiche utilise le chemin natif confirmé
`Assets/Consumable/{id}` et les types utilisent `Dropdowns/ConsumableItemType`.
Les écritures de ce domaine et les outils de stock retournent explicitement
`not_supported` : le contrat High-Level complet, les champs et la détection des
doublons restent à valider. Aucun chemin `Assets/ConsumableItem` n’est inventé.

## Excel et plugin Consommables

Le modèle Excel peut préparer catégorie, libellé, fabricant, modèle, référence,
quantité initiale, seuil, cible, lieu et entité. Le rapprochement de noms avec les
IDs et l’import massif ne sont pas automatisés par ce lot. L’import futur devra
réutiliser les mêmes validations et séparer la création des fiches des mouvements
de stock, avec un suivi de reprise.

La lecture initiale de l’instance a montré le plugin Consumables 2.1.12 et ses
champs additionnels. Les routes du wizard, demandes, validations et les champs
`order_ref`/`max_cart` ne sont pas exposés en écriture. La découverte partielle de
métadonnées du plugin ne prouve pas son contrat d’exécution.

## Validation

Les tests publics couvrent les champs et relations, doublons actifs et en
corbeille, seuils nuls, mises à jour partielles, garde des aperçus, mouvements
sur plusieurs unités, destinataires récursifs/hors périmètre, concurrence locale,
limite de pagination et interruption après commit simulé. Un test avec le SDK
MCP officiel traverse le serveur MCP jusqu’à un faux GLPI HTTP, et vérifie les
routes natives de création de type, ajout, attribution et retour en stock.

Aucun test d’écriture n’est effectué sur une instance GLPI réelle. Ces tests
ne remplacent pas une validation sur un GLPI jetable pour les règles et hooks
propres à une installation. Aucun déploiement n’est inclus dans ce changement.
