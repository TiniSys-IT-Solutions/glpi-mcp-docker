import { isIP } from 'node:net';
import { z } from 'zod';

const positiveId = z.number().int().positive();
export const reservationAssetTypes = ['Computer', 'Monitor', 'NetworkEquipment', 'Peripheral', 'Phone', 'Printer'] as const;
const addressFields = { range_id: positiveId, ip: z.string().refine((ip) => isIP(ip) === 4, 'A canonical IPv4 address is required') };
export const addressingReportSchema = z.object({ range_id: positiveId, start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(50) }).strict();
export const addressingCommentSchema = z.object({ ...addressFields, comment: z.string().max(65535), expected_comment: z.string().max(65535) }).strict();
export const addressingReservationPreviewSchema = z.object({ ...addressFields, asset_type: z.enum(reservationAssetTypes), asset_id: positiveId, mac: z.string().regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/).optional(), fqdn_id: z.number().int().min(0).optional() }).strict();
export const addressingReservationApplySchema = addressingReservationPreviewSchema.extend({ preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_ADDRESSING_RESERVATION') });
export type AddressingReportRequest = z.infer<typeof addressingReportSchema>;
export type AddressingCommentRequest = z.infer<typeof addressingCommentSchema>;
export type AddressingReservationPreviewRequest = z.infer<typeof addressingReservationPreviewSchema>;
export type AddressingReservationApplyRequest = z.infer<typeof addressingReservationApplySchema>;
