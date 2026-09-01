import { OrganizationService } from '../../core/organization/service.js';
import { EntityCreateRequest, LocationCreateRequest, OrganizationListRequest } from '../../core/organization/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

function listOptions(input: OrganizationListRequest): ListOptions {
  const start = input.start ?? 0;
  const limit = input.limit ?? 50;
  return {
    range: `${start}-${start + limit - 1}`,
    sort: input.sort === undefined ? undefined : Number(input.sort),
    order: input.order ?? 'ASC',
    expand_dropdowns: true,
  };
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function createdResource(resource: unknown, id: number): Record<string, unknown> {
  return resource && typeof resource === 'object'
    ? { success: true, ...(resource as Record<string, unknown>) }
    : { success: true, id, resource };
}

export function mapLegacyLocation(input: LocationCreateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    code: input.code,
    alias: input.alias,
    comment: input.comment,
    entities_id: input.entityId,
    is_recursive: input.recursive === undefined ? undefined : input.recursive ? 1 : 0,
    locations_id: input.parentLocationId,
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

export function mapLegacyEntity(input: EntityCreateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    entities_id: input.parentEntityId,
    comment: input.comment,
    registration_number: input.registrationNumber,
    address: input.address,
    postcode: input.postcode,
    town: input.town,
    state: input.state,
    country: input.country,
    latitude: input.latitude === undefined ? undefined : String(input.latitude),
    longitude: input.longitude === undefined ? undefined : String(input.longitude),
    altitude: input.altitude === undefined ? undefined : String(input.altitude),
    website: input.website,
    phonenumber: input.phone,
    fax: input.fax,
    email: input.email,
  });
}

export class LegacyOrganizationService implements OrganizationService {
  constructor(private readonly client: GlpiClient) {}

  listLocations(input: OrganizationListRequest) { return this.client.getLocations(listOptions(input)); }
  getLocation(id: number) { return this.client.getLocation(id); }
  async createLocation(input: LocationCreateRequest) {
    const created = await this.client.createLocation(mapLegacyLocation(input));
    return createdResource(await this.getLocation(created.id), created.id);
  }
  listEntities(input: OrganizationListRequest) { return this.client.getEntities(listOptions(input)); }
  getEntity(id: number) { return this.client.getEntity(id); }
  async createEntity(input: EntityCreateRequest) {
    const created = await this.client.createItem('Entity', mapLegacyEntity(input));
    return createdResource(await this.getEntity(created.id), created.id);
  }
}
