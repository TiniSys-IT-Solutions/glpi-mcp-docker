import { z } from 'zod';

export const DELETABLE_OBJECT_TYPES = ['Problem', 'Change', 'Project', 'IPNetwork', 'PluginGlpiinventoryIPRange', 'NetworkName'] as const;
export const deletionPreviewSchema = z.object({ itemtype: z.enum(DELETABLE_OBJECT_TYPES), id: z.number().int().positive() }).strict();
export const DELETE_CONFIRMATION = 'I_HAVE_VERIFIED_THE_OBJECT_DELETE';
export const deletionApplySchema = deletionPreviewSchema.extend({
  preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal(DELETE_CONFIRMATION), correlation_id: z.string().uuid(),
}).strict();
export type DeletionSelection = z.infer<typeof deletionPreviewSchema>;
export type DeletionApply = z.infer<typeof deletionApplySchema>;
export interface ObjectDeletionService {
  preview(input: DeletionSelection): Promise<unknown>;
  delete(input: DeletionApply): Promise<unknown>;
}
