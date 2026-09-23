import { z } from 'zod';
import { CATALOG_DOMAINS, CATALOG_ITEMTYPES, CatalogDomain } from './types.js';

const id = z.number().int().min(1);
const selection = z.object({ domain: z.enum(CATALOG_DOMAINS), itemtype: z.string().min(1) });
function allowed(value: { domain: CatalogDomain; itemtype: string }, context: z.RefinementCtx): void {
  if (!CATALOG_ITEMTYPES[value.domain].includes(value.itemtype)) context.addIssue({ code: 'custom', path: ['itemtype'], message: `${value.itemtype} is not allowed in catalog domain ${value.domain}` });
}
export const catalogListSchema = selection.extend({ start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(10000).default(100), fetch_all: z.boolean().default(false), include_deleted: z.boolean().default(false) }).strict().superRefine(allowed);
export const catalogGetSchema = selection.extend({ id }).strict().superRefine(allowed);
const fields = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, 'fields must not be empty');
export const catalogCreateSchema = selection.extend({ fields, correlation_id: z.string().uuid() }).strict().superRefine(allowed);
export const catalogUpdateSchema = selection.extend({ id, fields, correlation_id: z.string().uuid() }).strict().superRefine(allowed);
export const catalogDeletePreviewSchema = selection.extend({ id, purge: z.boolean().default(false) }).strict().superRefine(allowed);
export const catalogDeleteSchema = selection.extend({ id, purge: z.boolean().default(false), preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.enum(['I_HAVE_VERIFIED_THE_CATALOG_DELETE', 'I_HAVE_VERIFIED_THE_CATALOG_PURGE']), correlation_id: z.string().uuid() }).strict().superRefine((value, context) => {
  allowed(value, context);
  if (value.purge && value.confirmation !== 'I_HAVE_VERIFIED_THE_CATALOG_PURGE') context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Purge requires the purge confirmation phrase' });
  if (!value.purge && value.confirmation !== 'I_HAVE_VERIFIED_THE_CATALOG_DELETE') context.addIssue({ code: 'custom', path: ['confirmation'], message: 'Soft delete requires the delete confirmation phrase' });
});
