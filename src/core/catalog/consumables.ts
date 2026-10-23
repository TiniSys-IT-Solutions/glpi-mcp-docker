import { z } from 'zod';

export const CONSUMABLE_ITEMTYPES = ['ConsumableItemType', 'ConsumableItem'] as const;
export function isConsumableDefinition(itemtype: string): boolean {
  return (CONSUMABLE_ITEMTYPES as readonly string[]).includes(itemtype);
}

const name = z.string().trim().min(1).max(255);
const id = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const typeFields = z.object({ name: name.optional(), comment: z.string().optional() }).strict();
const itemFields = typeFields.extend({
  ref: z.string().trim().max(255).optional(),
  entities_id: id.optional(),
  consumableitemtypes_id: id.optional(),
  manufacturers_id: id.optional(),
  locations_id: id.optional(),
  users_id: id.optional(),
  users_id_tech: id.optional(),
  is_recursive: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((value) => value ? 1 : 0).optional(),
  otherserial: z.string().trim().max(255).optional(),
  alarm_threshold: z.number().int().min(-1).max(2147483647).optional(),
  stock_target: z.number().int().nonnegative().max(2147483647).optional(),
}).strict();

/** Native Legacy fields only. Model, quantity and plugin fields are not columns
 * of a consumable definition and must never disappear silently at GLPI. */
export function consumableFields(itemtype: string, fields: Record<string, unknown>, create: boolean): Record<string, unknown> {
  const parsed = (itemtype === 'ConsumableItemType' ? typeFields : itemFields).parse(fields);
  if (Object.keys(parsed).length === 0) throw new Error('Consumable fields must not be empty');
  if (create && parsed.name === undefined) throw new Error('Consumable creation requires name');
  if (itemtype === 'ConsumableItem' && create) {
    const item = parsed as z.infer<typeof itemFields>;
    if (item.entities_id === undefined) throw new Error('Consumable creation requires an explicit entities_id (0 is allowed)');
    if (!item.consumableitemtypes_id) throw new Error('Consumable creation requires a positive consumableitemtypes_id');
    if ((item.stock_target ?? 0) > 0 && item.alarm_threshold === undefined) throw new Error('Positive stock_target requires an explicit alarm_threshold at creation; GLPI defaults must not be guessed');
  }
  return parsed;
}

export function validateConsumableStockPolicy(fields: Record<string, unknown>): void {
  const threshold = Number(fields.alarm_threshold ?? -1);
  const target = Number(fields.stock_target ?? 0);
  // GLPI uses zero as an unset stock target and -1 to disable the alert.
  if (target > 0 && threshold >= 0 && target < threshold) throw new Error('stock_target must be zero (unset) or at least alarm_threshold');
}

export function normalizeConsumableName(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}
