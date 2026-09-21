import { z } from 'zod';

const positiveId = z.number().int().min(1);
const ipNetworkIds = z.array(positiveId).min(1).max(1000).refine(
  (ids) => new Set(ids).size === ids.length,
  { message: 'ip_network_ids must not contain duplicates' },
);
const optionFields = { use_as_filter: z.boolean().optional(), alloted_ip: z.boolean().optional(), double_ip: z.boolean().optional(), free_ip: z.boolean().optional(), reserved_ip: z.boolean().optional(), use_ping: z.boolean().optional() };
const overrideSchema = z.object({ location_id: z.number().int().min(0).optional(), network_id: z.number().int().min(0).optional(), vlan_id: z.number().int().min(0).optional(), fqdn_id: z.number().int().min(0).optional(), name: z.string().min(1).optional(), comment: z.string().optional(), ...optionFields }).strict();
export const addressingListSchema = z.object({ entity_id: z.number().int().min(0).optional(), location_id: z.number().int().min(0).optional(), network_id: z.number().int().min(0).optional(), vlan_id: z.number().int().min(0).optional(), ip_network_id: positiveId.optional(), include_deleted: z.boolean().optional(), start: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(1000).optional() }).strict();
export const addressingPreviewSchema = z.object({ ip_network_ids: ipNetworkIds.optional(), entity_id: z.number().int().min(0).optional(), only_addressable: z.boolean().optional(), range_policy: z.enum(['usable_hosts', 'full_cidr']).optional(), match_location: z.boolean().optional(), match_network: z.boolean().optional(), match_vlan: z.boolean().optional(), match_fqdn: z.boolean().optional(), adopt_exact_matches: z.boolean().optional(), defaults: z.object(optionFields).strict().optional(), overrides_by_ip_network_id: z.record(z.string().regex(/^\d+$/), overrideSchema).optional(), start: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(1000).optional() }).strict();
export const addressingApplySchema = addressingPreviewSchema.extend({ ip_network_ids: ipNetworkIds, preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_ADDRESSING_SYNC'), allow_create: z.boolean().optional(), allow_update: z.boolean().optional(), update_inferred_metadata: z.boolean().optional() });
