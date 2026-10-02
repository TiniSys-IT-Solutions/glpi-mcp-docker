import { z } from 'zod';
import { TAGGABLE_ASSET_TYPES } from './types.js';

const id = z.number().int().min(1);
export const taggableAssetTypeSchema = z.enum(TAGGABLE_ASSET_TYPES);
export const tagListSchema = z.object({
  query: z.string().trim().min(1).max(255).optional(),
  active_only: z.boolean().default(true),
  start: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(100),
}).strict();
export const assetTagSchema = z.object({ asset_type: taggableAssetTypeSchema, asset_id: id }).strict();
export const assetTagChangeSchema = assetTagSchema.extend({ tag_id: id }).strict();
export const assetTagDetachSchema = assetTagChangeSchema.extend({
  confirmation: z.literal('I_HAVE_VERIFIED_THE_TAG_DETACH'),
}).strict();
export const assetInventoryLockSchema = assetTagSchema.extend({
  field: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/i),
}).strict();
