# IP Addressing: operations and report annotations

Source review covers Addressing **3.2.11**, the official **3.2.14** tag and GLPI
**11.0.11**. Reports/comments accept stable Addressing **>=3.2.0**, conditional
on compatible resource schemas and GLPI permissions. Hybrid routes explicitly
to the Legacy adapter. Reports/comments use the explicitly configured REST or
native web transport; range and reservation operations still use Legacy REST.
Pure High-Level returns a not-supported error.

## Native web transport (GLPI 11)

For Addressing versions whose report resources deny generic REST, configure
the existing Docker service with:

```env
GLPI_ADDRESSING_REPORT_TRANSPORT=companion_api
```

Recreate the container after changing its environment. The default remains
`legacy_rest`; there is no automatic fallback after an error. This setting
affects `glpi_addressing_get_report` and `glpi_addressing_set_ip_comment` only.
It calls the OAuth-authenticated GLPI v2 routes exposed by `genbiocustom`.
There is no automatic fallback to generic REST or HTML parsing.

The native transport logs in through GLPI's CSRF-protected `front/login.php`
using the already configured `GLPI_USER_TOKEN`, or `GLPI_USERNAME` and
`GLPI_PASSWORD` when no user token is set. Personal-token login must be enabled
in GLPI. Interactive MFA/SSO cannot be completed by this transport and fails
with a clear error. No passwords, cookies or tokens are stored on disk or
returned by the tools. Sessions are isolated per operation and cookies stay
in memory. This is a new native web login, not conversion of a REST session.

MCP verifies that the web session's own preference form identifies the same
user as the REST session; a different SSO identity is rejected. GLPI validates
selection of the REST session's current profile and the range's
entity in the isolated web session. MCP additionally checks READ for reports
and UPDATE for comments; native GLPI enforces its own rights and entity scope.
The report is read through `ajax/common.tabs.php`, using Addressing's Report
tab and no export/filter. No scripts, ping URLs or reservation URLs are executed.
The report's own comment URL must match the configured GLPI installation's
`plugins/addressing/ajax/ipcomment.php` or `marketplace/addressing/ajax/ipcomment.php`.
Redirects outside that installation are refused before sending credentials.

Parsing uses the Addressing 3.2.14 report markup reviewed with GLPI 11.0.11;
later admitted versions must provide the same compatible markup. Missing rows,
missing comment values and contradictory rows fail closed. Range display
settings may hide rows: enable their display in GLPI before using this mode;
MCP never changes those settings or treats a hidden comment as empty.
Ping timestamps use GLPI's display format and may be stale. Native pages are
joined to the same REST-visible inventory used by the REST report adapter.
Native equipment rows also prevent classifying an IP as a ping-only reply.

Writes send only `addressing_id`, `ipname` and `contentC`, with the native cookie,
`X-Glpi-Csrf-Token` and `X-Requested-With` headers. The tool compares the read
text with `expected_comment`, serializes writes to one IP inside this MCP
service and rereads the saved line. GLPI's handler has no atomic comparison:
an external writer or another MCP process can still race between read and write.
It exposes no storage object ID, so `comment_id` is omitted in this mode.
An uncertain POST returns `success=false`, `write_completed=null` and requires
reading the current value before retrying. Acknowledged writes with failed
readback return `write_completed=true` without claiming success. No POST is
automatically replayed. No GLPI core/plugin, database or Docker architecture
changes are required.

## Native API access and the 3.2.14 denial

The official Addressing **3.2.14** source blocks report resources even when
`plugin_addressing=31` in the Super-Admin profile. Its `IpComment` and
`PingInfo` classes return `false` from `canView`, `canCreate`, `canUpdate`,
`canDelete` and `canPurge`. GLPI checks `canView()` before listing even a nested
resource. Super-Admin does not override this deliberate class-level restriction.
The tables lack `entities_id`, which explains why the plugin blocks generic
access to their rows across range entities.

The native AJAX comment handler instead checks plugin UPDATE and the selected
parent range before using the comment object. This is a browser/CSRF route,
not an API-token route. Legacy session initialization removes the browser
`valid_id`; MCP does not convert REST sessions to cookies or relax permissions.
The separately configured native web transport authenticates through GLPI and
reads the authorized report markup rather than these generic REST resources.

Changing an exact version pin cannot lift this denial. The MCP now reports the
active version and failing resource, and refuses to guess that unreadable
comments are empty. REST reports and comments remain blocked on stock 3.2.14;
the native web transport uses its authorized browser routes. No extra GLPI plugin,
PHP runtime, database change or change to the Docker architecture is included.

The minimum version admits later stable versions only when the same resources
and schemas are actually available; it does not claim that every admitted
release was individually source-audited. Reservations retain their separate
3.2.11 payload audit.

Sources: [3.2.14 IpComment](https://github.com/pluginsGLPI/addressing/blob/3.2.14/src/IpComment.php),
[PingInfo](https://github.com/pluginsGLPI/addressing/blob/3.2.14/src/PingInfo.php),
[native comment handler](https://github.com/pluginsGLPI/addressing/blob/3.2.14/ajax/ipcomment.php).

## Capability inventory

| Native plugin operation | MCP coverage |
| --- | --- |
| List/read IPv4 ranges and their options | `glpi_addressing_list_ranges`, `glpi_addressing_get_range` |
| Create/update ranges from IPNetwork, options and range-level comments | `glpi_addressing_preview_ip_network_sync`, `glpi_addressing_apply_ip_network_sync` |
| Read report rows, per-IP comments, stored ping results and inventory associations | `glpi_addressing_get_report`; paginated REST resources or the explicitly configured native report tab |
| Add/update/clear the comment in an IP report row | `glpi_addressing_set_ip_comment` |
| Reserve an IP for an existing equipment item | `glpi_addressing_preview_ip_reservation`, `glpi_addressing_reserve_ip` |
| Create an equipment item while reserving, as the native form can do | Create the equipment separately with the applicable asset tool; then reserve using its explicit id. Reservation never creates or overwrites an asset by name |
| Inspect/change native network relationships | Existing network topology tools: ports, NetworkName, IPAddress, VLAN and connections; see [tool catalogue](TOOLS.md) |
| Remove a reservation | Existing `glpi_preview_delete_network_object` / `glpi_delete_network_object` can remove its exact IPAddress; its port and NetworkName are preserved. Port purge stays blocked while relations remain. No automatic reservation cascade |
| Delete/restore ranges; manage filter objects or plugin configuration | No dedicated Addressing MCP tool in this release; use the native plugin UI |
| Run ping, manual scans, cron; export the native report; configure display switches | No dedicated MCP operation in this release. Reading, commenting and reserving never launch a probe, scan or scheduled task |

The report is an inventory view of the range's exact entity. It includes all
addresses in the stored begin/end bounds, independent of the native report's
visibility switches. Recursive child-entity expansion and HTML
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
address is free on the network. Each row also includes `ping_state` (`ok`, `ko`,
`unknown`), the stored `ping_date`, `has_unmanaged_equipment` and
`selection_reason`:

- `ping_without_linked_equipment`: a recorded successful ping and no visible
  IP allocation, including unresolved allocations. Absence of equipment remains
  limited to API visibility.
- `unmanaged_equipment`: a visible allocation attached to an `Unmanaged` item.
- `null`: neither condition; exclude the row from this annotation workflow.

Missing, malformed or contradictory simultaneous ping results remain unknown.
Dates let callers assess whether stored observations are recent enough. Reads
never launch a ping. A denied PingInfo resource prevents report completion;
comment writes do not depend on ping access.

When native resources are authorized, read all ranges by paging
`glpi_addressing_list_ranges`, then each report from `start=0`, `limit=1000`
until the window reaches `total`. Pagination counts IP addresses rather than
selected candidates. Keep only the two selection reasons above, and use each
row's current `comment` as `expected_comment` before annotating it.

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
every operation. GLPI remains responsible for native object/NetworkPort write permissions.
Comment writes also require plugin UPDATE in the active profile, matching the
native comment handler even when a first comment row is created. IpComment has no entity column of its
own, so MCP checks its parent range and filters every returned comment by the
parent id. Reservation payloads bind the port to the asset/range entity.

Reports/comments require REST confirmation of an active stable Addressing
version >=3.2.0 and compatible, authorized native resources. A 403 remains an
error with version/resource diagnostics. Reservation writes retain the separate
source-audited 3.2.11 requirement.
An unavailable resource, unsupported schema/version or incomplete bounded
inventory scan is an error. Native web access must be explicitly selected;
neither transport falls back to another route or to High-Level after an error.

Reads use pages of 1,000, with a safety cap of 100,000 rows per resource.
NetworkName and NetworkPort are joined from bounded paginated reads rather
than making per-IP REST calls. Reports return at most 1,000 addresses per call;
ranges larger than the plugin's 65,536-address bound are rejected.

Writes are reread and verified. Failed or unavailable readback returns
`write_completed=true`, the created object id when available and a non-success verification
status. Native reservation children can be partially created: the existing
port is preserved for review, and a subsequent preview blocks another port
with the same reservation name. Nothing is silently purged or rolled back.

Validation uses unit and mocked authenticated HTTP regressions, covering
version checks, active profile UPDATE, 403 denials, stored ping selection,
expected text, duplicate rejection and post-write verification. Native report
and comment operations require readable resources through the authorized API.
When the plugin denies access, MCP reports the restriction and does not write.
