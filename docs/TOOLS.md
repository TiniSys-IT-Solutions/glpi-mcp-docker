# Active MCP tools

This catalogue lists the 258 tools currently registered by `src/index.ts` on
the active release branch. Unless stated otherwise, they are active through the Legacy
API and through Hybrid mode's explicit Legacy routing. High-Level API support
is available for the explicitly documented domains below.

Safety annotations are derived from tool names:

- read operations are marked read-only;
- create/add/link/attach operations are additive writes;
- partial `update_*` operations are idempotent, non-destructive writes;
- set/assign operations overwrite existing state and may require confirmation;
- delete operations are destructive, with purge behavior where documented.

`glpi_inventory_requeue_task` remains explicitly destructive because it cycles
task state and schedules work. Confirmed rule activation is reversible and is
explicitly classified as a non-destructive write.

Legacy partial updates for problems, changes, computers and projects use a
common read-before-write and post-write verification guard and reject empty
updates. A verification failure is reported separately from a confirmed write.
An update tool is not added solely because Legacy exposes a generic PUT: every
business update requires a durable field contract, null/omission semantics,
reference validation and explicit Legacy/High-Level/Hybrid routing. Domains
that do not yet meet those conditions remain without an unsafe raw update tool.

## IP Addressing synchronization

- `glpi_addressing_list_ranges` lists plugin ranges and relationship ids.
- `glpi_addressing_get_range` returns one complete range and its raw REST fields.
- `glpi_addressing_preview_ip_network_sync` produces a deterministic read-only
  create/update/unchanged/skip/conflict plan and fingerprint.
- `glpi_addressing_apply_ip_network_sync` requires that fingerprint and the exact
  phrase `I_HAVE_VERIFIED_THE_ADDRESSING_SYNC`. It is idempotent, continues after
  per-range failures, never deletes a range, and never launches ping or cron.

`adopt_exact_matches` defaults to false. `update_inferred_metadata` defaults to
false. Apply must repeat the preview selection and options.
Explicit IPNetwork ids are fetched individually and all must resolve. Legacy
`address + netmask` is normalized to canonical CIDR; invalid or contradictory
definitions are skipped explicitly, including GLPI's `address / dotted-mask`
display form. Addressing targets are paginated and an incomplete safety-capped
scan is rejected. `include_recursive` is not accepted because
no recursive entity traversal is implemented. Unresolved Location, Network,
VLAN and FQDN relations remain zero with warnings. Multi-row writes are not
transactional; apply reports each success or failure and safe retries are
idempotent through the synchronization marker.

## Server metadata

The `glpi://server/info` resource reports the downstream product identity
first (`glpi-mcp-docker` and its release version), followed by separately named
versions for the Legacy upstream baseline, MCP SDK, Supergateway and Node.js.
The Zod runtime dependency is also reported separately. This resource does not
require a GLPI Legacy session and is available in every API mode.

## Tickets and ITIL

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_tickets` | Read | List tickets with pagination, sorting and status filtering. |
| `glpi_get_ticket` | Read | Read a ticket with labels and linked-item counts. |
| `glpi_search_tickets` | Read | Business-oriented ticket search with friendly filters. |
| `glpi_get_ticket_timeline` | Read | Merge followups, tasks, solutions and validations chronologically. |
| `glpi_get_ticket_followups` | Read | List ticket followups. |
| `glpi_get_ticket_tasks` | Read | List ticket tasks. |
| `glpi_get_ticket_solutions` | Read | List ticket solutions. |
| `glpi_get_ticket_validations` | Read | List ticket approval requests. |
| `glpi_get_ticket_documents` | Read | List documents linked to a ticket. |
| `glpi_get_ticket_satisfaction` | Read | Read satisfaction score and comment. |
| `glpi_list_overdue_tickets` | Read | List unresolved tickets beyond their resolution deadline. |
| `glpi_create_ticket` | Write | Create a ticket using friendly entity/location/category/requester/assignee fields. |
| `glpi_update_ticket` | Write | Update ticket content, state, classification, assignment and deadlines. |
| `glpi_delete_ticket` | Destructive | Delete or permanently purge a ticket. |
| `glpi_add_followup` | Write | Add a public or private followup. |
| `glpi_add_task` | Write | Add a task, optionally with technician and planning dates. |
| `glpi_add_solution` | Write | Add a solution to a ticket. |
| `glpi_assign_ticket` | Write | Assign a ticket to a user or group. |
| `glpi_link_tickets` | Write | Create a relationship between tickets. |
| `glpi_add_ticket_validation` | Write | Request ticket approval. |
| `glpi_set_validation_status` | Write | Grant or refuse a validation. |

## Native forms and service catalog (GLPI 11)

These tools read the native GLPI 11 form model, not the retired Formcreator
plugin. Hybrid routes them explicitly to Legacy. High-Level mode returns a
clear not-supported error until equivalent routes are confirmed in the GLPI 11
Swagger. No form write tool is exposed yet because editing blocks also affects
ordering, conditional logic, translations and destination configuration.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_forms` | Read | List native forms; active non-draft forms are returned by default. |
| `glpi_get_form` | Read | Read a complete form with ordered sections, mixed question/comment blocks, conditions, validation data, selectable options, translations, destinations and redacted access policies. |
| `glpi_list_form_categories` | Read | List hierarchical service-catalog categories with their rich description and illustration metadata. |
| `glpi_review_forms` | Read | Produce a proofreading dataset: every visible text, its exact structural path, original HTML and normalized plain text. |

## Location integrity, history and controlled asset reassignment

These tools use raw foreign-key IDs for verification. A location label is never
treated as an ID and no reassignment tool creates a Location implicitly.
Deletion and batch reassignment default to dry-run. Hybrid routes this vertical
explicitly to Legacy; High-Level fails clearly pending confirmed Swagger routes.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_item_history` | Read | Read and normalize raw `Log` rows by item, dates and actor without relying on unavailable Log search options. |
| `glpi_list_location_history` | Read | Read normalized history for one Location. |
| `glpi_audit_locations` | Read | Detect numeric names, names matching another ID, normalized duplicates and duplicate complete paths without modifying data. |
| `glpi_find_location_duplicates` | Read | Focus the Location audit on duplicate candidates. |
| `glpi_resolve_location` | Read | Resolve an existing location by normalized name/complete name, entity and parent; return `resolved`, `not_found` or `ambiguous`. |
| `glpi_delete_location` | Destructive | Dry-run and safely delete one explicit unused Location; references, children and incomplete scans block deletion. |
| `glpi_preview_delete_location` | Read only | Build the same Location deletion plan without requiring destructive-call approval. |
| `glpi_delete_unused_locations` | Destructive | Validate an explicit Location list completely before the first deletion; no implicit range selection. |
| `glpi_update_monitor` | Write | Partially update a monitor with validated entity/location and raw-ID post-verification. |
| `glpi_update_network_equipment` | Write | Partially update network equipment with validated entity/location and raw-ID post-verification. |
| `glpi_update_phone` | Write | Partially update a phone with validated entity/location and raw-ID post-verification. |
| `glpi_update_peripheral` | Write | Partially update a peripheral with validated entity/location and raw-ID post-verification. |
| `glpi_update_appliance` | Write | Partially update an appliance with validated entity/location and raw-ID post-verification. |
| `glpi_reassign_assets_from_location_mapping` | Write | Plan or apply an explicit mapping across selected asset types; all destinations are validated before writes. |
| `glpi_list_ldap_directories` | Read | List LDAP directory metadata with password fields redacted. |
| `glpi_get_ldap_location_mapping` | Read | Read the location-related attribute mapping of one LDAP directory. |
| `glpi_list_automatic_actions` | Read | List automatic actions and scheduling/execution metadata. |
| `glpi_list_cron_executions` | Read | Read normalized `CronTask` history for time-window correlation. |

## Unmanaged discovery reconciliation

`glpi_audit_unmanaged_assets` compares GLPI Inventory `Unmanaged` discoveries
with selected managed asset types. It is strictly read-only. Values are
normalized only in memory: MAC separators/case, valid IPv4/IPv6, FQDN trailing
dots and short host names, serial whitespace and empty/generic values.

The score is deliberately explainable. A valid exact serial or UUID contributes
100, a physical exact MAC 90, exact FQDN 45, IP 35, exact non-generic name 35,
and short-name/FQDN 25. Entity and location are context only; manufacturer,
model and OUI never contribute identity evidence. Null, broadcast, multicast,
and VRRP MAC addresses are excluded from physical identity. Locally administered
unicast MACs remain candidates but are explicitly classified as such.
Contradictory serial, MAC or entity values are reported explicitly. IP alone can never
produce an `exact_match`. Equal top candidates are `ambiguous`; weak discoveries
and probable duplicate `Unmanaged` rows are reported separately.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_audit_unmanaged_assets` | Read | Return summary, verdicts, candidates, evidence, conflicts, proposed manual action and completeness metadata. It performs no mutation. |
| `glpi_apply_unmanaged_asset_reconciliation` | Destructive guard | Validate an explicit action list and confirmation, then currently return `not_supported` without writing because no generic GLPI 11 reconciliation contract has been confirmed. |

Discovery means a network observation; `Unmanaged` is GLPI's persisted
unmanaged object; an import refusal is a rule/import decision; a managed asset
is a typed inventory object such as a Computer or Printer. These states must not
be treated as interchangeable. Before cleanup, run a bounded audit by entity,
review conflicts and ambiguous candidates, validate SNMP coverage, export the
result, then prepare only explicit actions. Never delete discoveries merely
because an IP resembles a managed asset.

Example:

```json
{"entity_id": 2, "recursive": true, "minimum_confidence": "medium", "limit": 200}
```

## Asset import rules

The RuleImportAsset vertical is Legacy-only in Hybrid mode. Reads, exports,
diffs, restore previews and static risk analysis are read-only. Snapshot hashes
exclude `captured_at`, so identical rule configurations have the same SHA-256.
The High-Level API is fail-closed because no confirmed GLPI 11 route is used.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_asset_import_rules` | Read | List a bounded ordered page; criteria and actions are opt-in, while `fetch_all` remains explicit. |
| `glpi_get_asset_import_rule` | Read | Read one complete rule. |
| `glpi_export_asset_import_rules` | Read | Produce a deterministic, fingerprinted snapshot. |
| `glpi_diff_asset_import_rule_snapshots` | Read | Report additions, removals, edits, moves, activation and child changes; large snapshots may use bounded gzip/base64. |
| `glpi_preview_restore_asset_import_rules` | Read | Compare a verified inline or gzip/base64 snapshot to current state and fingerprint the restore plan. |
| `glpi_apply_restore_asset_import_rules` | Destructive guard | Revalidate an inline or compressed plan, then currently return `not_supported`; no write occurs until child ordering/deletion semantics are confirmed. |
| `glpi_simulate_asset_import_rules` | Read | Return `not_supported` instead of inventing GLPI engine evaluation semantics. |
| `glpi_analyze_asset_import_rule_risks` | Read | Perform deterministic static checks for ranking and overly permissive rule risks. |
| `glpi_set_asset_import_rule_enabled` | Guarded write | Validated activation contract; currently `not_supported` with no write. |
| `glpi_update_asset_import_rule` | Guarded write | Metadata-only update contract; currently `not_supported` with no write. |
| `glpi_add_asset_import_rule_criterion` | Guarded write | Criterion-add contract; currently `not_supported` with no write. |
| `glpi_update_asset_import_rule_criterion` | Guarded write | Criterion-update contract; currently `not_supported` with no write. |
| `glpi_delete_asset_import_rule_criterion` | Destructive guard | Fingerprinted deletion contract; currently `not_supported` with no write. |
| `glpi_add_asset_import_rule_action` | Guarded write | Action-add contract; currently `not_supported` with no write. |
| `glpi_update_asset_import_rule_action` | Guarded write | Action-update contract; currently `not_supported` with no write. |
| `glpi_delete_asset_import_rule_action` | Destructive guard | Fingerprinted deletion contract; currently `not_supported` with no write. |
| `glpi_create_asset_import_rule` | Guarded write | Create-disabled contract; currently `not_supported` with no write. |
| `glpi_reorder_asset_import_rules` | Guarded write | Complete-order/fingerprint contract; currently `not_supported` with no write. |

## Allowlisted catalog lifecycle

The common catalog vertical provides one consistent contract for source-audited
assets, hardware component definitions, dropdown values and management objects.
The `(domain, itemtype)` pair is strictly allowlisted. Generic writes reject
GLPI-controlled identifiers/timestamps and secret-like fields.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_catalog_items` | Read | List an allowlisted type with pagination, deleted-state selection and a safety cap. |
| `glpi_get_catalog_item` | Read | Read one object by raw ID. |
| `glpi_create_catalog_item` | Write | Create and reread an object; ambiguous verification explicitly warns against blind retry. |
| `glpi_update_catalog_item` | Write | Partial update with before/after data and exact field verification. |
| `glpi_preview_delete_catalog_item` | Read | Fingerprint current state and report reference-scan completeness/recoverability. |
| `glpi_delete_catalog_item` | Destructive | Require a fresh fingerprint, literal confirmation and correlation ID. Purge is blocked while the polymorphic reference scan is incomplete. |

This foundation covers core assets, software/licences, consumable definitions,
the hardware component catalogue, common asset/ITIL models and types, locations,
manufacturers, states, calendars, contracts, suppliers, contacts, budgets,
documents, domains, certificates, datacenters, clusters, databases and lines.

## Asset relations and governance

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_asset_relations` | Read | List an asset's contract, document, certificate or domain relations. |
| `glpi_attach_asset_relation` | Write | Idempotently attach an existing related object and reread the relation. |
| `glpi_preview_detach_asset_relation` | Read | Fingerprint one exact relation without deleting either endpoint. |
| `glpi_detach_asset_relation` | Guarded write | Detach only that relation after literal confirmation and a fresh fingerprint. |
| `glpi_get_dropdown_usage` | Read | Scan the explicit reference map before deleting or merging an intitulé. |
| `glpi_run_governance_audit` | Read | Run bounded completeness, duplicate, orphan, expiration, stale-inventory, coverage, unassigned-ITIL or SLA-risk audits. |

The dropdown usage result reports its coverage and whether it is complete.
Unsupported reference families are never silently treated as zero usage.

## Mutable network topology

`glpi_list_asset_network_ports`, `glpi_get_network_port`,
`glpi_create_network_port` and `glpi_update_network_port` manage port metadata.
Normal port updates preserve IP, VLAN and physical-connection relations.
`glpi_attach_vlan_to_port` and `glpi_connect_network_ports` are idempotent;
occupied physical ports are rejected. `glpi_preview_remove_network_link` and
`glpi_remove_network_link` remove only an exact VLAN membership or physical
connection after fingerprint and literal-confirmation validation.

`glpi_attach_ip_address` creates or reuses the port's `NetworkName` and is
idempotent for an exact address/name pair. `glpi_move_ip_address` supports an
expected-current-parent guard and preserves the former `NetworkName`.
`glpi_preview_delete_network_object` and `glpi_delete_network_object` handle
explicit IP deletion and dependency-free port deletion. A port containing any
NetworkName, IP, VLAN membership or physical connection is blocked.

## Asset component relations

`glpi_list_asset_components` reads the native `Item_Device*` relations for all
18 source-confirmed hardware component families. `glpi_get_component_usage`
lists every attachment and explicitly reports whether the component definition
is unused. `glpi_attach_component_to_asset` is idempotent for the same asset,
definition and serial. `glpi_update_asset_component` changes relation-specific
fields with an optional owner concurrency guard. `glpi_preview_detach_component`
and `glpi_detach_component_from_asset` require a fresh fingerprint and remove
only the relation, preserving both the asset and component definition.

## Asset inventory subobjects

`glpi_list_asset_subobjects`, `glpi_get_asset_subobject`,
`glpi_create_asset_subobject`, `glpi_update_asset_subobject`,
`glpi_preview_delete_asset_subobject` and `glpi_delete_asset_subobject` provide
one guarded lifecycle for volumes, OS installations, software installations,
antivirus products, virtual machines and remote-management records. Legacy
maps these to the native `Item_Disk`, `Item_OperatingSystem`,
`Item_SoftwareVersion`, `ItemAntivirus`, `ItemVirtualMachine` and
`Item_RemoteManagement` classes. High-Level uses the confirmed nested
`/Assets/{itemtype}/{id}/...` routes. Parent ownership fields cannot be changed
through the generic payload.

## Financial information and item notes

`glpi_list_item_metadata`, `glpi_get_item_metadata`,
`glpi_create_item_metadata`, `glpi_update_item_metadata`,
`glpi_preview_delete_item_metadata` and `glpi_delete_item_metadata` expose
native `Infocom` records and `Notepad` notes through one guarded contract.
Financial information is unique per item. Notes require their exact ID.
Ownership, author and GLPI timestamp fields cannot be overwritten. Deletion
requires a current fingerprint and literal confirmation. High-Level uses the
official nested Infocom and Note controllers.

## Inventory analysis, FortiGate HA and task control

These tools use confirmed Legacy itemtypes only. They never infer unavailable
provenance. Returned Inventory records are recursively redacted for communities,
passwords, authentication/encryption keys, tokens, cookies and Authorization
data.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_audit_fortigate_ha_assets` | Read | Identify likely HA members and shared cluster IP/MAC evidence; distinct serials are never merged. |
| `glpi_get_asset_inventory_provenance` | Read | Correlate an asset with available GLPI logs and Inventory job states while marking unavailable facts. |
| `glpi_get_asset_inventory_timeline` | Read | Produce a chronological view of persisted asset and inventory events. |
| `glpi_get_asset_inventory_raw_payload` | Read | Safe payload contract; currently `not_supported` because no source-audited raw-payload itemtype is confirmed. |
| `glpi_inventory_preview_task_schedule` | Read | Show task activity, repetition, window, jobs, last execution and scheduler-dependent next execution. |
| `glpi_inventory_set_task_reprepare` | Write | Change only `reprepare_if_successful` after expected-state and literal-confirmation checks, then verify. |
| `glpi_inventory_prepare_task_once` | Write | Enable one scheduler run while disabling automatic re-preparation, then verify both fields. |
| `glpi_inventory_get_task_execution_timeline` | Read | Filter task-job states by task, job, agent, date and state; timezone limitations remain explicit. |
| `glpi_classify_unmanaged_discovery` | Read | Classify discoveries from persisted name, IP, MAC, SysDescr and sysObjectID signals without writing. |
| `glpi_get_asset_network_identity` | Read | Join persisted ports, classified MACs, network names, IP addresses and VLAN links for one asset. |

The generic Inventory read family also includes agents, agent modules, task-job
logs, time-slot entries, redacted collect results and deployment mirrors in
addition to the previously exposed tasks, jobs, states, collects and packages.

Explicit additions: `glpi_inventory_list_agents`, `glpi_inventory_get_agent`,
`glpi_inventory_list_agent_modules`, `glpi_inventory_get_agent_module`,
`glpi_inventory_list_task_job_logs`, `glpi_inventory_get_task_job_log`,
`glpi_inventory_list_timeslot_entries`, `glpi_inventory_get_timeslot_entry`,
`glpi_inventory_list_collect_file_results`, `glpi_inventory_get_collect_file_result`,
`glpi_inventory_list_collect_registry_results`, `glpi_inventory_get_collect_registry_result`,
`glpi_inventory_list_collect_wmi_results`, `glpi_inventory_get_collect_wmi_result`,
`glpi_inventory_list_deploy_mirrors` and `glpi_inventory_get_deploy_mirror`.

FortiGate policy defaults to `member_identity=serial` and
`allow_shared_mac_for_member_linking=false`. Shared VRRP or HA MAC/IP evidence
may establish cluster context, but cannot collapse two different serials.
| `glpi_upload_document` | Write | Upload a document, optionally linked directly to a ticket. |
| `glpi_attach_document_to_ticket` | Write | Link an existing GLPI document to a ticket. |
| `glpi_list_problems` | Read | List problems. |
| `glpi_get_problem` | Read | Read a problem with its status label. |
| `glpi_create_problem` | Write | Create a problem. |
| `glpi_update_problem` | Write | Update a problem. |
| `glpi_list_changes` | Read | List changes. |
| `glpi_get_change` | Read | Read a change with its status label. |
| `glpi_create_change` | Write | Create a change. |
| `glpi_update_change` | Write | Update a change. |

## Inventory and networks

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_computers` | Read | List computers. |
| `glpi_get_computer` | Read | Read a computer and optional related inventory data. |
| `glpi_create_computer` | Write | Add a computer to inventory. |
| `glpi_update_computer` | Write | Update a computer. |
| `glpi_delete_computer` | Destructive | Delete or permanently purge a computer. |
| `glpi_list_softwares` | Read | List software records. |
| `glpi_get_software` | Read | Read a software record. |
| `glpi_create_software` | Write | Add a software record. |
| `glpi_list_network_equipments` | Read | List network equipment. |
| `glpi_get_network_equipment` | Read | Read network equipment and optional network ports. |
| `glpi_list_printers` | Read | List printers. |
| `glpi_get_printer` | Read | Read a printer. |
| `glpi_update_printer` | Idempotent write | Partially update a printer after reference and entity/location validation, then verify every requested field. |
| `glpi_append_printer_comment` | Idempotent write | Append exact text without replacing existing content or adding it twice. |
| `glpi_reassign_printers_from_import_entity_rules` | Confirmed idempotent write | Dry-run or apply entity/location assignments derived from active CIDR rules, preserving previous location labels in comments. |
| `glpi_list_monitors` | Read | List monitors. |
| `glpi_get_monitor` | Read | Read a monitor. |
| `glpi_list_phones` | Read | List phones. |
| `glpi_get_phone` | Read | Read a phone. |
| `glpi_list_ip_networks` | Read | List declared IPv4 and IPv6 LANs. |
| `glpi_get_ip_network` | Read | Read one GLPI `IPNetwork`. |
| `glpi_create_ip_network` | Write | Declare a LAN from a name, CIDR, entity and optional gateway. |
| `glpi_update_ip_network` | Non-destructive write | Partially update or rename a LAN and let GLPI recompute its implicit hierarchy. |

### Printer reassignment

`glpi_update_printer` maps durable MCP fields to native Legacy fields and sends
only explicitly supplied values. A JSON `null` clears supported optional text;
omission preserves the current value. References are read before the printer is
written. A location must belong to the target entity, or be recursively
available from one of its ancestor entities.

| MCP field | Legacy `Printer` field |
| --- | --- |
| `entity_id` | `entities_id` |
| `location_id` | `locations_id` |
| `inventory_number` | `otherserial` |
| `state_id` | `states_id` |
| `manufacturer_id` | `manufacturers_id` |
| `model_id` | `printermodels_id` |
| `printer_type_id` | `printertypes_id` |
| `network_id` | `networks_id` |
| `assigned_user_id` | `users_id` |
| `assigned_technician_id` | `users_id_tech` |
| `contact_number` | `contact_num` |
| `is_recursive` / `is_global` | `is_recursive` / `is_global` (`0` or `1`) |

Run a safe plan first:

```json
{
  "printer_ids": [12, 18, 27],
  "dry_run": true,
  "preserve_previous_location_in_comment": true,
  "comment_prefix": "Ancien lieu GLPI : "
}
```

The planner traverses `Printer -> NetworkPort -> NetworkName -> IPAddress`,
deduplicates addresses, excludes known technical printer addresses and prefers
one unambiguous `10.x.x.x` address. It then requires one active, single-CIDR
`RuleImportEntity` rule with one non-conflicting entity action and one
non-conflicting location action. Each result explains why it is ready, already
correct, ambiguous or rejected.

Legacy responses may expand foreign keys into labels. The shared relation-ID
resolver accepts only a non-negative integer, an entirely numeric string, or
the terminal ID of the corresponding `links` relation (`Entity`, `Location`,
and so on). It accepts an optional trailing slash, rejects partial conversions
such as `8abc`, and never propagates `NaN`.

If several active CIDR rules match, their normalized destination IDs are
compared. Identical entity/location pairs are safe equivalents: the lowest
`ranking`, then lowest rule ID is selected, other IDs appear in
`equivalent_rule_ids`, and `warnings` contains
`duplicate_equivalent_rules`. Conflicting destinations remain blocked as
`multiple_matching_rules`; no rule is modified or disabled.

Per-printer statuses include `ready`, `already_correct`, `ambiguous_ip`,
`no_matching_rule`, `multiple_matching_rules`, `rule_inactive`,
`invalid_rule_actions`, `invalid_target`, `concurrent_change`, `updated` and
`error`. The global report counts ready/already-correct, ambiguous,
invalid-target, no-match, skipped, errors and warnings.

Only apply a reviewed plan with the exact confirmation:

```json
{
  "printer_ids": [12, 18, 27],
  "dry_run": false,
  "preserve_previous_location_in_comment": true,
  "comment_prefix": "Ancien lieu GLPI : ",
  "confirmation": "I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN"
}
```

Immediately before each write the printer is read again. A previous location is
recorded using its complete name, without duplicating the line, and entity,
location and comment are updated together. If entity, location or comment has
changed since planning, that printer is skipped as `concurrent_change`. A
failed post-write verification becomes an explicit error and is never silently
continued. Failures are isolated per printer.
High-Level mode returns a clear not-supported error because its printer PATCH
contract has not been confirmed from the GLPI 11 Swagger. Hybrid routes these
three tools explicitly to Legacy.

## Entity-assignment rules

These tools target the `RuleImportEntity` collection used to assign inventoried
items to entities. They are read-only and work through both the Legacy API and
the High-Level API. Stable Hybrid routes them explicitly to Legacy.

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_import_entity_rules` | Read | List entity-assignment rules in evaluation order. |
| `glpi_get_import_entity_rule` | Read | Read one rule, including its criteria and actions. |
| `glpi_list_import_entity_rule_criteria` | Read | List criteria attached to one rule. |
| `glpi_get_import_entity_rule_criterion` | Read | Read one criterion and validate its parent rule. |
| `glpi_list_import_entity_rule_actions` | Read | List assignment actions attached to one rule. |
| `glpi_get_import_entity_rule_action` | Read | Read one action and validate its parent rule. |
| `glpi_create_import_entity_subnet_rule` | Write | Atomically create a disabled IPv4 CIDR rule with entity and location assignments; rollback on partial failure. |
| `glpi_add_import_entity_rule_criterion` | Idempotent write | Add one validated criterion after reading the rule and existing criteria; an exact match returns `already_exists: true` without another POST. |
| `glpi_update_import_entity_rule` | Write | Partially update name, description, comment, ranking, recursion or match mode without modifying subtype, criteria, actions or activation. Reads before writing and verifies afterward. |
| `glpi_set_import_entity_rule_enabled` | Confirmed write | Enable or disable a verified rule; requires the exact confirmation value. The operation is reversible and idempotent, so it is not advertised as destructive. |

Subnet rules are always created inactive. Read the new rule back and verify its
CIDR, target entity, target location and ranking before calling the enable tool.
High-Level writes use the official `RuleController` routes and schemas
introduced in API 2.0. Hybrid continues to route both write tools explicitly to
Legacy; there is no implicit fallback between APIs.

The generic criterion tool accepts exactly the native keys declared by
`RuleImportEntity::getCriterias()`:

| Criterion | Meaning |
| --- | --- |
| `tag` | Inventory tag |
| `domain` | Domain |
| `subnet` | Subnet |
| `ip` | IP address |
| `name` | Equipment name |
| `serial` | Serial number |
| `itemtype` | GLPI item type |
| `oscomment` | Operating-system comment |
| `_source` | Import source |

The numeric `condition` is a native GLPI `Rule::PATTERN_*` value:

| Value | Stable meaning | Accepted criteria |
| ---: | --- | --- |
| `0` | is | all nine criteria |
| `1` | is not | all nine criteria |
| `2` | contains | all except `_source` |
| `3` | does not contain | all except `_source` |
| `4` | starts with | all except `_source` |
| `5` | ends with | all except `_source` |
| `6` | regular expression matches | all except `_source` |
| `7` | regular expression does not match | all except `_source` |
| `8` | exists | all except `_source` |
| `9` | does not exist | all except `_source` |
| `333` | is CIDR | `ip`, `subnet` only |
| `334` | is not CIDR | `ip`, `subnet` only |

This is the complete condition set exposed by GLPI 11 for
`RuleImportEntity`. Global-search/empty (`10`, `30`), tree (`11`, `12`) and
date (`31`–`34`) conditions belong to other criterion types and are rejected.
For example, duplicate `subnet / 333 / 192.0.2.0/24` as
`ip / 333 / 192.0.2.0/24`, or use `334` for “does not match CIDR”. The
pattern is sent unchanged. The service validates criterion/condition
compatibility and the subtype, prevents an exact
criterion/condition/pattern duplicate, then verifies the created child and its
parent rule.

Legacy dropdown expansion can replace `rules_id` with the rule label. Parent
verification therefore resolves the exact numeric value or the terminal ID of
the `RuleImportEntity` relation link; labels and partial numeric conversions are
never compared. After a POST, both the direct child and the parent collection
are checked. If direct reading fails but the exact tuple is present in the
collection, creation remains verified. If neither path determines the outcome,
the tool returns `write_outcome_uncertain` with the returned criterion ID and a
clear instruction not to retry the POST blindly. A later normal call first
performs the exact idempotence check and therefore detects an existing child.

For partial rule updates, omitted fields remain unchanged. JSON `null` clears
`description` or `comment`; `sub_type`, criteria, actions and `is_active` are
never accepted by the update tool. A successful write remains `success: true`
if the post-write GET is forbidden, with `verification_status: "failed"`
reported separately.

## Organization and reference data

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_users` | Read | List users, active by default. |
| `glpi_get_user` | Read | Read a user. |
| `glpi_search_user` | Read | Search users. |
| `glpi_create_user` | Write | Create a GLPI user. |
| `glpi_list_groups` | Read | List groups. |
| `glpi_get_group` | Read | Read a group. |
| `glpi_create_group` | Write | Create a group. |
| `glpi_add_user_to_group` | Write | Add a user to a group. |
| `glpi_list_categories` | Read | List ITIL categories. |
| `glpi_list_entities` | Read | List entities with native fields and stable LDAP/TAG aliases. |
| `glpi_get_entity` | Read | Read an entity with native fields and stable LDAP/TAG aliases. |
| `glpi_create_entity` | Write | Create an entity with hierarchy, LDAP parameters, inventory TAG, address, GPS coordinates and contacts. |
| `glpi_update_entity` | Write | Partially update an entity after a pre-read, then verify the result. |
| `glpi_list_locations` | Read | List locations. |
| `glpi_get_location` | Read | Read a location. |
| `glpi_create_location` | Write | Create a location with code, alias, parent, entity scope, recursive flag, address and GPS coordinates. |
| `glpi_update_location` | Write | Partially update a location after a pre-read, preserving omitted fields and verifying the result. Legacy only until the High-Level PATCH route is confirmed. |

Entity and location tools use a shared business contract across Legacy and
High-Level APIs. Entity LDAP and inventory fields map as follows:

| MCP field | GLPI Legacy field | GLPI High-Level v2.3 field | Meaning |
| --- | --- | --- | --- |
| `ldap_dn` | `ldap_dn` | `ldap_dn` | DN/base DN representing the entity, for example `OU=SITE-E,OU=Sites,OU=EXAMPLE,DC=example,DC=infra`. It is not a search filter. |
| `ldap_filter` | `entity_ldapfilter` | `entity_ldapfilter` | Optional LDAP user-search filter. |
| `ldap_directory_id` | `authldaps_id` | `authldap: { id }` | Associated GLPI LDAP directory. `0` removes the entity-specific association; GLPI may then use its global default directory. |
| `inventory_tag` | `tag` | `tag` | TAG sent by an inventory tool for entity assignment. |

For `glpi_update_entity`, omitted properties are not sent and remain unchanged.
Send JSON `null` to explicitly clear an optional string, including `ldap_dn`,
`ldap_filter` or `inventory_tag`. The adapters translate that request to the empty
string expected by GLPI. DN strings are validated as non-blank and otherwise sent
unchanged; commas, hyphens, case and special characters are preserved.

Updates always read the entity before writing and read it again after writing. If
the write succeeds but verification is forbidden, the result remains
`success: true` with `update_status: "succeeded"` and separate
`verification_status` / `verification_error` fields.

After a successful Legacy entity creation, a precise
`ERROR_RIGHT_MISSING` during verification can mean that GLPI's session still
contains the recursive entity tree calculated before the child existed. The
adapter reselects the exact same active entity and recursion setting once, then
retries only the GET. It never broadens the entity scope and never repeats the
successful POST. A genuine or persistent ACL refusal remains reported as a
separate verification failure.

For `glpi_update_location`, `entity_id` maps to Legacy `entities_id` and
`parent_location_id` maps to `locations_id`. Omitted fields are never sent.
JSON `null` clears optional text/address/GPS fields; `parent_location_id: null`
removes the parent by sending `locations_id: 0`. `name`, `entity_id` and
`is_recursive` do not accept null. The operation always reads before writing
and reads again for verification.

Friendly fields such as `parent_entity_id`, `ldap_dn`, `entity_id` and
`parent_location_id` are mapped inside their respective adapters.
The former `locations_id` location-parent input remains accepted as a
deprecated compatibility alias.

## Projects, commercial data and knowledge base

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_list_projects` | Read | List projects. |
| `glpi_get_project` | Read | Read a project. |
| `glpi_create_project` | Write | Create a project. |
| `glpi_update_project` | Write | Update project content, dates and progress. |
| `glpi_list_contracts` | Read | List contracts. |
| `glpi_get_contract` | Read | Read a contract. |
| `glpi_create_contract` | Write | Create a contract. |
| `glpi_list_suppliers` | Read | List suppliers. |
| `glpi_get_supplier` | Read | Read a supplier. |
| `glpi_create_supplier` | Write | Create a supplier. |
| `glpi_list_documents` | Read | List documents. |
| `glpi_get_document` | Read | Read document metadata. |
| `glpi_list_knowbase` | Read | List knowledge-base articles. |
| `glpi_get_knowbase_item` | Read | Read a knowledge-base article. |
| `glpi_search_knowbase` | Read | Search knowledge-base article titles. |
| `glpi_create_knowbase_item` | Write | Create a knowledge-base article. |

## Search, statistics and session

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_search_v2` | Read | Generic multi-criteria search with pagination and selected fields. |
| `glpi_search` | Read | Backward-compatible single-criterion generic search. |
| `glpi_count` | Read | Count any supported item type using search criteria. |
| `glpi_list_search_options` | Read | Discover field IDs, names, datatypes and supported operators. |
| `glpi_get_ticket_stats` | Read | Return aggregate ticket statistics. |
| `glpi_get_asset_stats` | Read | Return counts by asset type. |
| `glpi_tickets_stats_by` | Read | Break ticket counts down by status, category, technician, entity or month. |
| `glpi_get_session_info` | Read | Read active profile, available profiles and visible entities. |

## GLPI Inventory plugin

| Tool | Access | Function |
| --- | --- | --- |
| `glpi_inventory_list_ip_ranges` | Read | List discovery/inventory IPv4 ranges. |
| `glpi_inventory_get_ip_range` | Read | Read one IPv4 range. |
| `glpi_inventory_create_ip_range` | Write | Create a range from explicit first/last addresses. |
| `glpi_inventory_create_ip_range_from_cidr` | Write | Calculate and create usable addresses from IPv4 CIDR. |
| `glpi_inventory_update_ip_range` | Write | Update range name, entity or bounds. |
| `glpi_inventory_list_ip_range_snmp_credentials` | Read | List range/SNMP-credential relations, optionally filtered by range or credential id. |
| `glpi_inventory_get_ip_range_snmp_credential` | Read | Read one relation by its own id. |
| `glpi_inventory_attach_snmp_credential_to_ip_range` | Write | Validate both referenced objects, reject an existing pair, then create the relation with an optional rank. |
| `glpi_inventory_update_ip_range_snmp_credential` | Write | Change only the priority rank of a relation. |
| `glpi_inventory_detach_snmp_credential_from_ip_range` | Destructive | Delete only the relation after confirmation `I_HAVE_VERIFIED_THE_ASSOCIATION`; preserve both referenced objects. |
| `glpi_inventory_list_credentials` | Read | List credential metadata with all secrets stripped recursively. |
| `glpi_inventory_get_credential` | Read | Read one credential with all secrets stripped recursively. |
| `glpi_inventory_create_credential` | Write | Create write-only remote-device credentials. |
| `glpi_inventory_update_credential` | Write | Rotate or update write-only remote-device credentials. |
| `glpi_inventory_list_tasks` | Read | List task definitions and planning metadata. |
| `glpi_inventory_get_task` | Read | Read one task definition and its planning metadata. |
| `glpi_inventory_create_task` | Write | Create a task definition without executing it. |
| `glpi_inventory_update_task` | Write | Update a task definition without executing it. |
| `glpi_inventory_enable_task` | Write | Activate a task. |
| `glpi_inventory_disable_task` | Write | Deactivate a task. |
| `glpi_inventory_requeue_task` | Destructive | After a network change, cycle a verified task, enable successful re-preparation and queue it for the GLPI scheduler. Requires explicit confirmation. |
| `glpi_inventory_list_task_jobs` | Read | List jobs belonging to inventory tasks. |
| `glpi_inventory_get_task_job` | Read | Read one inventory task job. |
| `glpi_inventory_list_task_job_states` | Read | List execution and supervision states. |
| `glpi_inventory_get_task_job_state` | Read | Read one execution or supervision state. |
| `glpi_inventory_list_timeslots` | Read | List execution time slots. |
| `glpi_inventory_get_timeslot` | Read | Read one execution time slot. |
| `glpi_inventory_list_collects` | Read | List collection definitions. |
| `glpi_inventory_get_collect` | Read | Read one collection definition. |
| `glpi_inventory_list_collect_files` | Read | List file collection definitions. |
| `glpi_inventory_get_collect_file` | Read | Read one file collection definition. |
| `glpi_inventory_list_collect_registries` | Read | List registry collection definitions. |
| `glpi_inventory_get_collect_registry` | Read | Read one registry collection definition. |
| `glpi_inventory_list_collect_wmi_queries` | Read | List WMI collection definitions. |
| `glpi_inventory_get_collect_wmi_query` | Read | Read one WMI collection definition. |
| `glpi_inventory_list_deploy_packages` | Read | List deployment-package metadata without executing it. |
| `glpi_inventory_get_deploy_package` | Read | Read one deployment package without executing it. |
| `glpi_inventory_list_deploy_groups` | Read | List deployment target-group metadata. |
| `glpi_inventory_get_deploy_group` | Read | Read one deployment target group. |

The SNMP association tools use the plugin relation
`PluginGlpiinventoryIPRange_SNMPCredential`. Friendly MCP fields map as follows:

| MCP field | GLPI relation field | Meaning |
| --- | --- | --- |
| `id` | `id` | Identifier of the association itself |
| `ip_range_id` | `plugin_glpiinventory_ipranges_id` | Existing plugin IP range |
| `snmp_credential_id` | `snmpcredentials_id` | Existing native GLPI `SNMPCredential`; no secret is returned |
| `rank` | `rank` | Credential priority within the range |

Attach performs read-before-write checks for both referenced objects and an
exact duplicate search. It never retries the POST after a failed verification
GET; instead it returns the created relation id with a separate failed
verification status. High-Level support is not guessed: Legacy and explicit
Hybrid-to-Legacy routing are supported until the GLPI 11 High-Level schema
documents this plugin relation.

## Planned but not active

The following are deliberately not presented as active tools:

- richer FQDN/alias editing beyond the guarded NetworkName relationships already exposed;
- High-Level API domains not marked implemented in the compatibility matrix;
- GLPI Inventory import-configuration writes until an official, versioned API contract confirms the item type and writable fields;
- per-user OAuth authentication;
- generic destructive operations outside explicitly registered tools.
