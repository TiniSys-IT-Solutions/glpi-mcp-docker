import { isIP } from 'node:net';
import { z } from 'zod';
import { assertCanonicalIPv4CIDR } from '../rules/types.js';

const id = z.number().int().min(1);
const cidr = z.string().trim().refine((value) => { try { assertCanonicalIPv4CIDR(value); return true; } catch { return false; } }, 'Expected canonical IPv4 CIDR');
const provisioningShape = {
  entity_id: z.number().int().min(0), parent_location_id: id, location_name: z.string().trim().min(1),
  network_name: z.string().trim().min(1), cidr, gateway: z.string().refine((value) => isIP(value) === 4, 'Expected IPv4 gateway'),
  is_recursive: z.boolean().default(false), addressable: z.boolean().default(true), discovery_task_id: id, discovery_job_id: id,
  inventory_task_id: id, inventory_job_id: id, source_ip_network_id: id.optional(), source_inventory_range_id: id.optional(),
  source_addressing_range_id: id.optional(), copy_snmp_credentials: z.boolean().default(false), copy_addressing_options: z.boolean().default(false),
  addressing_options: z.object({ use_as_filter: z.boolean().optional(), alloted_ip: z.boolean().optional(), double_ip: z.boolean().optional(), free_ip: z.boolean().optional(), reserved_ip: z.boolean().optional(), use_ping: z.boolean() }).strict(),
  rule_name: z.string().trim().min(1), rule_ranking: z.number().int().min(0).optional(), rule_scope_entity_id: z.number().int().min(0).default(0),
  rule_match: z.literal('OR').default('OR'), activate_rule: z.boolean().default(false), rule_activation_confirmation: z.literal('I_HAVE_VERIFIED_THE_RULE_ACTIVATION').optional(),
};
function validateProvisioning(value: { copy_snmp_credentials: boolean; source_inventory_range_id?: number; copy_addressing_options: boolean; source_addressing_range_id?: number; activate_rule: boolean; rule_activation_confirmation?: string }, context: z.RefinementCtx) {
  if (value.copy_snmp_credentials && value.source_inventory_range_id === undefined) context.addIssue({ code: 'custom', path: ['source_inventory_range_id'], message: 'Required when copy_snmp_credentials is true' });
  if (value.copy_addressing_options && value.source_addressing_range_id === undefined) context.addIssue({ code: 'custom', path: ['source_addressing_range_id'], message: 'Required when copy_addressing_options is true' });
  if (value.activate_rule && !value.rule_activation_confirmation) context.addIssue({ code: 'custom', path: ['rule_activation_confirmation'], message: 'Explicit rule activation confirmation is required' });
}
export const siteNetworkProvisioningSchema = z.object(provisioningShape).strict().superRefine(validateProvisioning);
export const siteNetworkProvisioningApplySchema = z.object({ ...provisioningShape,
  preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN'),
}).strict().superRefine(validateProvisioning);
