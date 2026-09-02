export interface OrganizationListRequest {
  start?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface LocationCreateRequest {
  name: string;
  code?: string;
  alias?: string;
  comment?: string;
  entityId?: number;
  recursive?: boolean;
  parentLocationId?: number;
  room?: string;
  building?: string;
  address?: string;
  town?: string;
  postcode?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface EntityCreateRequest {
  name: string;
  parentEntityId?: number;
  comment?: string;
  registrationNumber?: string;
  ldapDn?: string;
  ldapFilter?: string;
  ldapDirectoryId?: number;
  inventoryTag?: string;
  address?: string;
  postcode?: string;
  town?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  website?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

/**
 * Partial entity update. Undefined means "leave unchanged"; null on an
 * optional string means "clear the GLPI field".
 */
export interface EntityUpdateRequest {
  name?: string;
  parentEntityId?: number;
  comment?: string | null;
  registrationNumber?: string | null;
  ldapDn?: string | null;
  ldapFilter?: string | null;
  /** 0 removes the entity-specific directory and lets GLPI use its default. */
  ldapDirectoryId?: number;
  inventoryTag?: string | null;
  address?: string | null;
  postcode?: string | null;
  town?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  website?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
}
