import { z } from 'zod';

const nonBlankPreserved = (label: string) => z.string().refine(
  (value) => value.trim().length > 0,
  `${label} must not be blank`
);

export const entityCreateSchema = z.object({
  name: z.string().trim().min(1),
  parent_entity_id: z.number().int().min(0).optional(),
  comment: z.string().optional(),
  registration_number: z.string().optional(),
  ldap_dn: nonBlankPreserved('LDAP DN').optional(),
  ldap_filter: nonBlankPreserved('LDAP filter').optional(),
  ldap_directory_id: z.number().int().min(0).optional(),
  inventory_tag: nonBlankPreserved('Inventory tag').optional(),
  address: z.string().optional(),
  postcode: z.string().optional(),
  town: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  altitude: z.number().optional(),
  website: z.string().url().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional(),
});

const clearableNonBlankString = z.union([nonBlankPreserved('Value'), z.null()]);

export const entityUpdateSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().trim().min(1).optional(),
  parent_entity_id: z.number().int().min(0).optional(),
  comment: z.string().nullable().optional(),
  registration_number: z.string().nullable().optional(),
  ldap_dn: clearableNonBlankString.optional(),
  ldap_filter: clearableNonBlankString.optional(),
  ldap_directory_id: z.number().int().min(0).optional(),
  inventory_tag: clearableNonBlankString.optional(),
  address: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  town: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  altitude: z.number().nullable().optional(),
  website: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  fax: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
}).refine(
  (input) => Object.entries(input).some(([key, value]) => key !== 'id' && value !== undefined),
  'At least one entity field must be provided'
);
