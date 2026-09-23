# GLPI 11.0.8 and GLPI Inventory 1.6.10 tool audit

This audit is based on the local sources, not guessed routes:

- GLPI `11.0.8`: `glpi-11.0.8/glpi/src/Glpi/Api/HL/Controller`;
- GLPI Inventory `1.6.10`: `glpiinventory/setup.php`, `inc/` and `front/`;
- current MCP contracts in `src/index.ts` and `src/routing/api-router.ts`.

The goal is broad operational coverage without turning the MCP into an unsafe
one-to-one REST mirror. Tools should remain business-oriented. Every mutation
must read current state, validate permissions and relations, write only explicit
fields, reread, and return before/after data. Deletes require a preview,
fingerprint, literal confirmation and explicit soft-delete versus purge mode.

## Confirmed API surfaces

GLPI High-Level has source-confirmed controllers for:

- `/Assets`: generic asset CRUD, financial information, cartridges,
  consumables, software and versions, racks, enclosures, PDUs, passive DC
  equipment, cables, sockets, OS/software installations, antivirus, virtual
  machines, peripheral connections, remote management, appliances, domains,
  certificates and network ports;
- `/Components`: component definitions, component-to-asset relations and
  volumes;
- `/Assistance`: tickets, problems, changes, timeline entries, tasks,
  validations, costs, actors, links, pending reasons and recurring objects;
- `/Administration`: entities, users, groups, profiles, user attributes and
  event logs;
- `/Dropdowns`: CRUD for locations, ITIL categories, states, manufacturers,
  models, types, calendars and the other source-declared dropdowns;
- `/Management`: contracts, suppliers, contacts, budgets, documents, domains,
  licenses, databases, clusters, lines and their relations;
- `/Rule`: rule collections, rules, criteria, actions and native condition/action
  catalogues;
- `/Inventory`: agents, agent types, locked fields, SNMP credentials and agent
  inventory/status requests;
- `/Project`, `/Knowledgebase`, `/Tools`, `/Setup`, `/Notifications` and the
  generic item notes controller.

GLPI Inventory does not register an equivalent complete High-Level controller.
Its persistent objects inherit `CommonDBTM`, `CommonDropdown`,
`CommonDBRelation` or `CommonDBChild` and are candidates for the Legacy API only
after itemtype/search-option verification. Source-confirmed families include
tasks, task jobs, task states/logs, IP ranges, credentials, timeslots, collects,
deployment packages/groups/mirrors and their child records.

## Recommended common contracts

Avoid separate inconsistent CRUD semantics for every type. Introduce these
reusable business contracts behind typed allowlists:

| Contract | Purpose |
| --- | --- |
| `AssetService` | Asset core fields, lifecycle, ownership, entity/location and inventory identity. |
| `AssetRelationService` | Ports, IPs, components, software, contracts, documents, domains and certificates. |
| `DropdownService` | Safe CRUD and merge/replace workflows for controlled vocabularies. |
| `ITILService` | Tickets, problems, changes and their common timeline, actors, links, costs and validations. |
| `RuleService` | Deterministic snapshots, simulation, guarded edits and ordering for every supported rule collection. |
| `InventoryOperationsService` | Agents, credentials, ranges, tasks, jobs, collections and deployments. |
| `BulkPlanService` | Read-only plan, deterministic fingerprint, bounded explicit IDs, apply and verification. |

All list contracts should support `entity_id`, `recursive`, `is_deleted`,
`start`, `limit`, `fetch_all`, stable sorting and a safety cap. Every response
should identify `api_mode`, itemtype, completeness and fields unavailable from
the selected backend.

## P0 — Complete asset identity and topology

### Asset lifecycle

Implement the same read/create/update/delete contract for:

- Computer, NetworkEquipment, Printer, Monitor, Phone and Peripheral;
- Appliance, Rack, Enclosure, PDU, PassiveDCEquipment and Unmanaged;
- Software, SoftwareVersion and SoftwareLicense;
- CartridgeItem/Cartridge and ConsumableItem/Consumable.

Recommended MCP tools:

- `glpi_list_assets`, `glpi_get_asset`, `glpi_create_asset`,
  `glpi_update_asset`, `glpi_preview_delete_asset`, `glpi_delete_asset`;
- durable convenience aliases per common type, without duplicating adapter
  logic;
- `glpi_restore_asset` for soft-deleted objects where the backend supports it;
- `glpi_clone_asset_preview` and `glpi_clone_asset` with an explicit relation
  allowlist;
- `glpi_bulk_preview_asset_updates` and `glpi_bulk_apply_asset_updates`.

Deletion must distinguish trash from purge. Purge is destructive and must list
all relations that will be removed or orphaned.

### Network identity

This is the most important missing foundation for inventory reconciliation:

- list/get/create/update/delete NetworkPort;
- Ethernet, Wi-Fi, fibre-channel, aggregate, alias, dial-up and local port data;
- NetworkName, FQDN, IPAddress and IPNetwork relationships;
- VLAN membership and port-to-port connections;
- port MAC classification, duplicates and movement history.

Recommended tools:

- `glpi_list_asset_network_ports`, `glpi_get_network_port`,
  `glpi_create_network_port`, `glpi_update_network_port`,
  `glpi_preview_delete_network_port`, `glpi_delete_network_port`;
- `glpi_list_asset_ip_addresses`, `glpi_attach_ip_address`,
  `glpi_move_ip_address`, `glpi_detach_ip_address`;
- `glpi_list_asset_vlans`, `glpi_attach_vlan_to_port`,
  `glpi_detach_vlan_from_port`;
- `glpi_connect_network_ports`, `glpi_disconnect_network_ports`;
- `glpi_audit_network_identity` and `glpi_find_network_identity_conflicts`.

IP or port removal must never be implicit during a normal asset update.

### Components and inventory subobjects

The Component controller confirms definitions and asset relations for
motherboards, processors, memory, disks, drives, network/graphic/sound cards,
power supplies, batteries, firmware, cases, controllers, cameras, sensors,
SIM cards, PCI and generic devices.

Recommended tools:

- `glpi_list_component_types`, `glpi_list_components`, `glpi_get_component`;
- `glpi_create_component`, `glpi_update_component`,
  `glpi_preview_delete_component`, `glpi_delete_component`;
- `glpi_list_asset_components`, `glpi_attach_component_to_asset`,
  `glpi_update_asset_component`, `glpi_detach_component_from_asset`;
- `glpi_list_asset_volumes`, `glpi_create_asset_volume`,
  `glpi_update_asset_volume`, `glpi_delete_asset_volume`;
- equivalent relation tools for OS installations, software installations,
  antivirus, virtual machines and remote-management records.

Component deletion must be blocked while attached unless an explicit detached
relation plan has been approved.

### Asset financial and documentary relations

Recommended tools:

- `glpi_get_asset_financial_info`, `glpi_set_asset_financial_info`,
  `glpi_delete_asset_financial_info`;
- `glpi_list_asset_contracts`, `glpi_attach_contract_to_asset`,
  `glpi_detach_contract_from_asset`;
- `glpi_list_asset_documents`, `glpi_attach_document_to_asset`,
  `glpi_detach_document_from_asset`;
- `glpi_list_asset_certificates`, `glpi_attach_certificate_to_asset`,
  `glpi_detach_certificate_from_asset`;
- `glpi_list_asset_domains`, `glpi_attach_domain_to_asset`,
  `glpi_detach_domain_from_asset`;
- `glpi_list_item_notes`, `glpi_add_item_note`, `glpi_update_item_note`,
  `glpi_delete_item_note`.

## P0 — Complete ITIL management

Use a common Ticket/Problem/Change contract instead of separate partial
implementations.

### Core lifecycle and actors

- complete list/get/create/update/soft-delete/purge for Ticket, Problem and
  Change;
- status transitions with allowed-transition discovery;
- requester, observer, assignee, group and supplier actors;
- item and project links;
- duplicate, parent/child and related ITIL links.

Recommended additions:

- `glpi_transition_itil_status` with `expected_current_status`;
- `glpi_list_itil_team`, `glpi_add_itil_team_member`,
  `glpi_remove_itil_team_member`;
- `glpi_list_itil_asset_links`, `glpi_link_asset_to_itil`,
  `glpi_unlink_asset_from_itil`;
- `glpi_list_itil_relations`, `glpi_create_itil_relation`,
  `glpi_delete_itil_relation`;
- `glpi_preview_merge_tickets` and `glpi_apply_merge_tickets`.

### Timeline and service workflow

The official source confirms generic timeline CRUD, task CRUD and validation
CRUD. Add:

- update/delete followup, task and solution tools;
- task planning, duration, assignee and completion management;
- validation request, response, cancellation and substitution;
- pending reason assignment and follow-up scheduling;
- satisfaction read/update where rights permit;
- ticket/problem/change costs CRUD;
- recurring tickets and changes CRUD;
- ITIL and followup/task/solution/validation templates CRUD;
- SLA/OLA assignment, deadline preview and escalation audit.

No timeline deletion should occur through the parent ITIL update tool.

## P0 — Entities, locations and dropdown integrity

### Entities and locations

Complete the existing tools with:

- entity tree, inherited settings and effective-value inspection;
- safe entity move preview/apply;
- location tree move/rename/merge preview/apply;
- entity/location usage inventory before deletion;
- bulk reassignment for every supported itemtype;
- entity activation and recursive-scope audits.

Recommended tools:

- `glpi_get_entity_effective_configuration`;
- `glpi_preview_move_entity`, `glpi_apply_move_entity`;
- `glpi_preview_merge_locations`, `glpi_apply_merge_locations`;
- `glpi_get_location_usage`, `glpi_get_entity_usage`.

### Intitulés/dropdowns

The Dropdown controller source confirms CRUD for ITIL categories, states,
manufacturers, models, asset types, request types, solution/task categories,
calendars, document types, contract/supplier types, network types, VM types and
many other controlled vocabularies.

Expose an allowlisted generic family:

- `glpi_list_dropdown_values`, `glpi_get_dropdown_value`,
  `glpi_create_dropdown_value`, `glpi_update_dropdown_value`;
- `glpi_get_dropdown_usage`;
- `glpi_preview_merge_dropdown_values`,
  `glpi_apply_merge_dropdown_values`;
- `glpi_preview_delete_dropdown_value`, `glpi_delete_dropdown_value`.

Merge must replace all references, verify zero remaining references, then
soft-delete the source. Never purge in the same operation.

## P1 — Rules and automation

The Rule controller provides collection discovery and native catalogues for
criteria, conditions, action fields and action types. Generalise the current
RuleImportAsset work:

- `glpi_list_rule_collections`;
- `glpi_get_rule_collection_capabilities`;
- `glpi_export_rule_collection`, `glpi_diff_rule_snapshots`;
- `glpi_preview_restore_rule_collection`,
  `glpi_apply_restore_rule_collection`;
- CRUD for rule, criterion and action with subtype validation;
- `glpi_preview_reorder_rules`, `glpi_apply_reorder_rules`;
- `glpi_simulate_rules` only for collections whose native evaluation semantics
  have been source-audited.

Candidate collections include entity assignment, asset import/linking,
ticket/business rules, software categories, mail receivers and dictionary
rules. Each collection needs its own allowed fields and conditions.

Add automation tools for:

- automatic-action configuration and execution logs;
- preview/request one execution, without emulating cron internally;
- notification definitions, recipients, templates and translations;
- queued-notification inspection and explicit resend requests;
- webhooks and queued-webhook status where secret headers remain redacted.

Plugin enable/disable/install/uninstall/clean endpoints exist but should not be
exposed as ordinary MCP tools. They are high-impact administration operations
and need a separate maintenance policy.

## P1 — GLPI Inventory operations

### Agents and credentials

Add:

- `glpi_inventory_list_agents`, `glpi_inventory_get_agent`;
- `glpi_inventory_get_agent_modules`,
  `glpi_inventory_set_agent_module_enabled`;
- `glpi_inventory_preview_agent_request`,
  `glpi_inventory_request_agent_inventory`,
  `glpi_inventory_request_agent_status`;
- `glpi_inventory_preview_agent_wakeup`,
  `glpi_inventory_wakeup_agent`;
- credential CRUD with write-only secrets and redacted reads;
- credential-to-IP and credential-to-range relation management;
- credential usage audit before deletion.

Never return SNMP communities, authentication keys, privacy keys or stored
password values. A secret update response should only expose `changed: true`.

### Tasks, jobs, ranges and schedules

Complete the existing task tools with:

- task and task-job full CRUD;
- module, target, actor and agent selection;
- timeslot and timeslot-entry CRUD;
- preview force-run, force-run, cancel and force-end operations;
- discovery/inventory state and task-job log reads;
- execution summaries, error grouping and retry candidates;
- IP range CRUD plus overlap/gap/credential-coverage audits.

Force-run/cancel/force-end must target explicit task/job state IDs, verify the
current state and use a dedicated confirmation phrase.

### Collection and deployment

Source-confirmed object families justify:

- collect CRUD and file/registry/WMI child CRUD;
- collect result/content reads with secret redaction;
- deployment package CRUD;
- package files, checks, actions and user-interaction steps;
- deployment groups with static/dynamic targets;
- mirrors and user-interaction templates;
- package import/export and checksum validation;
- deployment preview, explicit target plan, request, status, cancellation and
  result timeline.

Deployment is a remote-execution capability. Default annotations must mark
execution and cancellation as destructive/open-world. Package content and
targets require an immutable preview fingerprint and a low maximum batch size.

## P1 — Management and knowledge

Add complete CRUD and relation tools for:

- contracts and costs, suppliers, contacts and budgets;
- documents and downloads;
- domains and records;
- certificates;
- software licenses;
- datacenters, clusters, database instances/databases and lines;
- projects, tasks, costs, teams and ITIL links;
- knowledge articles, categories, comments and revision reads.

Document deletion must report every item link. Knowledge revision history is
read-only; updates create normal GLPI revisions instead of rewriting history.

## P2 — Audits and bulk governance

Build read-only cross-domain tools after the CRUD foundations:

- `glpi_audit_asset_completeness`;
- `glpi_audit_asset_relation_integrity`;
- `glpi_audit_orphan_components`;
- `glpi_audit_orphan_documents`;
- `glpi_audit_dropdown_duplicates`;
- `glpi_audit_entity_scope_leaks`;
- `glpi_audit_location_inheritance`;
- `glpi_audit_software_license_compliance`;
- `glpi_audit_contract_expirations`;
- `glpi_audit_certificate_expirations`;
- `glpi_audit_stale_assets`;
- `glpi_audit_inventory_coverage`;
- `glpi_audit_ticket_sla_risk`;
- `glpi_audit_unassigned_itil_items`;
- `glpi_audit_rule_and_automation_health`.

Every bulk remediation must have a separate preview/apply pair and operate only
on explicit IDs returned to the caller.

## Implementation order

### Current integration status

Implemented in the current `0.4.0` working tree: allowlisted asset/component/
dropdown/management lifecycle, complete persisted network-identity reads,
NetworkPort create/update/delete, NetworkName-aware IP attach/move/delete, and guarded VLAN and physical-port links,
18 component-to-asset relation families with usage checks and guarded detach,
volume, OS/software installation, antivirus, VM and remote-management lifecycle,
financial information and item-note lifecycle with guarded deletion,
contract/document/certificate/domain asset relations, audited dropdown usage,
agents/modules/job logs/timeslot entries/collect results/deployment mirror reads,
and bounded governance audits for completeness, duplicates, orphan documents,
expirations, stale inventory, inventory coverage, unassigned ITIL work and
ticket resolution-deadline risk. High-Level remains fail-closed where a
relation or plugin route has not been confirmed.

Still planned: richer FQDN/alias editing and the common ITIL team/timeline/cost layer,
generic ITIL timeline/cost/team mutations, dropdown merge apply, generic rule
collections, Inventory force/cancel and deployment execution, and bounded bulk
remediation apply workflows.

1. Network ports/IP/VLAN/FQDN and asset relation reads. They are prerequisites
   for reliable reconciliation.
2. Generic asset lifecycle for all allowlisted asset types.
3. Component definitions and component-to-asset relations.
4. Generic ITIL actors, relations, timeline updates/deletes and costs.
5. Safe dropdown CRUD, usage and merge.
6. Rule collection discovery and generic snapshot framework.
7. Inventory agents, jobs, logs, timeslots and force/cancel workflows.
8. Contracts/documents/licenses/certificates/domains and project coverage.
9. Collections and deployments, behind the strongest safeguards.
10. Cross-domain audits and bounded bulk remediation.

## Backend policy

- Prefer the confirmed GLPI High-Level controller for core GLPI domains.
- Keep an explicit Hybrid matrix per tool.
- Use Legacy for GLPI Inventory plugin itemtypes after search-option and CRUD
  signature verification.
- Never fall back from High-Level to Legacy after an error.
- Never expose a plugin front PHP form action as an API route. Reproduce only
  source-audited business behavior through a service adapter.
- Return `not_supported` when a source-confirmed API contract is absent.

## Delete and bulk-write policy

All delete or merge tools require:

1. current-state read;
2. reference and child scan with completeness status;
3. preview with exact IDs and before state;
4. deterministic fingerprint;
5. literal confirmation and correlation ID;
6. soft delete by default, explicit purge separately;
7. post-write verification;
8. per-item result and partial-failure report;
9. restoration snapshot whenever GLPI permits recovery.

Secrets, inventory payload credentials, Authorization headers and cookies must
be recursively redacted from returns, errors and logs.
