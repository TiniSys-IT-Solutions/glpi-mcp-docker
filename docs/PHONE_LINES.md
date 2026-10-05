# Phone lines (`front/line.php`)

The domain is audited against GLPI **11.0.11**: `Line`, `Item_Line`,
`Item_DeviceSimcard`, `LineType`, `LineOperator`, the native line Twig form,
AssignableItem, and the High-Level Management/Dropdown controller schemas.

## Tools

| Tool | Operation |
| --- | --- |
| `glpi_list_phone_lines` | Filter active lines by exact caller number, entity, operator, type, status, location or assignee, or search name/number/caller/comment text. Supports pagination and an explicit deleted-row option. |
| `glpi_get_phone_line_overview` | Read the line, direct equipment/SIM associations, contract/document links, financial information, notes and history. Inaccessible supplementary sections are marked unavailable and `complete=false`. |
| `glpi_create_phone_line` | Create using typed business fields and validate references. |
| `glpi_update_phone_line` | Partially update native fields and user/technician/group assignments. |
| `glpi_append_phone_line_comment` | Append text while checking `expected_comment`; retrying the same completed append does not duplicate it. |
| `glpi_list_phone_line_items` | List direct equipment links and installed SIMs separately. |
| `glpi_list_item_phone_lines` | Find equipment lines through direct links and installed SIMs. |
| `glpi_attach_phone_line_to_item` | Add an idempotent `Item_Line` association within the line's entity scope. |
| `glpi_preview_detach_phone_line_from_item` | Fingerprint an exact direct association before removing it. |
| `glpi_detach_phone_line_from_item` | Remove that direct association after confirmation; preserve the line, equipment and SIMs. |
| `glpi_preview_set_simcard_phone_line` | Preview setting/replacing/clearing the line of an installed SIM. |
| `glpi_set_simcard_phone_line` | Apply the exact preview; `line_id=0` clears only the SIM's line reference. |
| `glpi_audit_phone_lines` | Find missing numbers/operators, absent equipment links, potential same-entity duplicate numbers and line links whose target is not visible or active; flag nonrecursive SIM/line entity mismatches. |
| `glpi_phone_lines_stats` | Count active visible lines by entity, operator, type, state and location. |

Caller numbers remain strings; internal extensions, leading zeros and dial-plan
punctuation are preserved. Audit duplicate detection ignores whitespace only.
It does not infer that every shared number is an error or rewrite numbers.

## Friendly fields

| MCP | Legacy native field |
| --- | --- |
| `caller_number` | `caller_num` |
| `caller_name`, `name`, `comment`, `is_recursive` | same name |
| `entity_id`, `location_id`, `state_id` | `entities_id`, `locations_id`, `states_id` |
| `type_id`, `operator_id` | `linetypes_id`, `lineoperators_id` |
| `assigned_user_id`, `assigned_technician_id` | `users_id`, `users_id_tech` |
| `group_ids`, `technician_group_ids` | `groups_id`, `groups_id_tech` (arrays handled by AssignableItem) |

Creation requires `name` and explicit `entity_id`. Zero reference ids clear
optional assignments. An entity change is blocked while direct/SIM associations
remain; persisted dropdowns and group assignments are revalidated for the new
entity. This operation is not a bulk entity migration or a restoration tool.

## Examples

Search using `glpi_list_phone_lines`:

```json
{"entity_id":2,"operator_id":1,"text_search":"office","start":0,"limit":50}
```

Create using `glpi_create_phone_line`:

```json
{"name":"Office extension","entity_id":2,"caller_number":"0012","caller_name":"Reception","type_id":1,"operator_id":1,"location_id":3,"assigned_user_id":8}
```

Attach existing equipment using `glpi_attach_phone_line_to_item`:

```json
{"line_id":7,"itemtype":"Phone","item_id":9}
```

Supported equipment types follow the native `line_types` list: Computer,
Peripheral, Phone, NetworkEquipment and Printer. A recursive line can link to
an equipment item in a confirmed descendant entity; an unrelated entity is
rejected, even if the account can read both entities. GLPI remains responsible
for item/line rights and native association write permissions.

For a direct-link removal, preview `{"relation_id":123}`. Apply the resulting
fingerprint with `confirmation="I_HAVE_VERIFIED_THE_PHONE_LINE_DETACH"`.
Removing an Item_Line link does not remove a SIM's `lines_id` association.

For an installed SIM, call `glpi_preview_set_simcard_phone_line`:

```json
{"simcard_relation_id":4,"line_id":7}
```

Here `simcard_relation_id` identifies **Item_DeviceSimcard**, the installed SIM
relation; it is not the DeviceSimcard definition id. Apply:

```json
{"simcard_relation_id":4,"line_id":7,"preview_fingerprint":"<64-hex fingerprint>","confirmation":"I_HAVE_VERIFIED_THE_SIMCARD_PHONE_LINE"}
```

The old/target lines, equipment owner and SIM relation are fingerprinted again
before writing. Changing the owner or line invalidates the preview. The update
writes only `lines_id`; it preserves the installed SIM and its secrets.
SIM output uses an explicit field projection that excludes PIN/PIN2/PUK/PUK2
and unrecognized plugin fields.

## Existing tools extended

- Catalogue domain `dropdown` now allows **LineType** and **LineOperator**.
  Types expose name/comment; operators also expose MCC/MNC, entity and
  recursion. Native GLPI enforces MCC/MNC uniqueness. Deletion through the
  generic catalogue is blocked: these dropdowns have no soft-delete column and
  a complete reference scan has not been proven.
- Existing asset relation tools accept **Line** for **contract** and
  **document** links. Other relation kinds are rejected for a phone line.
- Existing item metadata tools accept **Line** for **financial_info** and
  **note**. History and the existing generic management catalogue already
  support Line. Native line deletion remains the existing fingerprinted
  catalogue soft-delete workflow; permanent purge remains blocked.

Examples for generic tools:

```json
{"domain":"dropdown","itemtype":"LineOperator"}
```

```json
{"kind":"financial_info","itemtype":"Line","item_id":7}
```

## API compatibility

Legacy implements all 14 domain tools. Hybrid routes them explicitly to Legacy,
without trying High-Level first or retrying another backend after an error.

With API 2.3, pure High-Level implements filtered listing, typed creation/update, comment
append and statistics using confirmed `/Management/Line` routes. It normalizes
nested dropdown ids to the internal line model and writes dropdown references
as `{ "id": number }`. Other API versions are rejected before any request; caller number/name fields are confirmed in API 2.3.

The composite overview, equipment/SIM associations and association audit return
explicit not-supported errors in pure High-Level. Line recursion/group writes,
operator reference validation, entity moves, and deleted-row listing are also
blocked there until their complete route/schema behavior is implemented.

LineType is exposed by `/Dropdowns/LineType` in API 2.3. LineOperator has a schema
but is absent from the source-audited dropdown endpoint allowlist: the generic
High-Level catalogue returns a clear not-supported error instead of guessing a
route. Line financial information is likewise absent from the audited
`Assets/.../Infocom` endpoint allowlist and is explicitly blocked; native
`Line/{id}/Note` routes are confirmed.

## Limits and verification

Reads are limited to visible REST data, using pages of 1,000 and a cap of 50,000
rows per resource. Hitting the cap refuses an incomplete result. A line whose
id is not returned is described as not visible or deleted, rather than being
asserted to be an orphan. Overview sections require the corresponding GLPI
rights and can be unavailable independently.

Writes report `write_completed` and a separate verification result; failed
readback does not imply rollback. Avoid blindly retrying a creation after a
successful write with unavailable verification. Preview checks and comment
preconditions are optimistic; Legacy REST supplies no atomic lock across a
read/write pair. Native Item_Line has a unique line/type/item index.

Validation uses mocked Legacy and High-Level APIs plus compilation and Docker
checks. No write smoke test has been performed on a live GLPI instance.
