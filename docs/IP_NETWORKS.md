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

The create and update tools validate IPv4 and IPv6 CIDR syntax before calling
GLPI. GLPI remains responsible for duplicate detection, gateway-in-network
validation, canonical network-address calculation, hierarchy, and ACLs.

## VLAN follow-up

VLAN linkage is intentionally outside this first slice. The next slice should
first confirm the target instance's `VLAN` and `NetworkPort_Vlan` REST shapes,
then expose business operations without mixing VLAN membership into IPNetwork
creation.

## Primary references

- [GLPI user documentation: Internet dropdowns](https://help.glpi-project.org/documentation/modules/configuration/dropdowns/internet)
- [GLPI 10 `IPNetwork` implementation](https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/IPNetwork.php)
