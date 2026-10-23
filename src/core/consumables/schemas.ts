import { z } from 'zod';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selection = { consumable_item_id: id };
const units = z.array(id).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, 'Unit IDs must be unique');
export const consumableStockSchema = z.object({ ...selection, start: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(1000).default(100) }).strict();
export const consumableChangeSchema = z.discriminatedUnion('action', [
  z.object({ ...selection, action: z.literal('add_stock'), quantity: z.number().int().min(1).max(500) }).strict(),
  z.object({ ...selection, action: z.literal('assign'), consumable_ids: units, recipient_type: z.enum(['User', 'Group']), recipient_id: id, used_on: z.iso.date() }).strict(),
  z.object({ ...selection, action: z.literal('return_to_stock'), consumable_ids: units }).strict(),
]);
export const consumableApplySchema = z.object({ change: consumableChangeSchema, preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_CONSUMABLE_STOCK_CHANGE'), correlation_id: z.string().uuid() }).strict();
export type ConsumableChange = z.infer<typeof consumableChangeSchema>;
export type ConsumableApply = z.infer<typeof consumableApplySchema>;
export type ConsumableStockSelection = z.infer<typeof consumableStockSchema>;
