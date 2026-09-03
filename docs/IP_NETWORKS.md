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

- [GLPI user documentation: Internet dropdowns](https://help.glpi-project.org/documentation/modules/configuration/dropdowns/internet)
- [GLPI 10 `IPNetwork` implementation](https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/IPNetwork.php)
