import { EntityCreateRequest, EntityUpdateRequest, LocationCreateRequest, LocationUpdateRequest, OrganizationListRequest } from './types.js';

export interface OrganizationService {
  listLocations(input: OrganizationListRequest): Promise<unknown>;
  getLocation(id: number): Promise<unknown>;
  createLocation(input: LocationCreateRequest): Promise<unknown>;
  updateLocation(id: number, input: LocationUpdateRequest): Promise<unknown>;
  listEntities(input: OrganizationListRequest): Promise<unknown>;
  getEntity(id: number): Promise<unknown>;
  createEntity(input: EntityCreateRequest): Promise<unknown>;
  updateEntity(id: number, input: EntityUpdateRequest): Promise<unknown>;
}
