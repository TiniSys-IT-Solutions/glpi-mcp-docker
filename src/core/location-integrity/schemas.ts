import { z } from 'zod';
import { LOCATION_ASSET_TYPES } from './types.js';

const id = z.number().int().min(1);
const referenceId = z.number().int().min(0);
const clearable = z.string().nullable().optional();

export const assetLocationUpdateSchema = z.object({
  id,
  location_id: referenceId.optional(), entity_id: referenceId.optional(),
  name: z.string().trim().min(1).optional(), serial: clearable,
  inventory_number: clearable, comment: clearable, state_id: referenceId.optional(),
  manufacturer_id: referenceId.optional(), model_id: referenceId.optional(), type_id: referenceId.optional(),
  assigned_user_id: referenceId.optional(), assigned_technician_id: referenceId.optional(),
  contact: clearable, contact_number: clearable, is_recursive: z.boolean().optional(),
  correlation_id: z.string().uuid().optional(),
}).strict().refine(({ id: _id, correlation_id: _correlationId, ...updates }) => Object.values(updates).some((value) => value !== undefined), {
  message: 'At least one field to update is required',
});

export const locationMappingSchema = z.object({
  mapping: z.array(z.object({ old_location_id: id, new_location_id: id }).strict()).min(1).max(1000),
  itemtypes: z.array(z.enum(LOCATION_ASSET_TYPES)).min(1).transform((values) => [...new Set(values)]),
  dry_run: z.boolean().default(true), batch_size: z.number().int().min(1).max(500).default(50),
  continue_on_error: z.boolean().default(false), correlation_id: z.string().uuid().optional(),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_ASSET_LOCATION_MAPPING').optional(),
}).strict().superRefine((value, context) => {
  const sources = value.mapping.map((entry) => entry.old_location_id);
  if (new Set(sources).size !== sources.length) context.addIssue({ code: 'custom', path: ['mapping'], message: 'old_location_id values must be unique' });
  if (!value.dry_run && value.confirmation !== 'I_HAVE_VERIFIED_THE_ASSET_LOCATION_MAPPING') {
    context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Live reassignment requires I_HAVE_VERIFIED_THE_ASSET_LOCATION_MAPPING' });
  }
});

export const deleteLocationSchema = z.object({
  location_id: id, dry_run: z.boolean().default(true), purge: z.boolean().default(false),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_LOCATION_DELETION').optional(),
}).strict().superRefine((value, context) => {
  if (!value.dry_run && value.confirmation !== 'I_HAVE_VERIFIED_THE_LOCATION_DELETION') context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Live deletion requires I_HAVE_VERIFIED_THE_LOCATION_DELETION' });
});

export const deleteLocationsSchema = z.object({
  location_ids: z.array(id).min(1).max(1000).transform((values) => [...new Set(values)]),
  dry_run: z.boolean().default(true), purge: z.boolean().default(false),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_LOCATION_DELETION').optional(),
}).strict().superRefine((value, context) => {
  if (!value.dry_run && value.confirmation !== 'I_HAVE_VERIFIED_THE_LOCATION_DELETION') context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Live deletion requires I_HAVE_VERIFIED_THE_LOCATION_DELETION' });
});
