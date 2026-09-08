import { randomUUID } from 'node:crypto';
import { LocationIntegrityService } from '../../core/location-integrity/service.js';
import { AssetLocationUpdateRequest, LOCATION_ASSET_TYPES, LocationAssetType, LocationMappingRequest } from '../../core/location-integrity/types.js';
import { resolveGlpiRelationId } from '../../core/glpi-relations.js';
import { GlpiClient } from './glpi-client.js';

const REFERENCE_TYPES = [
  ...LOCATION_ASSET_TYPES, 'User', 'Group', 'Ticket', 'Problem', 'Change', 'Project', 'Supplier', 'Contact',
] as const;

const MODEL_FIELDS: Partial<Record<LocationAssetType, string>> = {
  Computer: 'computermodels_id', Monitor: 'monitormodels_id', Printer: 'printermodels_id',
  NetworkEquipment: 'networkequipmentmodels_id', Phone: 'phonemodels_id',
  Peripheral: 'peripheralmodels_id', Appliance: 'appliancetypes_id',
};
const TYPE_FIELDS: Partial<Record<LocationAssetType, string>> = {
  Computer: 'computertypes_id', Monitor: 'monitortypes_id', Printer: 'printertypes_id',
  NetworkEquipment: 'networkequipmenttypes_id', Phone: 'phonetypes_id', Peripheral: 'peripheraltypes_id',
};

function clear(value: string | null | undefined): string | undefined {
  return value === null ? '' : value;
}

function normalizedName(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[_:;,.\-/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function rawRelation(item: Record<string, unknown>, field: string, relation: string): number {
  if (item[field] === undefined || item[field] === null || item[field] === '') return 0;
  return resolveGlpiRelationId(item, field, relation);
}

function publicError(error: unknown): { error: string; message: string } {
  return { error: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) };
}

function auditEvent(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), component: 'location_integrity', event, ...details }));
}

export class LegacyLocationIntegrityService implements LocationIntegrityService {
  constructor(private readonly client: GlpiClient) {}

  private async raw(itemtype: string, id: number): Promise<Record<string, unknown>> {
    return this.client.getItem<Record<string, unknown>>(itemtype, id, { expand_dropdowns: false });
  }

  private async all(itemtype: string): Promise<Record<string, unknown>[]> {
    return this.client.getItems<Record<string, unknown>>(itemtype, { range: '0-9999', expand_dropdowns: false });
  }

  private async isDescendant(entityId: number, ancestorId: number): Promise<boolean> {
    let current = entityId; const visited = new Set<number>();
    while (!visited.has(current)) {
      if (current === ancestorId) return true;
      if (current === 0) return ancestorId === 0;
      visited.add(current);
      current = rawRelation(await this.raw('Entity', current), 'entities_id', 'Entity');
    }
    return false;
  }

  private async validateLocation(locationId: number, entityId: number): Promise<Record<string, unknown>> {
    if (locationId === 0) return { id: 0, name: 'No location', entities_id: entityId };
    const location = await this.raw('Location', locationId);
    const locationEntity = rawRelation(location, 'entities_id', 'Entity');
    if (locationEntity !== entityId && (!Boolean(Number(location.is_recursive ?? 0)) || !await this.isDescendant(entityId, locationEntity))) {
      throw new Error(`Location ${locationId} is not available to entity ${entityId}`);
    }
    return location;
  }

  private payload(input: AssetLocationUpdateRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      locations_id: input.locationId, entities_id: input.entityId, name: input.name,
      serial: clear(input.serial), otherserial: clear(input.inventoryNumber), comment: clear(input.comment),
      states_id: input.stateId, manufacturers_id: input.manufacturerId,
      users_id: input.assignedUserId, users_id_tech: input.assignedTechnicianId,
      contact: clear(input.contact), contact_num: clear(input.contactNumber),
      is_recursive: input.recursive === undefined ? undefined : input.recursive ? 1 : 0,
    };
    if (input.modelId !== undefined && MODEL_FIELDS[input.itemtype]) payload[MODEL_FIELDS[input.itemtype]!] = input.modelId;
    if (input.typeId !== undefined && TYPE_FIELDS[input.itemtype]) payload[TYPE_FIELDS[input.itemtype]!] = input.typeId;
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  async updateAsset(input: AssetLocationUpdateRequest): Promise<unknown> {
    const operationId = input.correlationId ?? randomUUID();
    const beforeRaw = await this.raw(input.itemtype, input.id);
    const beforeDisplay = await this.client.getItem<Record<string, unknown>>(input.itemtype, input.id);
    const entityId = input.entityId ?? rawRelation(beforeRaw, 'entities_id', 'Entity');
    if (input.locationId !== undefined) await this.validateLocation(input.locationId, entityId);
    const payload = this.payload(input);
    if (Object.keys(payload).length === 0) throw new Error('At least one asset field must be provided');
    await this.client.updateItem(input.itemtype, input.id, payload);
    try {
      const afterRaw = await this.raw(input.itemtype, input.id);
      const afterDisplay = await this.client.getItem<Record<string, unknown>>(input.itemtype, input.id);
      const differences = Object.entries(payload).filter(([field, expected]) => {
        const actual = afterRaw[field];
        return String(actual ?? '') !== String(expected ?? '');
      }).map(([field, expected]) => ({ field, expected, actual: afterRaw[field] }));
      const result = {
        success: true, operation_id: operationId, update_status: 'succeeded',
        verification_status: differences.length === 0 ? 'verified' : 'failed',
        itemtype: input.itemtype, item_id: input.id, before_raw: beforeRaw, after_raw: afterRaw,
        before_display: beforeDisplay, after_display: afterDisplay,
        requested: payload, ...(differences.length ? { verification_differences: differences } : {}),
      };
      auditEvent(differences.length ? 'verification_failed' : 'update_verified', {
        operation_id: operationId, itemtype: input.itemtype, item_id: input.id,
        update_status: 'succeeded', verification_status: result.verification_status,
        fields: Object.keys(payload),
      });
      return result;
    } catch (error) {
      auditEvent('verification_failed', { operation_id: operationId, itemtype: input.itemtype,
        item_id: input.id, update_status: 'succeeded', verification_status: 'failed', fields: Object.keys(payload) });
      return { success: true, operation_id: operationId, update_status: 'succeeded', verification_status: 'failed',
        itemtype: input.itemtype, item_id: input.id, before_raw: beforeRaw, before_display: beforeDisplay,
        requested: payload, verification_error: publicError(error) };
    }
  }

  async resolveLocation(input: { name: string; entityId?: number; parentLocationId?: number }): Promise<unknown> {
    const target = normalizedName(input.name);
    const candidates = (await this.all('Location')).filter((location) => {
      if (normalizedName(location.completename ?? location.name) !== target && normalizedName(location.name) !== target) return false;
      if (input.entityId !== undefined && rawRelation(location, 'entities_id', 'Entity') !== input.entityId) return false;
      if (input.parentLocationId !== undefined && rawRelation(location, 'locations_id', 'Location') !== input.parentLocationId) return false;
      return true;
    });
    return { status: candidates.length === 1 ? 'resolved' : candidates.length === 0 ? 'not_found' : 'ambiguous',
      location_id: candidates.length === 1 ? Number(candidates[0].id) : undefined, candidates };
  }

  async auditLocations(input: Record<string, unknown>): Promise<unknown> {
    const all = await this.all('Location');
    const minId = typeof input.min_location_id === 'number' ? input.min_location_id : 0;
    const entityId = typeof input.entity_id === 'number' ? input.entity_id : undefined;
    const locations = all.filter((location) => Number(location.id) >= minId &&
      (entityId === undefined || rawRelation(location, 'entities_id', 'Entity') === entityId) &&
      (input.created_from === undefined || String(location.date_creation ?? '') >= String(input.created_from)) &&
      (input.created_to === undefined || String(location.date_creation ?? '') <= String(input.created_to)));
    const normalized = new Map<string, Record<string, unknown>[]>();
    const complete = new Map<string, Record<string, unknown>[]>();
    for (const location of all) {
      const key = normalizedName(location.name); normalized.set(key, [...(normalized.get(key) ?? []), location]);
      const full = normalizedName(location.completename); complete.set(full, [...(complete.get(full) ?? []), location]);
    }
    const limited = input.fetch_all ? locations : locations.slice(0, Number(input.limit ?? 1000));
    const findings = [];
    for (const location of limited) {
      const name = String(location.name ?? ''); const numericTarget = /^\d+$/.test(name) ? all.find((item) => Number(item.id) === Number(name)) : undefined;
      const finding: Record<string, unknown> = {
        location_id: Number(location.id), name, completename: location.completename,
        entity_id: rawRelation(location, 'entities_id', 'Entity'),
        numeric_name: /^\d+$/.test(name), numeric_name_target: numericTarget ?? null,
        normalized_duplicates: (normalized.get(normalizedName(name)) ?? []).filter((item) => item.id !== location.id),
        completename_duplicates: (complete.get(normalizedName(location.completename)) ?? []).filter((item) => item.id !== location.id),
      };
      if (input.include_references === true) finding.references = await this.references(Number(location.id));
      if (finding.numeric_name || (finding.normalized_duplicates as unknown[]).length || (finding.completename_duplicates as unknown[]).length ||
          (input.include_references === true && Object.keys(finding.references as object).length === 0)) findings.push(finding);
    }
    const clusters = new Map<string, number[]>();
    for (const location of locations) {
      const minute = String(location.date_creation ?? '').slice(0, 16); if (!minute) continue;
      clusters.set(minute, [...(clusters.get(minute) ?? []), Number(location.id)]);
    }
    return { analyzed: limited.length, total_matching_scope: locations.length, findings_count: findings.length, findings,
      mass_creation_windows: [...clusters.entries()].filter(([, ids]) => ids.length >= 5).map(([minute, ids]) => ({ minute, count: ids.length, location_ids: ids })),
      modifies_data: false };
  }

  private async references(locationId: number): Promise<Record<string, unknown>> {
    const grouped: Record<string, Array<{ id: number; name: unknown }>> = {};
    for (const itemtype of REFERENCE_TYPES) {
      try {
        const matches = (await this.all(itemtype)).filter((item) => rawRelation(item, 'locations_id', 'Location') === locationId);
        if (matches.length) grouped[itemtype] = matches.map((item) => ({ id: Number(item.id), name: item.name }));
      } catch (error) {
        grouped[`${itemtype}_scan_error`] = [{ id: 0, name: publicError(error).message }];
      }
    }
    return grouped;
  }

  async deleteLocation(input: { locationId: number; dryRun: boolean; purge: boolean; confirmation?: string }): Promise<unknown> {
    const target = await this.raw('Location', input.locationId);
    const children = (await this.all('Location')).filter((item) => rawRelation(item, 'locations_id', 'Location') === input.locationId);
    const references = await this.references(input.locationId);
    const blockers = [children.length ? 'child_locations' : '', Object.keys(references).length ? 'references_or_incomplete_scan' : ''].filter(Boolean);
    const plan = { location_id: input.locationId, target, children, references, can_delete: blockers.length === 0, blockers };
    if (input.dryRun) return { dry_run: true, ...plan };
    if (input.confirmation !== 'I_HAVE_VERIFIED_THE_LOCATION_DELETION') throw new Error('Live deletion requires confirmation');
    if (blockers.length) throw new Error(`Location ${input.locationId} deletion blocked: ${blockers.join(', ')}`);
    await this.client.deleteItem('Location', input.locationId, input.purge);
    auditEvent('location_deleted', { operation_id: randomUUID(), location_id: input.locationId, purged: input.purge });
    return { dry_run: false, deleted: true, purged: input.purge, ...plan };
  }

  async deleteUnusedLocations(input: { locationIds: number[]; dryRun: boolean; purge: boolean; confirmation?: string }): Promise<unknown> {
    const plans = [];
    for (const locationId of input.locationIds) plans.push(await this.deleteLocation({ ...input, locationId, dryRun: true }));
    if (input.dryRun) return { dry_run: true, requested: input.locationIds.length, results: plans };
    if (input.confirmation !== 'I_HAVE_VERIFIED_THE_LOCATION_DELETION') throw new Error('Live deletion requires confirmation');
    if (plans.some((plan: any) => !plan.can_delete)) throw new Error('Batch deletion blocked: at least one Location has children, references, or an incomplete scan; no write performed');
    const results = [];
    for (const locationId of input.locationIds) {
      await this.client.deleteItem('Location', locationId, input.purge);
      results.push({ location_id: locationId, deleted: true, purged: input.purge });
    }
    auditEvent('locations_deleted', { operation_id: randomUUID(), location_ids: input.locationIds, purged: input.purge });
    return { dry_run: false, requested: input.locationIds.length, results };
  }

  async reassignAssets(input: LocationMappingRequest): Promise<unknown> {
    const operationId = input.correlationId ?? randomUUID();
    const map = new Map(input.mapping.map((entry) => [entry.oldLocationId, entry.newLocationId]));
    for (const destination of new Set(map.values())) await this.raw('Location', destination);
    const plan: Array<Record<string, unknown>> = [];
    for (const itemtype of input.itemtypes) {
      for (const item of await this.all(itemtype)) {
        const oldLocationId = rawRelation(item, 'locations_id', 'Location');
        const newLocationId = map.get(oldLocationId); if (!newLocationId) continue;
        try {
          const entityId = rawRelation(item, 'entities_id', 'Entity'); await this.validateLocation(newLocationId, entityId);
          plan.push({ itemtype, item_id: Number(item.id), name: item.name, old_location_id: oldLocationId, new_location_id: newLocationId, entity_id: entityId, status: 'ready' });
        } catch (error) { plan.push({ itemtype, item_id: Number(item.id), old_location_id: oldLocationId, new_location_id: newLocationId, status: 'blocked', ...publicError(error) }); }
      }
    }
    if (input.dryRun) return { operation_id: operationId, dry_run: true, ready: plan.filter((item) => item.status === 'ready').length, plan };
    if (input.confirmation !== 'I_HAVE_VERIFIED_THE_ASSET_LOCATION_MAPPING') throw new Error('Live reassignment requires confirmation');
    if (!input.continueOnError && plan.some((item) => item.status !== 'ready')) throw new Error('Plan contains blocked assets; no write performed');
    const results = [];
    const ready = plan.filter((entry) => entry.status === 'ready');
    for (let offset = 0; offset < ready.length; offset += input.batchSize) {
      for (const item of ready.slice(offset, offset + input.batchSize)) {
        const result = await this.updateAsset({ itemtype: item.itemtype as LocationAssetType, id: Number(item.item_id),
          locationId: Number(item.new_location_id), correlationId: operationId });
        results.push(result);
      }
    }
    auditEvent('asset_reassignment_completed', { operation_id: operationId, planned: plan.length,
      processed: results.length, batch_size: input.batchSize });
    return { operation_id: operationId, dry_run: false, planned: plan.length, results };
  }

  async listItemHistory(input: Record<string, unknown>): Promise<unknown> {
    const rows = (await this.all('Log')).filter((row) =>
      (input.itemtype === undefined || row.itemtype === input.itemtype) &&
      (input.item_id === undefined || Number(row.items_id) === input.item_id) &&
      (input.user_id === undefined || Number(row.users_id) === input.user_id) &&
      (input.date_from === undefined || String(row.date_mod ?? '') >= String(input.date_from)) &&
      (input.date_to === undefined || String(row.date_mod ?? '') <= String(input.date_to))
    );
    const start = Number(input.start ?? 0); const limit = input.fetch_all ? rows.length : Number(input.limit ?? 100);
    return rows.slice(start, start + limit).map((row) => {
      const actor = String(row.user_name ?? ''); const automatic = /cron|automatic|inventory|ldap/i.test(actor) || Number(row.users_id ?? 0) === 0;
      return { log_id: Number(row.id), date: row.date_mod, itemtype: row.itemtype, item_id: Number(row.items_id),
        action: row.linked_action, field: row.id_search_option, old_value: row.old_value, new_value: row.new_value,
        user_id: Number(row.users_id ?? 0), user_name: row.user_name, is_automatic: automatic,
        source: /ldap/i.test(actor) ? 'ldap' : /inventory/i.test(actor) ? 'inventory' : automatic ? 'automatic_or_cron' : 'user' };
    });
  }

  async listLdapDirectories(input: Record<string, unknown>): Promise<unknown> {
    const rows = await this.all('AuthLDAP'); const start = Number(input.start ?? 0); const limit = Number(input.limit ?? 100);
    return rows.slice(start, start + limit).map(({ rootdn_passwd, ...safe }) => ({ ...safe, rootdn_passwd: rootdn_passwd === undefined ? undefined : '[REDACTED]' }));
  }

  async listAutomaticActions(input: Record<string, unknown>): Promise<unknown> {
    const rows = await this.all('CronTask'); const start = Number(input.start ?? 0); const limit = Number(input.limit ?? 100);
    return rows.slice(start, start + limit);
  }
}
