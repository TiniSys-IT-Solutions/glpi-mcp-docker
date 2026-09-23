import { z } from 'zod';
import { MANAGED_ASSET_TYPES } from './types.js';

const id = z.number().int().min(1);
export const unmanagedAuditSchema = z.object({
  entity_id: z.number().int().min(0).optional(), recursive: z.boolean().default(false),
  unmanaged_ids: z.array(id).min(1).max(5000).transform((v) => [...new Set(v)]).optional(),
  created_from: z.string().min(1).optional(), modified_from: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(10000).default(100), fetch_all: z.boolean().default(false),
  max_rows: z.number().int().min(1).max(50000).default(10000),
  include_computers: z.boolean().default(true), include_printers: z.boolean().default(true),
  include_network_equipment: z.boolean().default(true), include_phones: z.boolean().default(true),
  include_peripherals: z.boolean().default(false),
  minimum_confidence: z.enum(['low', 'medium', 'high']).default('low'), include_unmatched: z.boolean().default(true),
  only_exact_duplicates: z.boolean().default(false), only_managed_matches: z.boolean().default(false),
  only_internal_unmanaged_duplicates: z.boolean().default(false), itemtype_candidates: z.array(z.enum(MANAGED_ASSET_TYPES)).min(1).optional(),
  has_sysdescr: z.boolean().optional(), has_ip: z.boolean().optional(), has_mac: z.boolean().optional(), has_serial: z.boolean().optional(),
  generic_names_policy: z.enum(['include', 'exclude', 'only']).default('include'), include_evidence: z.boolean().default(true),
  include_raw_fields: z.boolean().default(false), start: z.number().int().min(0).default(0),
}).strict();

export const unmanagedApplySchema = z.object({
  actions: z.array(z.object({ unmanaged_id: id, action: z.enum([
    'link_to_existing_asset', 'convert_to_computer', 'convert_to_printer', 'convert_to_network_equipment',
    'convert_to_phone', 'keep_unmanaged', 'ignore_future_discovery', 'delete_duplicate_unmanaged', 'manual_review',
  ]), destination_itemtype: z.enum(MANAGED_ASSET_TYPES).optional(), destination_id: id.optional() }).strict()).min(1).max(500),
  dry_run: z.boolean().default(true), confirmation: z.literal('I_HAVE_VERIFIED_THE_UNMANAGED_RECONCILIATION').optional(),
  correlation_id: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  if (!value.dry_run && value.confirmation !== 'I_HAVE_VERIFIED_THE_UNMANAGED_RECONCILIATION') {
    context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Live reconciliation requires explicit confirmation' });
  }
});
