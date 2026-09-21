# IP networks (LANs)

## GLPI model

GLPI stores a declared LAN as an `IPNetwork` item. The Legacy REST API uses
the regular item endpoints:

```text
GET  /apirest.php/IPNetwork
GET  /apirest.php/IPNetwork/{id}
POST /apirest.php/IPNetwork
PUT  /apirest.php/IPNetwork/{id}
```

The write payload uses these GLPI fields:

| MCP field | GLPI field | Purpose |
| --- | --- | --- |
| `name` | `name` | Human-readable LAN name |
| `cidr` | `network` | IPv4 or IPv6 network in CIDR notation |
| `gateway` | `gateway` | Gateway inside the network |
| `entity_id` | `entities_id` | Owning entity |
| `is_recursive` | `is_recursive` | Visibility in child entities |
| `addressable` | `addressable` | Whether addresses may be associated with the network |
| `comment` | `comment` | Operational notes |

GLPI derives `version`, `address`, `netmask`, `ipnetworks_id`, `level`, and
`completename`. The parent/child hierarchy must not be assigned manually: GLPI
recomputes it from the address, mask, and entity.

## MCP tools

- `glpi_list_ip_networks`
- `glpi_get_ip_network`
- `glpi_create_ip_network`
- `glpi_update_ip_network`

Updates are partial, idempotent writes and are not marked destructive. Omitting
a field preserves it, so a name-only correction does not alter the CIDR,
gateway, entity or hierarchy fields. Deletion is not exposed by this tool.

The create and update tools validate IPv4 and IPv6 CIDR syntax before calling
GLPI. GLPI remains responsible for duplicate detection, gateway-in-network
validation, canonical network-address calculation, hierarchy, and ACLs.

Updating an `IPNetwork` does not itself execute a discovery scan. After
`glpi_update_ip_network`, call `glpi_inventory_requeue_task` with the related
Inventory task id and confirmation `I_HAVE_VERIFIED_THE_TASK`. The MCP cycles
the task, enables `reprepare_if_successful`, and leaves the official GLPI
scheduler to prepare the next execution. It does not emulate the web-only
`Force start` action or claim that an agent has already begun scanning.

## SNMP credentials on Inventory ranges

An Inventory plugin range (`PluginGlpiinventoryIPRange`) does not store SNMP
credential ids directly. The MCP manages the dedicated
`PluginGlpiinventoryIPRange_SNMPCredential` relation through five list, get,
attach, rank-update and detach tools documented in [TOOLS.md](TOOLS.md).

Attach accepts an existing range id and native GLPI `SNMPCredential` id. It
checks both objects and prevents duplicate pairs before creating the relation.
Detach requires `I_HAVE_VERIFIED_THE_ASSOCIATION` and removes only the relation,
not the range or credential. These operations currently use Legacy in both
Legacy and Hybrid modes; High-Level remains unavailable until its official
plugin route is documented.

## VLAN follow-up

VLAN linkage is intentionally outside this first slice. The next slice should
first confirm the target instance's `VLAN` and `NetworkPort_Vlan` REST shapes,
then expose business operations without mixing VLAN membership into IPNetwork
creation.

## Primary references

## Synchronizing IPNetwork to IP Addressing

`IPNetwork` is the native source definition. Addressing ranges live separately
in `glpi_plugin_addressing_addressings`; their `networks_id` refers to generic
GLPI `Network`, not `IPNetwork`. There is no native relation, so the MCP preserves
human comments and appends `[mcp-ipnetwork-sync:v1 ipnetwork_id=<ID>]`.

Matching uses that marker first, then a unique exact entity plus canonical-range
match. Unmarked matches require `adopt_exact_matches: true`; names alone never
identify a target. `/0`–`/30` usable-host mode excludes network/broadcast,
`/31` retains both addresses, `/32` retains one, and `full_cidr` retains all.
Arithmetic uses `bigint`. More than 65,536 CIDR addresses is skipped without
splitting. IPv6 is skipped as `plugin_ipv4_only`.

Run `glpi_addressing_preview_ip_network_sync`, review every action/proof/warning,
then call `glpi_addressing_apply_ip_network_sync` with identical options, explicit
ids, its 64-hex fingerprint, and `I_HAVE_VERIFIED_THE_ADDRESSING_SYNC`. Apply
re-reads both sides and rejects stale state. It never deletes, revives trashed
ranges, creates Network/VLAN/FQDN records, or starts ping/cron. `use_ping` defaults
to false; existing options remain unchanged unless explicitly supplied.

Overrides and exact-range relationships are supported now. The pure dominant
evidence policy requires at least two devices and a unique 80% majority. Runtime
collection from equipment ports, site rules, names, VLANs and FQDN suffixes is
deliberately pending validation of the target instance's REST-visible model.

For Addressing 3.2.11, `rawSearchOptions()` exposes only the searchable subset
(`id`, `name`, `comment`, `use_ping`, `begin_ip`, `end_ip` and relationship
dropdowns). The MCP detects that exact signature. Before applying a write it
also requires a readable REST row containing every persisted range field. On
an empty installation, the first creation is allowed only when GLPI's `Plugin`
REST resource confirms the source-audited Addressing version `3.2.11`.

Preview example:

```json
{"ip_network_ids":[42],"range_policy":"usable_hosts","overrides_by_ip_network_id":{"42":{"location_id":8,"vlan_id":12}},"defaults":{"use_ping":false}}
```

Apply repeats that payload and adds:

```json
{"preview_fingerprint":"<64-hex fingerprint>","confirmation":"I_HAVE_VERIFIED_THE_ADDRESSING_SYNC","allow_create":true,"allow_update":true}
```

- [GLPI user documentation: Internet dropdowns](https://help.glpi-project.org/documentation/modules/configuration/dropdowns/internet)
- [GLPI 10 `IPNetwork` implementation](https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/IPNetwork.php)
