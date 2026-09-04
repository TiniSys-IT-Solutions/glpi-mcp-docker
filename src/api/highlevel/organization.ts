import { OrganizationService } from '../../core/organization/service.js';
import { normalizeEntityResource } from '../../core/organization/entity.js';
import { EntityCreateRequest, EntityUpdateRequest, LocationCreateRequest, LocationUpdateRequest, OrganizationListRequest } from '../../core/organization/types.js';
import { HighLevelClient, HighLevelNotSupportedError } from './client.js';

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

function jsonPatch(body: unknown): RequestInit {
  return { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
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
    ldap_dn: input.ldapDn,
    entity_ldapfilter: input.ldapFilter,
    authldap: input.ldapDirectoryId === undefined ? undefined : { id: input.ldapDirectoryId },
    tag: input.inventoryTag,
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

function clearable(value: unknown): unknown {
  return value === null ? '' : value;
}

function coordinate(value: number | null | undefined): string | undefined {
  return value === undefined ? undefined : value === null ? '' : String(value);
}

export function mapHighLevelEntityUpdate(input: EntityUpdateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    parent: input.parentEntityId === undefined ? undefined : { id: input.parentEntityId },
    comment: clearable(input.comment),
    registration_number: clearable(input.registrationNumber),
    ldap_dn: clearable(input.ldapDn),
    entity_ldapfilter: clearable(input.ldapFilter),
    authldap: input.ldapDirectoryId === undefined ? undefined : { id: input.ldapDirectoryId },
    tag: clearable(input.inventoryTag),
    address: clearable(input.address),
    postcode: clearable(input.postcode),
    city: clearable(input.town),
    state: clearable(input.state),
    country: clearable(input.country),
    latitude: coordinate(input.latitude),
    longitude: coordinate(input.longitude),
    altitude: coordinate(input.altitude),
    website: clearable(input.website),
    phone: clearable(input.phone),
    fax: clearable(input.fax),
    email: clearable(input.email),
  });
}

function verificationFailure(id: number, operation: 'creation' | 'update', error: unknown): Record<string, unknown> {
  return {
    success: true,
    id,
    [`${operation}_status`]: 'succeeded',
    verification_status: 'failed',
    verification_error: error instanceof Error ? error.name : 'UnknownError',
    verification_message: error instanceof Error ? error.message : String(error),
  };
}

export class HighLevelOrganizationService implements OrganizationService {
  constructor(private readonly client: HighLevelClient) {}

  listLocations(input: OrganizationListRequest) { return this.client.request(`Dropdown/Location?${query(input)}`); }
  getLocation(id: number) { return this.client.request(`Dropdown/Location/${id}`); }
  async createLocation(input: LocationCreateRequest) { return createdResource(await this.client.request('Dropdown/Location', jsonPost(mapHighLevelLocation(input)))); }
  async updateLocation(_id: number, _input: LocationUpdateRequest): Promise<never> {
    throw new HighLevelNotSupportedError('glpi_update_location');
  }
  async listEntities(input: OrganizationListRequest) {
    return normalizeEntityResource(await this.client.request(`Administration/Entity?${query(input)}`));
  }
  async getEntity(id: number) {
    return normalizeEntityResource(await this.client.request(`Administration/Entity/${id}`));
  }
  async createEntity(input: EntityCreateRequest) {
    const created = await this.client.request<Record<string, unknown>>('Administration/Entity', jsonPost(mapHighLevelEntity(input)));
    const id = typeof created?.id === 'number' ? created.id : undefined;
    if (id === undefined) return createdResource(created);
    try {
      return createdResource(await this.getEntity(id));
    } catch (error) {
      return verificationFailure(id, 'creation', error);
    }
  }
  async updateEntity(id: number, input: EntityUpdateRequest) {
    await this.getEntity(id);
    const payload = mapHighLevelEntityUpdate(input);
    if (Object.keys(payload).length === 0) throw new Error('Entity update requires at least one field');
    await this.client.request(`Administration/Entity/${id}`, jsonPatch(payload));
    try {
      return createdResource(await this.getEntity(id));
    } catch (error) {
      return verificationFailure(id, 'update', error);
    }
  }
}
