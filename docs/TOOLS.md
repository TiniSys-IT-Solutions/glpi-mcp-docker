# Active MCP tools

This catalogue lists the 134 tools currently registered by `src/index.ts` on
the active release branch. Unless stated otherwise, they are active through the Legacy
API and through Hybrid mode's explicit Legacy routing. High-Level API support
is available for the explicitly documented domains below.

Safety annotations are derived from tool names:

- read operations are marked read-only;
- create/add/link/attach operations are additive writes;
- update/set/assign operations overwrite existing state;
- delete operations are destructive, with purge behavior where documented.

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
| `glpi_list_monitors` | Read | List monitors. |
| `glpi_get_monitor` | Read | Read a monitor. |
| `glpi_list_phones` | Read | List phones. |
| `glpi_get_phone` | Read | Read a phone. |
| `glpi_list_ip_networks` | Read | List declared IPv4 and IPv6 LANs. |
| `glpi_get_ip_network` | Read | Read one GLPI `IPNetwork`. |
| `glpi_create_ip_network` | Write | Declare a LAN from a name, CIDR, entity and optional gateway. |
| `glpi_update_ip_network` | Write | Update a LAN and let GLPI recompute its implicit hierarchy. |

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
| `glpi_update_import_entity_rule` | Write | Partially update name, description, comment, ranking, recursion or match mode without modifying subtype, criteria, actions or activation. Reads before writing and verifies afterward. |
| `glpi_set_import_entity_rule_enabled` | Confirmed write | Enable or disable a verified rule; requires the exact confirmation value. The operation is reversible and idempotent, so it is not advertised as destructive. |

Subnet rules are always created inactive. Read the new rule back and verify its
CIDR, target entity, target location and ranking before calling the enable tool.
High-Level writes use the official `RuleController` routes and schemas
introduced in API 2.0. Hybrid continues to route both write tools explicitly to
Legacy; there is no implicit fallback between APIs.

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

Entity and location tools use a shared business contract across Legacy and
High-Level APIs. Entity LDAP and inventory fields map as follows:

| MCP field | GLPI Legacy field | GLPI High-Level v2.3 field | Meaning |
| --- | --- | --- | --- |
| `ldap_dn` | `ldap_dn` | `ldap_dn` | DN/base DN representing the entity, for example `OU=LA-SOUTERRAINE,OU=Sites,OU=BIOLYSS,DC=inovie,DC=infra`. It is not a search filter. |
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

## Planned but not active

The following are deliberately not presented as active tools:

- VLAN management and `IPNetwork`/VLAN relationships;
- High-Level API domains not marked implemented in the compatibility matrix;
- per-user OAuth authentication;
- generic destructive operations outside explicitly registered tools.
