import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSyncMarker, buildAddressingPlan, ipv4CidrRange, selectDominantEvidence } from '../src/core/addressing-sync/service.js';
import { addressingApplySchema } from '../src/core/addressing-sync/schemas.js';
import { LegacyAddressingSyncService, ADDRESSING_ITEMTYPE_CANDIDATES } from '../src/api/legacy/addressing-sync.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

const source = (network: string, extra = {}) => ({ id: 7, name: 'LAN A', network, entities_id: 2, addressable: 1, ...extra });
const request = { ip_network_ids: [7], only_addressable: true };

test('IPv4 range calculation canonicalizes /24 and applies usable host policy', () => {
  assert.deepEqual(ipv4CidrRange('192.0.2.123/24'), { canonical_cidr: '192.0.2.0/24', begin_ip: '192.0.2.1', end_ip: '192.0.2.254', address_count: 254n, cidr_address_count: 256n });
});

test('IPv4 range calculation handles /30, /31 and /32 exactly', () => {
  assert.deepEqual(ipv4CidrRange('10.0.0.2/30'), { canonical_cidr: '10.0.0.0/30', begin_ip: '10.0.0.1', end_ip: '10.0.0.2', address_count: 2n, cidr_address_count: 4n });
  assert.equal(ipv4CidrRange('10.0.0.0/31').begin_ip, '10.0.0.0');
  assert.equal(ipv4CidrRange('10.0.0.0/31').end_ip, '10.0.0.1');
  assert.equal(ipv4CidrRange('10.0.0.9/32').begin_ip, '10.0.0.9');
});

test('full_cidr retains network and broadcast', () => {
  const range = ipv4CidrRange('192.0.2.12/24', 'full_cidr');
  assert.equal(range.begin_ip, '192.0.2.0'); assert.equal(range.end_ip, '192.0.2.255');
});

test('planner skips IPv6 and ranges larger than 65536 addresses', () => {
  const ipv6 = buildAddressingPlan({ itemtype: 'x', sources: [source('2001:db8::/64')], ranges: [], request });
  assert.equal(ipv6.items[0].reason, 'plugin_ipv4_only');
  const tooLarge = buildAddressingPlan({ itemtype: 'x', sources: [source('10.0.0.0/15')], ranges: [], request });
  assert.equal(tooLarge.items[0].reason, 'range_exceeds_plugin_limit_65536');
});

test('planner creates absent range with safe defaults and marker', () => {
  const plan = buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [], request });
  assert.equal(plan.items[0].action, 'create');
  assert.equal(plan.items[0].proposed_values?.use_ping, false);
  assert.match(String(plan.items[0].proposed_values?.comment), /ipnetwork_id=7/);
});

test('marker identifies an existing range and makes a second plan unchanged', () => {
  const first = buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [], request });
  const proposed = first.items[0].proposed_values!;
  const range = { id: 10, ...(proposed as any) };
  const second = buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [range], request });
  assert.equal(second.items[0].action, 'unchanged');
});

test('exact unmarked matches require explicit adoption and duplicates conflict', () => {
  const exact = { id: 1, entities_id: 2, name: 'LAN A', begin_ip: '192.0.2.1', end_ip: '192.0.2.254', comment: '' };
  assert.equal(buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [exact], request }).items[0].reason, 'exact_unmarked_match_requires_adoption');
  assert.equal(buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [exact, { ...exact, id: 2 }], request: { ...request, adopt_exact_matches: true } }).items[0].reason, 'multiple_matching_ranges');
});

test('human comments are preserved while markers are replaced idempotently', () => {
  assert.equal(appendSyncMarker('Human note', 7), 'Human note\n[mcp-ipnetwork-sync:v1 ipnetwork_id=7]');
  assert.equal(appendSyncMarker('Human note\n[mcp-ipnetwork-sync:v1 ipnetwork_id=7]', 7), 'Human note\n[mcp-ipnetwork-sync:v1 ipnetwork_id=7]');
});

test('partial updates preserve existing plugin options', () => {
  const range = { id: 1, entities_id: 2, name: 'LAN A', begin_ip: '192.0.2.1', end_ip: '192.0.2.254', comment: '[mcp-ipnetwork-sync:v1 ipnetwork_id=7]', use_ping: 1, free_ip: 0 };
  const item = buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [range], request }).items[0];
  assert.equal(item.proposed_values?.use_ping, true); assert.equal(item.proposed_values?.free_ip, false);
});

test('dominant evidence requires a unique 80 percent winner with at least two devices', () => {
  assert.equal(selectDominantEvidence([{ id: 1, count: 1 }]), undefined);
  assert.equal(selectDominantEvidence([{ id: 1, count: 4 }, { id: 2, count: 1 }])?.id, 1);
  assert.equal(selectDominantEvidence([{ id: 1, count: 2 }, { id: 2, count: 2 }]), undefined);
  assert.equal(selectDominantEvidence([], 2, 0.8), undefined);
});

test('overrides provide explicit location, network, VLAN and FQDN evidence', () => {
  const item = buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [], request: { ...request, overrides_by_ip_network_id: { '7': { location_id: 4, network_id: 5, vlan_id: 6, fqdn_id: 8 } } } }).items[0];
  assert.equal(item.location?.id, 4); assert.equal(item.network?.id, 5); assert.equal(item.vlan?.id, 6); assert.equal(item.fqdn?.id, 8);
});

test('deleted exact targets conflict and stale confirmation input is rejected', () => {
  const range = { id: 1, entities_id: 2, name: 'LAN A', begin_ip: '192.0.2.1', end_ip: '192.0.2.254', is_deleted: 1 };
  assert.equal(buildAddressingPlan({ itemtype: 'x', sources: [source('192.0.2.0/24')], ranges: [range], request: { ...request, adopt_exact_matches: true } }).items[0].reason, 'matching_range_is_deleted');
  assert.throws(() => addressingApplySchema.parse({ ip_network_ids: [7], preview_fingerprint: 'a'.repeat(64), confirmation: 'NO' }));
});

test('Addressing itemtype detection rejects an absent plugin and incomplete REST schema', async () => {
  const client = { searchOptions: { get: async (itemtype: string) => {
    if (itemtype === ADDRESSING_ITEMTYPE_CANDIDATES[0]) throw new Error('unknown itemtype');
    return { byField: new Map([['id', {}]]) };
  } } } as any;
  await assert.rejects(() => new LegacyAddressingSyncService(client).list({}), /absent, disabled, inaccessible, or REST schema unsupported/);
});

test('Addressing 3.2.11 itemtype detection accepts its real search-option subset', async () => {
  const ownTable = 'glpi_plugin_addressing_addressings';
  const options = [
    ['id', ownTable], ['name', ownTable], ['comment', ownTable], ['use_ping', ownTable],
    ['begin_ip', ownTable], ['end_ip', ownTable], ['name', 'glpi_networks'],
    ['name', 'glpi_locations'], ['name', 'glpi_fqdns'], ['name', 'glpi_vlans'],
    ['completename', 'glpi_entities'],
  ].map(([field, table], id) => [id, { field, table }]);
  const client = {
    searchOptions: { get: async () => ({
      byField: new Map(options.map(([, option]) => [option.field, option])),
      byId: new Map(options),
    }) },
    getItems: async () => [],
  } as any;
  const result = await new LegacyAddressingSyncService(client).list({});
  assert.equal(result.itemtype, 'GlpiPlugin\\Addressing\\Addressing');
  assert.deepEqual(result.ranges, []);
});

test('Addressing tool annotations distinguish preview from guarded idempotent apply', () => {
  assert.deepEqual(toolAnnotations('glpi_addressing_preview_ip_network_sync'), { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual(toolAnnotations('glpi_addressing_apply_ip_network_sync'), { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
});
