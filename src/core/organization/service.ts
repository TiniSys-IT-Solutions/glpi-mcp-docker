import { EntityCreateRequest, LocationCreateRequest, OrganizationListRequest } from './types.js';

export interface OrganizationService {
  listLocations(input: OrganizationListRequest): Promise<unknown>;
  getLocation(id: number): Promise<unknown>;
  createLocation(input: LocationCreateRequest): Promise<unknown>;
  listEntities(input: OrganizationListRequest): Promise<unknown>;
  getEntity(id: number): Promise<unknown>;
  createEntity(input: EntityCreateRequest): Promise<unknown>;
}
