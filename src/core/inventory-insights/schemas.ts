import { z } from 'zod';

const id = z.number().int().min(1);
export const fortigateAuditSchema = z.object({
  entity_id: z.number().int().min(0).optional(), unmanaged_ids: z.array(id).min(1).max(5000).optional(),
  network_equipment_ids: z.array(id).min(1).max(5000).optional(),
  cluster_identity: z.enum(['shared_ip', 'shared_mac', 'cluster_name']).default('cluster_name'),
  member_identity: z.literal('serial').default('serial'), allow_shared_mac_for_member_linking: z.boolean().default(false),
  virtual_mac_prefixes: z.array(z.string().min(1)).max(100).default(['00:00:5e:00:01']),
}).strict();
export const provenanceSchema = z.object({ itemtype: z.enum(['Computer', 'Printer', 'NetworkEquipment', 'Phone', 'Peripheral']), asset_id: id }).strict();
export const rawPayloadSchema = provenanceSchema.extend({ inventory_id: id.optional() });
export const taskIdSchema = z.object({ task_id: id }).strict();
export const taskReprepareSchema = z.object({ task_id: id, enabled: z.boolean(), expected_current_state: z.boolean(), confirmation: z.literal('I_HAVE_VERIFIED_THE_INVENTORY_TASK') }).strict();
export const taskPrepareOnceSchema = z.object({ task_id: id, confirmation: z.literal('I_HAVE_VERIFIED_THE_INVENTORY_TASK') }).strict();
export const taskTimelineSchema = z.object({ task_id: id.optional(), job_id: id.optional(), agent_id: id.optional(), date_from: z.string().optional(), date_to: z.string().optional(), state: z.union([z.string(), z.number()]).optional(), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(10000).default(100) }).strict();
export const discoveryClassifySchema = z.object({ unmanaged_ids: z.array(id).min(1).max(5000).optional(), entity_id: z.number().int().min(0).optional(), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(10000).default(100), include_evidence: z.boolean().default(true) }).strict();
export const assetNetworkIdentitySchema = z.object({ itemtype: z.enum(['Computer', 'Printer', 'NetworkEquipment', 'Phone', 'Peripheral', 'Monitor', 'Unmanaged']), asset_id: id, include_raw: z.boolean().default(false) }).strict();
