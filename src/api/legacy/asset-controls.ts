import { AssetControlService } from '../../core/asset-controls/service.js';
import { AssetInventoryLockRequest, AssetTagChangeRequest, AssetTagRequest, TagListRequest } from '../../core/asset-controls/types.js';
import { GlpiClient } from './glpi-client.js';

const TAG = 'PluginTagTag';
const TAG_ITEM = 'PluginTagTagItem';
const LOCK = 'Lockedfield';
const PAGE_SIZE = 1000;
const SAFETY_CAP = 100000;
const LOCKABLE_FIELDS = new Set([
  'name', 'serial', 'otherserial', 'contact', 'contactnum', 'users_id_tech',
  'groups_id_tech', 'users_id', 'groups_id', 'states_id', 'locations_id',
  'networks_id', 'manufacturers_id', 'uuid', 'comment',
]);

function number(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function enabled(value: unknown): boolean { return value === true || value === 1 || value === '1'; }

export class LegacyAssetControlService implements AssetControlService {
  constructor(private readonly client: GlpiClient) {}

  private async all(itemtype: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < SAFETY_CAP; start += PAGE_SIZE) {
      const page = await this.client.getItems<Record<string, unknown>>(itemtype, {
        range: `${start}-${start + PAGE_SIZE - 1}`, expand_dropdowns: false,
      });
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
    throw new Error(`Safety cap reached while listing ${itemtype}`);
  }

  private async asset(input: AssetTagRequest): Promise<Record<string, unknown>> {
    return this.client.getItem<Record<string, unknown>>(input.asset_type, input.asset_id, { expand_dropdowns: false });
  }

  private async tagRelations(input: AssetTagRequest): Promise<Record<string, unknown>[]> {
    return (await this.all(TAG_ITEM)).filter((row) => row.itemtype === input.asset_type && number(row.items_id) === input.asset_id);
  }

  private async locks(input: AssetTagRequest): Promise<Record<string, unknown>[]> {
    return (await this.all(LOCK)).filter((row) => row.itemtype === input.asset_type && (enabled(row.is_global) || number(row.items_id) === input.asset_id));
  }

  async listTags(input: TagListRequest) {
    // A direct read also makes an absent/disabled plugin fail explicitly.
    const query = input.query?.toLocaleLowerCase();
    const matching = (await this.all(TAG)).filter((row) =>
      (!input.active_only || enabled(row.is_active)) &&
      (!query || String(row.name ?? '').toLocaleLowerCase().includes(query))
    );
    const start = input.start ?? 0; const limit = input.limit ?? 100;
    return { tags: matching.slice(start, start + limit), returned: Math.min(limit, Math.max(0, matching.length - start)), total_matching: matching.length, complete: true, modifies_data: false };
  }

  async listAssetTags(input: AssetTagRequest) {
    const asset = await this.asset(input); const relations = await this.tagRelations(input);
    const tags = await Promise.all(relations.map(async (relation) => ({
      relation_id: number(relation.id), relation,
      tag: await this.client.getItem(TAG, number(relation.plugin_tag_tags_id), { expand_dropdowns: false }),
    })));
    return { asset_type: input.asset_type, asset_id: input.asset_id, asset_name: asset.name ?? null, tags, returned: tags.length, modifies_data: false };
  }

  async attachTag(input: AssetTagChangeRequest) {
    const [asset, tag, relations] = await Promise.all([
      this.asset(input), this.client.getItem<Record<string, unknown>>(TAG, input.tag_id, { expand_dropdowns: false }), this.tagRelations(input),
    ]);
    const existing = relations.filter((row) => number(row.plugin_tag_tags_id) === input.tag_id);
    if (existing.length > 1) throw new Error('Ambiguous duplicate tag associations detected');
    if (existing.length === 1) return { success: true, idempotent: true, action: 'already_attached', asset_type: input.asset_type, asset_id: input.asset_id, asset_name: asset.name ?? null, tag, relation: existing[0] };
    const created = await this.client.createItem(TAG_ITEM, { plugin_tag_tags_id: input.tag_id, itemtype: input.asset_type, items_id: input.asset_id });
    const verified = await this.client.getItem<Record<string, unknown>>(TAG_ITEM, created.id, { expand_dropdowns: false });
    if (number(verified.plugin_tag_tags_id) !== input.tag_id || verified.itemtype !== input.asset_type || number(verified.items_id) !== input.asset_id) throw new Error('Tag association post-write verification failed');
    return { success: true, idempotent: false, action: 'attached', asset_type: input.asset_type, asset_id: input.asset_id, tag, relation: verified, verification_status: 'verified' };
  }

  async detachTag(input: AssetTagChangeRequest) {
    await Promise.all([this.asset(input), this.client.getItem(TAG, input.tag_id, { expand_dropdowns: false })]);
    const matching = (await this.tagRelations(input)).filter((row) => number(row.plugin_tag_tags_id) === input.tag_id);
    if (matching.length > 1) throw new Error('Ambiguous duplicate tag associations detected');
    if (!matching.length) return { success: true, idempotent: true, action: 'already_detached', asset_type: input.asset_type, asset_id: input.asset_id, tag_id: input.tag_id };
    const relation = matching[0];
    await this.client.deleteItem(TAG_ITEM, number(relation.id), true, false);
    const remaining = (await this.tagRelations(input)).filter((row) => number(row.plugin_tag_tags_id) === input.tag_id);
    if (remaining.length) throw new Error('Tag detachment post-write verification failed');
    return { success: true, idempotent: false, action: 'detached_relation_only', asset_type: input.asset_type, asset_id: input.asset_id, tag_id: input.tag_id, relation, tag_deleted: false, asset_modified: false, verification_status: 'verified' };
  }

  async listInventoryLocks(input: AssetTagRequest) {
    const asset = await this.asset(input); const locks = await this.locks(input);
    return { asset_type: input.asset_type, asset_id: input.asset_id, asset_name: asset.name ?? null, locks, locked_fields: locks.map((row) => row.field), returned: locks.length, modifies_data: false };
  }

  async lockInventoryField(input: AssetInventoryLockRequest) {
    if (!LOCKABLE_FIELDS.has(input.field) && input.field !== `${input.asset_type.toLocaleLowerCase()}models_id` && input.field !== `${input.asset_type.toLocaleLowerCase()}types_id`) throw new Error(`Field ${input.field} is not in GLPI's audited inventory-lock allowlist`);
    const assetBefore = await this.asset(input); const matching = (await this.locks(input)).filter((row) => row.field === input.field);
    const local = matching.filter((row) => !enabled(row.is_global));
    if (local.length > 1) throw new Error('Ambiguous duplicate inventory field locks detected');
    if (matching.length) return { success: true, idempotent: true, action: 'already_locked', asset_type: input.asset_type, asset_id: input.asset_id, field: input.field, locks: matching, effective_scope: matching.some((row) => enabled(row.is_global)) ? 'global' : 'asset', asset_value_unchanged: true };
    const created = await this.client.createItem(LOCK, { itemtype: input.asset_type, items_id: input.asset_id, field: input.field, is_global: 0 });
    const lock = await this.client.getItem<Record<string, unknown>>(LOCK, created.id, { expand_dropdowns: false });
    const assetAfter = await this.asset(input);
    if (lock.itemtype !== input.asset_type || number(lock.items_id) !== input.asset_id || lock.field !== input.field || assetAfter[input.field] !== assetBefore[input.field]) throw new Error('Inventory field lock post-write verification failed');
    return { success: true, idempotent: false, action: 'locked', asset_type: input.asset_type, asset_id: input.asset_id, field: input.field, lock, field_value_before: assetBefore[input.field] ?? null, field_value_after: assetAfter[input.field] ?? null, asset_value_unchanged: true, verification_status: 'verified' };
  }

  async unlockInventoryField(input: AssetInventoryLockRequest) {
    const assetBefore = await this.asset(input); const matching = (await this.locks(input)).filter((row) => row.field === input.field);
    const global = matching.filter((row) => enabled(row.is_global)); const local = matching.filter((row) => !enabled(row.is_global));
    if (global.length) throw new Error(`Field ${input.field} is locked globally and cannot be unlocked for one asset`);
    if (local.length > 1) throw new Error('Ambiguous duplicate inventory field locks detected');
    if (!local.length) return { success: true, idempotent: true, action: 'already_unlocked', asset_type: input.asset_type, asset_id: input.asset_id, field: input.field, asset_value_unchanged: true };
    const lock = local[0];
    await this.client.deleteItem(LOCK, number(lock.id), true, false);
    const remaining = (await this.locks(input)).filter((row) => row.field === input.field);
    const assetAfter = await this.asset(input);
    if (remaining.length || assetAfter[input.field] !== assetBefore[input.field]) throw new Error('Inventory field unlock post-write verification failed');
    return { success: true, idempotent: false, action: 'unlocked', asset_type: input.asset_type, asset_id: input.asset_id, field: input.field, removed_lock: lock, field_value_before: assetBefore[input.field] ?? null, field_value_after: assetAfter[input.field] ?? null, asset_value_unchanged: true, verification_status: 'verified' };
  }
}
