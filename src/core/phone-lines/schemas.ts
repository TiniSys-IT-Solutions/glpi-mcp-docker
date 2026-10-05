import { z } from 'zod';

const id = z.number().int().positive();
const ref = z.number().int().min(0);
export const PHONE_LINE_ITEMTYPES = ['Computer', 'Peripheral', 'Phone', 'NetworkEquipment', 'Printer'] as const;
const fields = {
  name: z.string().trim().min(1).max(255).optional(), caller_number: z.string().max(255).optional(), caller_name: z.string().max(255).optional(),
  entity_id: ref.optional(), is_recursive: z.boolean().optional(), location_id: ref.optional(), state_id: ref.optional(), type_id: ref.optional(), operator_id: ref.optional(),
  assigned_user_id: ref.optional(), assigned_technician_id: ref.optional(), group_ids: z.array(id).max(100).optional(), technician_group_ids: z.array(id).max(100).optional(), comment: z.string().max(65535).optional(),
};
export const phoneLineListSchema = z.object({ entity_id: ref.optional(), location_id: ref.optional(), state_id: ref.optional(), type_id: ref.optional(), operator_id: ref.optional(), assigned_user_id: ref.optional(), assigned_technician_id: ref.optional(), caller_number: z.string().max(255).optional(), text_search: z.string().max(255).optional(), include_deleted: z.boolean().default(false), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(50) }).strict();
export const phoneLineIdSchema = z.object({ line_id: id }).strict();
export const phoneLineCreateSchema = z.object({ ...fields, name: fields.name.unwrap(), entity_id: ref }).strict();
export const phoneLineUpdateSchema = z.object({ line_id: id, ...fields }).strict().refine(({ line_id: _id, ...updates }) => Object.values(updates).some((v) => v !== undefined), 'At least one line field is required');
export const phoneLineCommentSchema = z.object({ line_id: id, text: z.string().trim().min(1).max(32000), expected_comment: z.string().max(65535) }).strict();
export const phoneLineItemSchema = z.object({ itemtype: z.enum(PHONE_LINE_ITEMTYPES), item_id: id }).strict();
export const phoneLineAttachSchema = phoneLineItemSchema.extend({ line_id: id }).strict();
export const phoneLineDetachPreviewSchema = z.object({ relation_id: id }).strict();
export const phoneLineDetachSchema = phoneLineDetachPreviewSchema.extend({ preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_PHONE_LINE_DETACH') }).strict();
export const phoneLineSimPreviewSchema = z.object({ simcard_relation_id: id, line_id: ref }).strict();
export const phoneLineSimApplySchema = phoneLineSimPreviewSchema.extend({ preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_SIMCARD_PHONE_LINE') }).strict();
export const phoneLineAuditSchema = z.object({ entity_id: ref.optional() }).strict();
export type PhoneLineListRequest = z.input<typeof phoneLineListSchema>;
export type PhoneLineCreateRequest = z.input<typeof phoneLineCreateSchema>;
export type PhoneLineUpdateRequest = z.input<typeof phoneLineUpdateSchema>;
export type PhoneLineCommentRequest = z.input<typeof phoneLineCommentSchema>;
export type PhoneLineItemRequest = z.input<typeof phoneLineItemSchema>;
export type PhoneLineAttachRequest = z.input<typeof phoneLineAttachSchema>;
export type PhoneLineDetachRequest = z.input<typeof phoneLineDetachSchema>;
export type PhoneLineSimPreviewRequest = z.input<typeof phoneLineSimPreviewSchema>;
export type PhoneLineSimApplyRequest = z.input<typeof phoneLineSimApplySchema>;
