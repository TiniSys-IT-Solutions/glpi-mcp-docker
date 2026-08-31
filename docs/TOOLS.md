# Active MCP tools

This catalogue lists the 128 tools currently registered by `src/index.ts` in
release `0.2.5`. Unless stated otherwise, they are active through the Legacy
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
| `glpi_list_entities` | Read | List entities. |
| `glpi_get_entity` | Read | Read an entity. |
| `glpi_list_locations` | Read | List locations. |
| `glpi_get_location` | Read | Read a location. |
| `glpi_create_location` | Write | Create a location. |

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
| `glpi_inventory_list_credentials` / `glpi_inventory_get_credential` | Read | Read credential metadata with all secrets stripped recursively. |
| `glpi_inventory_create_credential` / `glpi_inventory_update_credential` | Write | Create or rotate write-only remote-device credentials. |
| `glpi_inventory_list_tasks` / `glpi_inventory_get_task` | Read | Read task definitions and planning metadata. |
| `glpi_inventory_create_task` / `glpi_inventory_update_task` | Write | Create or update a task definition without executing it. |
| `glpi_inventory_enable_task` / `glpi_inventory_disable_task` | Write | Toggle task activation. |
| `glpi_inventory_list_task_jobs` / `glpi_inventory_get_task_job` | Read | Read jobs belonging to inventory tasks. |
| `glpi_inventory_list_task_job_states` / `glpi_inventory_get_task_job_state` | Read | Read execution/supervision states. |
| `glpi_inventory_list_timeslots` / `glpi_inventory_get_timeslot` | Read | Read execution time slots. |
| `glpi_inventory_list_collects` / `glpi_inventory_get_collect` | Read | Read collection definitions. |
| `glpi_inventory_list_collect_files` / `glpi_inventory_get_collect_file` | Read | Read file collection definitions. |
| `glpi_inventory_list_collect_registries` / `glpi_inventory_get_collect_registry` | Read | Read registry collection definitions. |
| `glpi_inventory_list_collect_wmi_queries` / `glpi_inventory_get_collect_wmi_query` | Read | Read WMI collection definitions. |
| `glpi_inventory_list_deploy_packages` / `glpi_inventory_get_deploy_package` | Read | Read deployment-package metadata without executing it. |
| `glpi_inventory_list_deploy_groups` / `glpi_inventory_get_deploy_group` | Read | Read deployment target-group metadata. |

## Planned but not active

The following are deliberately not presented as active tools:

- VLAN management and `IPNetwork`/VLAN relationships;
- High-Level API domains other than session and entity-assignment rule reads;
- per-user OAuth authentication;
- generic destructive operations outside explicitly registered tools.
