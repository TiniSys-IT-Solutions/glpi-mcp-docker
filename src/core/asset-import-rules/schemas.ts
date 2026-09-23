import { z } from 'zod';
import { ASSET_IMPORT_ITEMTYPES } from './types.js';

const id = z.number().int().min(1);
const nativeRecord = z.record(z.string(), z.unknown());
export const assetRuleListSchema = z.object({
  active_only: z.boolean().optional(), itemtype_filter: z.enum(ASSET_IMPORT_ITEMTYPES).optional(),
  include_criteria: z.boolean().default(false), include_actions: z.boolean().default(false), fetch_all: z.boolean().default(false),
  start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(500).default(50),
}).strict();
export const assetRuleGetSchema = z.object({ rule_id: id }).strict();
export const assetRuleSnapshotSchema = z.object({
  schema_version: z.literal(1), source: z.object({ glpi_version: z.string().nullable(), api_mode: z.enum(['legacy', 'highlevel']) }).strict(),
  rules: z.array(nativeRecord), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), captured_at: z.string().optional(),
  fingerprint_scope: z.string().optional(), modifies_data: z.boolean().optional(),
}).strict();
const compressedSnapshot = z.string().min(1).max(3_000_000);
export const assetRuleDiffSchema = z.object({
  snapshot_before: assetRuleSnapshotSchema.optional(), snapshot_before_gzip_base64: compressedSnapshot.optional(),
  snapshot_after: assetRuleSnapshotSchema.optional(), snapshot_after_gzip_base64: compressedSnapshot.optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.snapshot_before) === Boolean(value.snapshot_before_gzip_base64)) context.addIssue({ code: 'custom', message: 'Provide exactly one snapshot_before representation' });
  if (Boolean(value.snapshot_after) === Boolean(value.snapshot_after_gzip_base64)) context.addIssue({ code: 'custom', message: 'Provide exactly one snapshot_after representation' });
});
const assetRuleRestoreBaseSchema = z.object({
  snapshot: assetRuleSnapshotSchema.optional(), snapshot_gzip_base64: compressedSnapshot.optional(), restore_mode: z.enum(['exact', 'merge']), allow_create: z.boolean().default(false),
  allow_update: z.boolean().default(false), allow_disable: z.boolean().default(false), allow_delete: z.boolean().default(false),
}).strict();
const oneSnapshot = (value: { snapshot?: unknown; snapshot_gzip_base64?: string }) => Boolean(value.snapshot) !== Boolean(value.snapshot_gzip_base64);
export const assetRuleRestorePreviewSchema = assetRuleRestoreBaseSchema.refine(oneSnapshot, 'Provide exactly one snapshot representation');
export const assetRuleRestoreApplySchema = assetRuleRestoreBaseSchema.extend({
  preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_ASSET_IMPORT_RULE_RESTORE'), correlation_id: z.string().uuid(),
}).refine(oneSnapshot, 'Provide exactly one snapshot representation');
export const assetRuleSimulationSchema = z.object({
  unmanaged_ids: z.array(id).min(1).max(5000).optional(), inventory_payload: nativeRecord.optional(),
  snapshot: assetRuleSnapshotSchema.optional(), stop_at_first_match: z.boolean().default(true),
}).strict().refine((value) => Boolean(value.unmanaged_ids?.length || value.inventory_payload), 'Provide unmanaged_ids or inventory_payload');
export const assetRuleRiskSchema = z.object({ snapshot: assetRuleSnapshotSchema.optional() }).strict();
