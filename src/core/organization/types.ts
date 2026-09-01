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
