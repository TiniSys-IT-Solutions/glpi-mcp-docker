import { z } from 'zod'; import { COMPONENT_ASSET_TYPES, COMPONENT_TYPES } from './types.js';
const id=z.number().int().min(1); const component=z.enum(COMPONENT_TYPES); const asset=z.object({itemtype:z.enum(COMPONENT_ASSET_TYPES),asset_id:id,component_type:component});
const fields=z.record(z.string(),z.unknown()).default({});
export const componentListSchema=asset.strict();
export const componentUsageSchema=z.object({component_type:component,component_id:id}).strict();
export const componentAttachSchema=asset.extend({component_id:id,fields,correlation_id:z.string().uuid()}).strict();
export const componentRelationUpdateSchema=z.object({component_type:component,relation_id:id,expected_asset_id:id.optional(),fields:z.record(z.string(),z.unknown()).refine(v=>Object.keys(v).length>0),correlation_id:z.string().uuid()}).strict();
export const componentDetachPreviewSchema=z.object({component_type:component,relation_id:id}).strict();
export const componentDetachSchema=componentDetachPreviewSchema.extend({preview_fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.literal('I_HAVE_VERIFIED_THE_COMPONENT_DETACH'),correlation_id:z.string().uuid()}).strict();
