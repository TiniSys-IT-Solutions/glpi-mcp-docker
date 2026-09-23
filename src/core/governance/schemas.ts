import { z } from 'zod';
import { ASSET_RELATION_KINDS, GOVERNANCE_AUDITS, RELATION_ASSET_TYPES } from './types.js';
import { CATALOG_ITEMTYPES } from '../catalog/types.js';

const asset = z.object({ itemtype: z.enum(RELATION_ASSET_TYPES), asset_id: z.number().int().min(1) });
export const assetRelationListSchema = asset.extend({ relation: z.enum(ASSET_RELATION_KINDS) }).strict();
export const assetRelationAttachSchema = asset.extend({ relation: z.enum(ASSET_RELATION_KINDS), related_id: z.number().int().min(1), correlation_id: z.string().uuid() }).strict();
export const assetRelationDetachPreviewSchema = z.object({ relation: z.enum(ASSET_RELATION_KINDS), relation_id: z.number().int().min(1) }).strict();
export const assetRelationDetachSchema = assetRelationDetachPreviewSchema.extend({ preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('I_HAVE_VERIFIED_THE_RELATION_DETACH'), correlation_id: z.string().uuid() }).strict();
export const dropdownUsageSchema = z.object({ itemtype: z.enum(CATALOG_ITEMTYPES.dropdown as [string, ...string[]]), id: z.number().int().min(1), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(10000).default(100) }).strict();
export const governanceAuditSchema = z.object({ audit: z.enum(GOVERNANCE_AUDITS), itemtypes: z.array(z.enum(RELATION_ASSET_TYPES)).max(20).optional(), entity_id: z.number().int().min(0).optional(), days: z.number().int().min(0).max(3650).default(90), required_fields: z.array(z.string().min(1)).max(30).optional(), limit: z.number().int().min(1).max(50000).default(10000) }).strict();
