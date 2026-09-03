import { InventoryPluginResource, InventoryPluginService } from '../../core/inventory-plugin/service.js';
import {
  InventoryCredentialWriteRequest,
  InventoryIPRangeWriteRequest,
  InventoryPluginListRequest,
  InventoryTaskWriteRequest,
  InventoryIPRangeSNMPAssociationCreateRequest,
  InventoryIPRangeSNMPAssociationListRequest,
} from '../../core/inventory-plugin/types.js';
import { SearchCriterion } from './search.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

export const INVENTORY_PLUGIN_ITEMTYPES: Record<InventoryPluginResource, string> = {
  credentials: 'PluginGlpiinventoryCredential',
  tasks: 'PluginGlpiinventoryTask',
  task_jobs: 'PluginGlpiinventoryTaskjob',
  task_job_states: 'PluginGlpiinventoryTaskjobstate',
  timeslots: 'PluginGlpiinventoryTimeslot',
  collects: 'PluginGlpiinventoryCollect',
  collect_files: 'PluginGlpiinventoryCollect_File',
  collect_registries: 'PluginGlpiinventoryCollect_Registry',
  collect_wmi_queries: 'PluginGlpiinventoryCollect_Wmi',
  deploy_packages: 'PluginGlpiinventoryDeployPackage',
  deploy_groups: 'PluginGlpiinventoryDeployGroup',
};

const IP_RANGE_SNMP_RELATION = 'PluginGlpiinventoryIPRange_SNMPCredential';
const SNMP_CREDENTIAL = 'SNMPCredential';

function listOptions(input: InventoryPluginListRequest): ListOptions {
  const start = input.start ?? 0;
  const limit = input.limit ?? 50;
  return {
    range: input.range ?? `${start}-${start + limit - 1}`,
    sort: input.sort as number | undefined,
    order: input.order ?? 'ASC',
    expand_dropdowns: input.expand_dropdowns !== false,
  };
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|community/i.test(key)) continue;
    output[key] = stripSecrets(child);
  }
  return output;
}

function mapIPRange(input: InventoryIPRangeWriteRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.entity_id !== undefined) payload.entities_id = input.entity_id;
  if (input.ip_start !== undefined) payload.ip_start = input.ip_start;
  if (input.ip_end !== undefined) payload.ip_end = input.ip_end;
  return payload;
}

function mapTask(input: InventoryTaskWriteRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.entity_id !== undefined) payload.entities_id = input.entity_id;
  if (input.comment !== undefined) payload.comment = input.comment;
  if (input.is_active !== undefined) payload.is_active = input.is_active ? 1 : 0;
  if (input.datetime_start !== undefined) payload.datetime_start = input.datetime_start;
  if (input.datetime_end !== undefined) payload.datetime_end = input.datetime_end;
  if (input.reprepare_if_successful !== undefined) payload.reprepare_if_successful = input.reprepare_if_successful ? 1 : 0;
  if (input.is_deploy_on_demand !== undefined) payload.is_deploy_on_demand = input.is_deploy_on_demand ? 1 : 0;
  return payload;
}

function mapCredential(input: InventoryCredentialWriteRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.entity_id !== undefined) payload.entities_id = input.entity_id;
  if (input.credential_type !== undefined) payload.itemtype = input.credential_type;
  if (input.username !== undefined) payload.username = input.username;
  if (input.password !== undefined) payload.password = input.password;
  return payload;
}

function ipv4ToBigInt(address: string): bigint {
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`);
  }
  return octets.reduce((value, part) => (value << 8n) + BigInt(Number(part)), 0n);
}

function bigIntToIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.');
}

export function cidrToIPRange(cidr: string, usableHostsOnly = true): { ip_start: string; ip_end: string } {
  const [address, rawPrefix, ...extra] = cidr.split('/');
  const prefix = Number(rawPrefix);
  if (extra.length || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }
  const ip = ipv4ToBigInt(address);
  const hostBits = 32 - prefix;
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(hostBits);
  const network = ip & mask;
  const broadcast = network + ((1n << BigInt(hostBits)) - 1n);
  const excludeBoundaries = usableHostsOnly && prefix <= 30;
  return {
    ip_start: bigIntToIPv4(excludeBoundaries ? network + 1n : network),
    ip_end: bigIntToIPv4(excludeBoundaries ? broadcast - 1n : broadcast),
  };
}

export class LegacyInventoryPluginService implements InventoryPluginService {
  constructor(private readonly client: GlpiClient) {}

  async list(resource: InventoryPluginResource, input: InventoryPluginListRequest): Promise<unknown[]> {
    return stripSecrets(await this.client.getItems(INVENTORY_PLUGIN_ITEMTYPES[resource], listOptions(input))) as unknown[];
  }
  async get(resource: InventoryPluginResource, id: number): Promise<unknown> {
    return stripSecrets(await this.client.getItem(INVENTORY_PLUGIN_ITEMTYPES[resource], id));
  }
  async listIPRanges(input: InventoryPluginListRequest) { return this.client.getItems('PluginGlpiinventoryIPRange', listOptions(input)); }
  async getIPRange(id: number) { return this.client.getItem('PluginGlpiinventoryIPRange', id); }
  async createIPRange(input: InventoryIPRangeWriteRequest & { name: string; ip_start: string; ip_end: string }) { return this.client.createItem('PluginGlpiinventoryIPRange', mapIPRange(input)); }
  async createIPRangeFromCIDR(input: { name: string; cidr: string; entity_id?: number; usable_hosts_only?: boolean }) {
    return this.createIPRange({ name: input.name, entity_id: input.entity_id, ...cidrToIPRange(input.cidr, input.usable_hosts_only !== false) });
  }
  async updateIPRange(id: number, input: InventoryIPRangeWriteRequest) { await this.client.updateItem('PluginGlpiinventoryIPRange', id, mapIPRange(input)); return { success: true, id }; }
  async listIPRangeSNMPCredentials(input: InventoryIPRangeSNMPAssociationListRequest): Promise<unknown[]> {
    const criteria: SearchCriterion[] = [];
    if (input.ip_range_id !== undefined) criteria.push({ field: 3, searchtype: 'equals', value: input.ip_range_id });
    if (input.snmp_credential_id !== undefined) criteria.push({
      field: 4, searchtype: 'equals', value: input.snmp_credential_id,
      ...(criteria.length ? { link: 'AND' as const } : {}),
    });
    const result = await this.client.search.search(IP_RANGE_SNMP_RELATION, {
      criteria,
      forcedisplay: [2, 3, 4],
      start: input.start ?? 0,
      limit: input.limit ?? 50,
      sort: input.sort === undefined ? undefined : Number(input.sort),
      order: input.order ?? 'ASC',
      giveItems: true,
    });
    return result.data;
  }
  async getIPRangeSNMPCredential(id: number) {
    return this.client.getItem(IP_RANGE_SNMP_RELATION, id, { expand_dropdowns: false });
  }
  async attachSNMPCredentialToIPRange(input: InventoryIPRangeSNMPAssociationCreateRequest) {
    await Promise.all([
      this.client.getItem('PluginGlpiinventoryIPRange', input.ip_range_id, { expand_dropdowns: false }),
      this.client.getItem(SNMP_CREDENTIAL, input.snmp_credential_id, { expand_dropdowns: false }),
    ]);
    const existing = await this.listIPRangeSNMPCredentials({
      ip_range_id: input.ip_range_id,
      snmp_credential_id: input.snmp_credential_id,
      limit: 1,
    });
    if (existing.length > 0) {
      throw new Error(`SNMP credential ${input.snmp_credential_id} is already associated with IP range ${input.ip_range_id}`);
    }
    const created = await this.client.createItem(IP_RANGE_SNMP_RELATION, {
      plugin_glpiinventory_ipranges_id: input.ip_range_id,
      snmpcredentials_id: input.snmp_credential_id,
      ...(input.rank === undefined ? {} : { rank: input.rank }),
    });
    try {
      return { success: true, ...(await this.getIPRangeSNMPCredential(created.id) as Record<string, unknown>) };
    } catch (error) {
      return {
        success: true, id: created.id, creation_status: 'succeeded', verification_status: 'failed',
        verification_error: error instanceof Error ? error.name : 'UnknownError',
        verification_message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  async updateIPRangeSNMPCredential(id: number, rank: number) {
    await this.getIPRangeSNMPCredential(id);
    await this.client.updateItem(IP_RANGE_SNMP_RELATION, id, { rank });
    try {
      return { success: true, ...(await this.getIPRangeSNMPCredential(id) as Record<string, unknown>) };
    } catch (error) {
      return {
        success: true, id, update_status: 'succeeded', verification_status: 'failed',
        verification_error: error instanceof Error ? error.name : 'UnknownError',
        verification_message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  async detachSNMPCredentialFromIPRange(id: number) {
    const relation = await this.getIPRangeSNMPCredential(id);
    await this.client.deleteItem(IP_RANGE_SNMP_RELATION, id, true);
    return { success: true, id, deleted: true, relation };
  }
  async createTask(input: InventoryTaskWriteRequest & { name: string }) { return this.client.createItem('PluginGlpiinventoryTask', mapTask(input)); }
  async updateTask(id: number, input: InventoryTaskWriteRequest) { await this.client.updateItem('PluginGlpiinventoryTask', id, mapTask(input)); return { success: true, id }; }
  async setTaskActive(id: number, active: boolean) { await this.client.updateItem('PluginGlpiinventoryTask', id, { is_active: active ? 1 : 0 }); return { success: true, id, active }; }
  async requeueTask(id: number) {
    const task = await this.client.getItem('PluginGlpiinventoryTask', id) as Record<string, unknown>;
    const wasActive = task.is_active === true || task.is_active === 1 || task.is_active === '1';
    const wasRepreparable = task.reprepare_if_successful === true
      || task.reprepare_if_successful === 1
      || task.reprepare_if_successful === '1';

    try {
      if (wasActive) await this.client.updateItem('PluginGlpiinventoryTask', id, { is_active: 0 });
      await this.client.updateItem('PluginGlpiinventoryTask', id, { reprepare_if_successful: 1 });
      await this.client.updateItem('PluginGlpiinventoryTask', id, { is_active: 1 });
    } catch (error) {
      try {
        await this.client.updateItem('PluginGlpiinventoryTask', id, {
          reprepare_if_successful: wasRepreparable ? 1 : 0,
          is_active: wasActive ? 1 : 0,
        });
      } catch {
        // Preserve the original GLPI error; rollback is best-effort.
      }
      throw error;
    }

    return {
      success: true,
      id,
      active: true,
      reprepare_if_successful: true,
      status: 'queued_for_scheduler',
    };
  }
  async createCredential(input: InventoryCredentialWriteRequest & { name: string; credential_type: string }) { return this.client.createItem('PluginGlpiinventoryCredential', mapCredential(input)); }
  async updateCredential(id: number, input: InventoryCredentialWriteRequest) { await this.client.updateItem('PluginGlpiinventoryCredential', id, mapCredential(input)); return { success: true, id }; }
}
