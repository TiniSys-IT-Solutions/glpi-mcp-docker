# IP Addressing: operations and report annotations

Audited against the local sources of IP Addressing **3.2.11** and GLPI
**11.0.11**. These operations use GLPI Legacy REST exclusively; Hybrid routes
explicitly to Legacy. Pure High-Level returns a not-supported error.

## Capability inventory

| Native plugin operation | MCP coverage |
| --- | --- |
| List/read IPv4 ranges and their options | `glpi_addressing_list_ranges`, `glpi_addressing_get_range` |
| Create/update ranges from IPNetwork, options and range-level comments | `glpi_addressing_preview_ip_network_sync`, `glpi_addressing_apply_ip_network_sync` |
| Read report rows, per-IP comments and inventory associations | `glpi_addressing_get_report`; a paginated inventory view, without executing the native HTML report |
| Add/update/clear the comment in an IP report row | `glpi_addressing_set_ip_comment` |
| Reserve an IP for an existing equipment item | `glpi_addressing_preview_ip_reservation`, `glpi_addressing_reserve_ip` |
| Create an equipment item while reserving, as the native form can do | Create the equipment separately with the applicable asset tool; then reserve using its explicit id. Reservation never creates or overwrites an asset by name |
| Inspect/change native network relationships | Existing network topology tools: ports, NetworkName, IPAddress, VLAN and connections; see [tool catalogue](TOOLS.md) |
| Remove a reservation | Existing `glpi_preview_delete_network_object` / `glpi_delete_network_object` can remove its exact IPAddress; its port and NetworkName are preserved. Port purge stays blocked while relations remain. No automatic reservation cascade |
| Delete/restore ranges; manage filter objects or plugin configuration | No dedicated Addressing MCP tool in this release; use the native plugin UI |
| Run ping, manual scans, cron; export the native report; configure display switches | No dedicated MCP operation in this release. Reading, commenting and reserving never launch a probe, scan or scheduled task |

The report is an inventory view of the range's exact entity. It includes all
addresses in the stored begin/end bounds, independent of the native report's
visibility switches. Recursive child-entity expansion, ping results and HTML
report/export rendering are outside this view. `reserved_ip=false` can hide
reservations in the native UI; reservation previews warn when this is the case.

## Read the report and set a comment

```json
{"range_id":7,"start":0,"limit":50}
```

Call `glpi_addressing_get_report`. Each row returns its IPv4 address, comment,
comment id when present, visible allocations and one of `reserved`, `assigned`,
`multiple_assignments`, or `unassigned_in_visible_inventory`. The last value
means only that no assignment is visible in GLPI; it does not prove that an
address is free on the network.

Then call `glpi_addressing_set_ip_comment` with the row's current text:

```json
{"range_id":7,"ip":"192.0.2.10","comment":"Reserved for the future router","expected_comment":""}
```

To replace or clear the text, supply its current value as `expected_comment`
and the new text (or `""`) as `comment`. The precondition detects a change
observed before writing. Legacy REST supplies no atomic compare-and-swap or
unique constraint for these rows: simultaneous external writers can still
race. Duplicate rows fail closed instead of selecting an arbitrary comment.

The native report stores comments in `GlpiPlugin\\Addressing\\IpComment`, using
`plugin_addressing_addressings_id`, `ipname="IP<unsigned IPv4 integer>"` and
`comments`. These are distinct from a range's `comment` and the IPNetwork sync
marker. Clearing text preserves the comment row.

## Preview and apply a reservation

Call `glpi_addressing_preview_ip_reservation`:

```json
{"range_id":7,"ip":"192.0.2.10","asset_type":"Computer","asset_id":9}
```

Supported asset types are Computer, Monitor, NetworkEquipment, Peripheral,
Phone and Printer. The asset must exist, be active and belong to the range's
exact entity. Optional `mac` accepts colon-separated hexadecimal bytes;
optional `fqdn_id` overrides the range FQDN (zero means none).

Review the action, payload, visible allocations, warnings and
`preview_fingerprint`. Apply the same request using `glpi_addressing_reserve_ip`:

```json
{"range_id":7,"ip":"192.0.2.10","asset_type":"Computer","asset_id":9,"preview_fingerprint":"<64-hex fingerprint>","confirmation":"I_HAVE_VERIFIED_THE_ADDRESSING_RESERVATION"}
```

The fingerprint is recalculated immediately before writing. Existing visible
assignments, unresolved IP associations and conflicting reservation ports
block creation. A matching reservation produces `unchanged` and can be
applied as a no-op using its current preview. A changed preview must be reviewed
again. Checks cover REST-visible inventory; GLPI permissions can hide other
assignments, and Legacy REST does not provide an atomic IP allocation lock.

The native representation is a NetworkPort named `reserv-<IP>`, attached to
the selected asset. NetworkEquipment uses NetworkPortAggregate; the other
supported types use NetworkPortEthernet. GLPI creates NetworkName/IPAddress
children with `_create_children=1`, `NetworkName__ipaddresses` and
`NetworkName_fqdns_id`, following the source-audited ReserveIp payload.
This records an inventory reservation; it does not configure DHCP or DNS.

## Permissions, verification and limits

The selected range is read through the normal Addressing REST resource before
every operation. GLPI remains responsible for its plugin rights and native
object/NetworkPort write permissions. IpComment has no entity column of its
own, so MCP checks its parent range and filters every returned comment by the
parent id. Reservation payloads bind the port to the asset/range entity.

Report writes require REST confirmation that Addressing 3.2.11 is active.
An unavailable resource, unsupported schema/version or incomplete bounded
inventory scan is an error; there is no AJAX bypass or High-Level fallback.

Reads use pages of 1,000, with a safety cap of 100,000 rows per resource.
NetworkName and NetworkPort are joined from bounded paginated reads rather
than making per-IP REST calls. Reports return at most 1,000 addresses per call;
ranges larger than the plugin's 65,536-address bound are rejected.

Writes are reread and verified. Failed or unavailable readback returns
`write_completed=true`, the created object id and a non-success verification
status. Native reservation children can be partially created: the existing
port is preserved for review, and a subsequent preview blocks another port
with the same reservation name. Nothing is silently purged or rolled back.

Validation for this release uses mocked REST tests. No live GLPI write smoke
test has been run; native REST acceptance and rendering in the deployed
instance remain to be checked with explicit authorization for test writes.
