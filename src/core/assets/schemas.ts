import { z } from 'zod';

const referenceId = z.number().int().min(0);
const clearableString = z.string().nullable().optional();

export const printerUpdateSchema = z.object({
  id: z.number().int().min(1),
  entity_id: referenceId.optional(),
  location_id: referenceId.optional(),
  name: z.string().trim().min(1).optional(),
  serial: clearableString,
  inventory_number: clearableString,
  comment: clearableString,
  state_id: referenceId.optional(),
  manufacturer_id: referenceId.optional(),
  model_id: referenceId.optional(),
  printer_type_id: referenceId.optional(),
  network_id: referenceId.optional(),
  assigned_user_id: referenceId.optional(),
  assigned_technician_id: referenceId.optional(),
  contact: clearableString,
  contact_number: clearableString,
  memory_size: z.number().int().min(0).optional(),
  is_recursive: z.boolean().optional(),
  is_global: z.boolean().optional(),
}).strict().refine(
  (input) => Object.entries(input).some(([key, value]) => key !== 'id' && value !== undefined),
  'At least one printer field must be provided',
);

export const appendPrinterCommentSchema = z.object({
  printer_id: z.number().int().min(1),
  text: z.string().refine((value) => value.trim().length > 0, 'text must not be blank'),
  separator: z.string().optional().default('\n'),
}).strict();

export const reassignPrintersSchema = z.object({
  printer_ids: z.array(z.number().int().min(1)).min(1).optional()
    .transform((ids) => ids === undefined ? undefined : [...new Set(ids)]),
  dry_run: z.boolean().default(true),
  preserve_previous_location_in_comment: z.boolean().default(true),
  comment_prefix: z.string().default('Ancien lieu GLPI : '),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN').optional(),
}).strict().superRefine((input, context) => {
  if (!input.dry_run && input.confirmation !== 'I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmation'],
      message: 'confirmation must be I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN when dry_run=false',
    });
  }
});
