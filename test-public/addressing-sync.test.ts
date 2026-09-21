import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSyncMarker, buildAddressingPlan, ipv4CidrRange, selectDominantEvidence } from '../src/core/addressing-sync/service.js';
import { addressingApplySchema, addressingPreviewSchema } from '../src/core/addressing-sync/schemas.js';
import { LegacyAddressingSyncService, ADDRESSING_ITEMTYPE_CANDIDATES, normalizeLegacyIPNetwork } from '../src/api/legacy/addressing-sync.js';
import { toolAnnotations } from '../src/core/tool-annotations.js';

const source = (cidr: string, extra = {}) => ({ id: 7, name: 'LAN A', cidr, entities_id: 2, addressable: 1, ...extra });
const request = { ip_network_ids: [7], only_addressable: true };

function addressingCatalogue() {
  const ownTable = 'glpi_plugin_addressing_addressings';
  const options = [
    ['id', ownTable], ['name', ownTable], ['comment', ownTable], ['use_ping', ownTable],
    ['begin_ip', ownTable], ['end_ip', ownTable], ['name', 'glpi_networks'],
    ['name', 'glpi_locations'], ['name', 'glpi_fqdns'], ['name', 'glpi_vlans'],
    ['completename', 'glpi_entities'],
  ].map(([field, table], id) => [id, { field, table }]);
  return { byField: new Map(options.map(([, option]) => [option.field, option])), byId: new Map(options) };
}

const salins = {
  id: 42, name: 'GB - SALINS : 10.1.107.0/24', completename: 'GB - SALINS : 10.1.107.0/24',
  entities_id: 4, address: '10.1.107.0', netmask: '255.255.255.0', gateway: '10.1.107.254',
  addressable: 1, is_recursive: 1, comment: 'Réseau LAN GENBIO',
};

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
  const client = {
    searchOptions: { get: async () => addressingCatalogue() },
    getItems: async () => [],
  } as any;
  const result = await new LegacyAddressingSyncService(client).list({});
  assert.equal(result.itemtype, 'GlpiPlugin\\Addressing\\Addressing');
  assert.deepEqual(result.ranges, []);
});

test('Legacy IPNetwork normalization derives canonical CIDRs for /24, /30, /31 and /32 masks', () => {
  for (const [netmask, expected] of [
    ['255.255.255.0', '10.1.107.0/24'], ['255.255.255.252', '10.1.107.0/30'],
    ['255.255.255.254', '10.1.107.0/31'], ['255.255.255.255', '10.1.107.1/32'],
  ]) {
    assert.equal(normalizeLegacyIPNetwork({ ...salins, address: expected.split('/')[0], netmask }).cidr, expected);
  }
  assert.equal(normalizeLegacyIPNetwork({ ...salins, network: '10.1.107.0 / 255.255.255.0' }).cidr, '10.1.107.0/24');
});

test('Legacy IPNetwork normalization rejects invalid, missing and ambiguous IPv4 data', () => {
  assert.equal(normalizeLegacyIPNetwork({ ...salins, netmask: '255.0.255.0' }).normalization_error, 'invalid_ipv4_netmask');
  assert.equal(normalizeLegacyIPNetwork({ ...salins, address: undefined }).normalization_error, 'missing_address_or_netmask');
  assert.equal(normalizeLegacyIPNetwork({ ...salins, netmask: undefined }).normalization_error, 'missing_address_or_netmask');
  assert.equal(normalizeLegacyIPNetwork({ ...salins, address: '999.1.1.1' }).normalization_error, 'invalid_ipv4_address');
  assert.equal(normalizeLegacyIPNetwork({ ...salins, network: '10.2.0.0/16' }).normalization_error, 'ambiguous_ip_network_definition');
  assert.equal(normalizeLegacyIPNetwork({ ...salins, network: '2001:db8::/64' }).normalization_error, 'ambiguous_ip_network_definition');
});

test('Legacy IPNetwork normalization keeps IPv6 explicit for plugin_ipv4_only planning', () => {
  const normalized = normalizeLegacyIPNetwork({ ...salins, address: '2001:db8::', netmask: 'ffff:ffff:ffff:ffff::' });
  const plan = buildAddressingPlan({ itemtype: 'x', sources: [normalized], ranges: [], request: { ip_network_ids: [42] } });
  assert.equal(plan.items[0].reason, 'plugin_ipv4_only');
});

test('SALINS adapter preview reads the selected id directly and proposes the expected first range', async () => {
  const calls: Array<{ method: string; itemtype: string; id?: number }> = [];
  const client = {
    searchOptions: { get: async () => addressingCatalogue() },
    getItem: async (itemtype: string, id: number) => { calls.push({ method: 'getItem', itemtype, id }); return salins; },
    getItems: async (itemtype: string) => { calls.push({ method: 'getItems', itemtype }); return []; },
  } as any;
  const plan = await new LegacyAddressingSyncService(client).preview({ ip_network_ids: [42], range_policy: 'usable_hosts' });
  const item = plan.items[0];
  assert.equal(item.action, 'create');
  assert.equal(item.proposed_values?.entities_id, 4);
  assert.equal(item.proposed_values?.name, salins.name);
  assert.equal(item.proposed_values?.begin_ip, '10.1.107.1');
  assert.equal(item.proposed_values?.end_ip, '10.1.107.254');
  assert.equal(item.proposed_values?.use_ping, false);
  assert.equal(item.proposed_values?.comment, 'Réseau LAN GENBIO\n[mcp-ipnetwork-sync:v1 ipnetwork_id=42]');
  assert.deepEqual(calls.filter((call) => call.itemtype === 'IPNetwork'), [{ method: 'getItem', itemtype: 'IPNetwork', id: 42 }]);
});

test('explicit IPNetwork selection rejects mismatched returned ids instead of producing a partial plan', async () => {
  const client = {
    searchOptions: { get: async () => addressingCatalogue() },
    getItem: async () => ({ ...salins, id: 99 }), getItems: async () => [],
  } as any;
  await assert.rejects(() => new LegacyAddressingSyncService(client).preview({ ip_network_ids: [42] }), /missing ids: 42/);
});

test('first write on an empty plugin requires and accepts audited Addressing 3.2.11', async () => {
  const creates: unknown[] = [];
  const client = {
    searchOptions: { get: async () => addressingCatalogue() },
    getItem: async (itemtype: string) => itemtype === 'IPNetwork' ? salins : { id: 1, ...(creates[0] as object) },
    getItems: async (itemtype: string) => itemtype === 'Plugin' ? [{ directory: 'addressing', version: '3.2.11', state: 1 }] : [],
    createItem: async (_itemtype: string, payload: unknown) => { creates.push(payload); return { id: 1 }; },
  } as any;
  const service = new LegacyAddressingSyncService(client);
  const options = { ip_network_ids: [42], range_policy: 'usable_hosts' as const };
  const preview = await service.preview(options);
  const applied = await service.apply({ ...options, preview_fingerprint: preview.fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_SYNC' });
  assert.equal(applied.results[0].action, 'created');
  assert.equal(applied.results[0].verification_status, 'verified');
  assert.equal(creates.length, 1);
});

test('first write refuses an empty plugin whose installed version is not source-audited', async () => {
  let creates = 0;
  const client = {
    searchOptions: { get: async () => addressingCatalogue() }, getItem: async () => salins,
    getItems: async (itemtype: string) => itemtype === 'Plugin' ? [{ directory: 'addressing', version: '3.2.10' }] : [],
    createItem: async () => { creates++; return { id: 1 }; },
  } as any;
  const service = new LegacyAddressingSyncService(client);
  const options = { ip_network_ids: [42] };
  const preview = await service.preview(options);
  await assert.rejects(() => service.apply({ ...options, preview_fingerprint: preview.fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_SYNC' }), /active source-audited version 3\.2\.11/);
  assert.equal(creates, 0);
});

test('first write refuses source-audited Addressing when the plugin is not active', async () => {
  const client = {
    searchOptions: { get: async () => addressingCatalogue() }, getItem: async () => salins,
    getItems: async (itemtype: string) => itemtype === 'Plugin' ? [{ directory: 'addressing', version: '3.2.11', state: 4 }] : [],
    createItem: async () => { throw new Error('must not write'); },
  } as any;
  const service = new LegacyAddressingSyncService(client);
  const options = { ip_network_ids: [42] };
  const preview = await service.preview(options);
  await assert.rejects(() => service.apply({ ...options, preview_fingerprint: preview.fingerprint, confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_SYNC' }), /active source-audited/);
});

test('Addressing range reads paginate beyond 9999 instead of silently truncating', async () => {
  const ranges = Array.from({ length: 10001 }, (_, index) => ({
    id: index + 1, entities_id: 4, name: `R${index + 1}`, begin_ip: '10.0.0.1', end_ip: '10.0.0.1',
  }));
  const requestedRanges: string[] = [];
  const client = {
    searchOptions: { get: async () => addressingCatalogue() },
    getItems: async (_itemtype: string, options: { range: string; is_deleted: boolean }) => {
      requestedRanges.push(options.range);
      if (options.is_deleted) return [];
      const [start, end] = options.range.split('-').map(Number);
      return ranges.slice(start, end + 1);
    },
  } as any;
  const result = await new LegacyAddressingSyncService(client).list({ limit: 1000 });
  assert.equal(result.total, 10001);
  assert.equal(requestedRanges.length, 11);
  assert.equal(requestedRanges.at(-1), '10000-10999');
});

test('include_recursive is explicitly rejected instead of being silently ignored', () => {
  assert.throws(() => addressingPreviewSchema.parse({ ip_network_ids: [42], include_recursive: true }));
  assert.throws(() => addressingPreviewSchema.parse({ ip_network_ids: [42, 42] }), /must not contain duplicates/);
});

test('Addressing tool annotations distinguish preview from guarded idempotent apply', () => {
  assert.deepEqual(toolAnnotations('glpi_addressing_list_ranges'), { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual(toolAnnotations('glpi_addressing_get_range'), { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual(toolAnnotations('glpi_addressing_preview_ip_network_sync'), { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual(toolAnnotations('glpi_addressing_apply_ip_network_sync'), { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
});
