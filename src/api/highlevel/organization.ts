import { OrganizationService } from '../../core/organization/service.js';
import { EntityCreateRequest, LocationCreateRequest, OrganizationListRequest } from '../../core/organization/types.js';
import { HighLevelClient } from './client.js';

function query(input: OrganizationListRequest): string {
  const params = new URLSearchParams();
  params.set('start', String(input.start ?? 0));
  params.set('limit', String(input.limit ?? 50));
  if (input.sort) params.set('sort', input.sort);
  if (input.order) params.set('order', input.order);
  return params.toString();
}

function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function createdResource(resource: unknown): Record<string, unknown> {
  return resource && typeof resource === 'object'
    ? { success: true, ...(resource as Record<string, unknown>) }
    : { success: true, resource };
}

export function mapHighLevelLocation(input: LocationCreateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    code: input.code,
    alias: input.alias,
    comment: input.comment,
    entity: input.entityId === undefined ? undefined : { id: input.entityId },
    is_recursive: input.recursive,
    parent: input.parentLocationId === undefined ? undefined : { id: input.parentLocationId },
    room: input.room,
    building: input.building,
    address: input.address,
    town: input.town,
    postcode: input.postcode,
    state: input.state,
    country: input.country,
    latitude: input.latitude === undefined ? undefined : String(input.latitude),
    longitude: input.longitude === undefined ? undefined : String(input.longitude),
    altitude: input.altitude === undefined ? undefined : String(input.altitude),
  });
}

export function mapHighLevelEntity(input: EntityCreateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    parent: input.parentEntityId === undefined ? undefined : { id: input.parentEntityId },
    comment: input.comment,
    registration_number: input.registrationNumber,
    address: input.address,
    postcode: input.postcode,
    city: input.town,
    state: input.state,
    country: input.country,
    latitude: input.latitude === undefined ? undefined : String(input.latitude),
    longitude: input.longitude === undefined ? undefined : String(input.longitude),
    altitude: input.altitude === undefined ? undefined : String(input.altitude),
    website: input.website,
    phone: input.phone,
    fax: input.fax,
    email: input.email,
  });
}

export class HighLevelOrganizationService implements OrganizationService {
  constructor(private readonly client: HighLevelClient) {}

  listLocations(input: OrganizationListRequest) { return this.client.request(`Dropdown/Location?${query(input)}`); }
  getLocation(id: number) { return this.client.request(`Dropdown/Location/${id}`); }
  async createLocation(input: LocationCreateRequest) { return createdResource(await this.client.request('Dropdown/Location', jsonPost(mapHighLevelLocation(input)))); }
  listEntities(input: OrganizationListRequest) { return this.client.request(`Administration/Entity?${query(input)}`); }
  getEntity(id: number) { return this.client.request(`Administration/Entity/${id}`); }
  async createEntity(input: EntityCreateRequest) { return createdResource(await this.client.request('Administration/Entity', jsonPost(mapHighLevelEntity(input)))); }
}
