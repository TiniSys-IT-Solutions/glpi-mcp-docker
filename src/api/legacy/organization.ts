import { OrganizationService } from '../../core/organization/service.js';
import { normalizeEntityResource } from '../../core/organization/entity.js';
import { EntityCreateRequest, EntityUpdateRequest, LocationCreateRequest, LocationUpdateRequest, OrganizationListRequest } from '../../core/organization/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';
import { GlpiError } from './http.js';

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

type CreatedItem = { id: number; message?: string };

interface ActiveEntityContext {
  entityId: number | 'all';
  recursive: boolean;
}

/** Keep MCP stdout clean while making creation and verification independently observable. */
function organizationLog(event: 'creation_succeeded' | 'update_succeeded' | 'verification_failed', details: Record<string, unknown>): void {
  if (process.env.GLPI_DEBUG) {
    console.error(`[glpi-organization] ${new Date().toISOString()} ${event} ${JSON.stringify(details)}`);
  }
}

function verificationFailure(id: number, error: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const glpiError = error instanceof GlpiError ? error : undefined;
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorMessage = glpiError?.glpiMessage ?? (error instanceof Error ? error.message : String(error));

  return defined({
    success: true,
    id,
    ...extra,
    verification_status: 'failed',
    verification_error: glpiError?.glpiCode ?? errorName,
    verification_http_status: glpiError?.status,
    verification_message: errorMessage,
  });
}

async function verifyCreatedResource(
  resourceType: 'Entity' | 'Location',
  created: CreatedItem,
  verify: (id: number) => Promise<unknown>
): Promise<Record<string, unknown>> {
  // The POST has completed at this point. Only the GET belongs in this try/catch:
  // a verification failure must never cause the caller to repeat the creation here.
  organizationLog('creation_succeeded', { resource_type: resourceType, id: created.id });
  try {
    return createdResource(await verify(created.id), created.id);
  } catch (error) {
    const result = verificationFailure(created.id, error, {
      creation_message: created.message,
    });
    organizationLog('verification_failed', {
      resource_type: resourceType,
      id: created.id,
      verification_error: result.verification_error,
      verification_http_status: result.verification_http_status,
    });
    return result;
  }
}

function activeEntityContext(resource: unknown): ActiveEntityContext | undefined {
  if (!resource || typeof resource !== 'object') return undefined;
  const record = resource as Record<string, unknown>;
  const active = record.active_entity;
  const nested = active && typeof active === 'object' ? active as Record<string, unknown> : undefined;
  const rawId = nested?.id ?? active;
  const entityId = rawId === 'all' ? 'all' : Number(rawId);
  if (entityId !== 'all' && (!Number.isInteger(entityId) || entityId < 0)) return undefined;
  const rawRecursive = record.active_entity_recursive ?? nested?.active_entity_recursive;
  const recursive = rawRecursive === true || rawRecursive === 1 || rawRecursive === '1';
  return { entityId, recursive };
}

async function verifyUpdatedEntity(
  id: number,
  verify: () => Promise<unknown>
): Promise<Record<string, unknown>> {
  organizationLog('update_succeeded', { resource_type: 'Entity', id });
  try {
    return createdResource(await verify(), id);
  } catch (error) {
    const result = verificationFailure(id, error, { update_status: 'succeeded' });
    organizationLog('verification_failed', {
      resource_type: 'Entity',
      id,
      operation: 'update',
      verification_error: result.verification_error,
      verification_http_status: result.verification_http_status,
    });
    return result;
  }
}

function clearable(value: unknown): unknown {
  return value === null ? '' : value;
}

function coordinate(value: number | null | undefined): string | undefined {
  return value === undefined ? undefined : value === null ? '' : String(value);
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

export function mapLegacyLocationUpdate(input: LocationUpdateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    code: clearable(input.code),
    alias: clearable(input.alias),
    comment: clearable(input.comment),
    entities_id: input.entityId,
    is_recursive: input.recursive === undefined ? undefined : input.recursive ? 1 : 0,
    locations_id: input.parentLocationId === null ? 0 : input.parentLocationId,
    room: clearable(input.room),
    building: clearable(input.building),
    address: clearable(input.address),
    town: clearable(input.town),
    postcode: clearable(input.postcode),
    state: clearable(input.state),
    country: clearable(input.country),
    latitude: coordinate(input.latitude),
    longitude: coordinate(input.longitude),
    altitude: coordinate(input.altitude),
  });
}

export function mapLegacyEntity(input: EntityCreateRequest | EntityUpdateRequest): Record<string, unknown> {
  return defined({
    name: input.name,
    entities_id: input.parentEntityId,
    comment: clearable(input.comment),
    registration_number: clearable(input.registrationNumber),
    ldap_dn: clearable(input.ldapDn),
    entity_ldapfilter: clearable(input.ldapFilter),
    authldaps_id: input.ldapDirectoryId,
    tag: clearable(input.inventoryTag),
    address: clearable(input.address),
    postcode: clearable(input.postcode),
    town: clearable(input.town),
    state: clearable(input.state),
    country: clearable(input.country),
    latitude: coordinate(input.latitude),
    longitude: coordinate(input.longitude),
    altitude: coordinate(input.altitude),
    website: clearable(input.website),
    phonenumber: clearable(input.phone),
    fax: clearable(input.fax),
    email: clearable(input.email),
  });
}

export class LegacyOrganizationService implements OrganizationService {
  constructor(private readonly client: GlpiClient) {}

  listLocations(input: OrganizationListRequest) { return this.client.getLocations(listOptions(input)); }
  getLocation(id: number) { return this.client.getLocation(id); }
  async createLocation(input: LocationCreateRequest) {
    const created = await this.client.createLocation(mapLegacyLocation(input));
    return verifyCreatedResource('Location', created, (id) => this.getLocation(id));
  }
  async updateLocation(id: number, input: LocationUpdateRequest) {
    await this.getLocation(id);
    const payload = mapLegacyLocationUpdate(input);
    if (Object.keys(payload).length === 0) throw new Error('Location update requires at least one field');
    await this.client.updateItem('Location', id, payload);
    organizationLog('update_succeeded', { resource_type: 'Location', id });
    try {
      return createdResource(await this.getLocation(id), id);
    } catch (error) {
      const result = verificationFailure(id, error, { update_status: 'succeeded' });
      organizationLog('verification_failed', { resource_type: 'Location', id, operation: 'update' });
      return result;
    }
  }
  async listEntities(input: OrganizationListRequest) {
    return normalizeEntityResource(await this.client.getEntities({ ...listOptions(input), expand_dropdowns: false }));
  }
  async getEntity(id: number) {
    return normalizeEntityResource(await this.client.getEntity(id, { expand_dropdowns: false }));
  }
  async createEntity(input: EntityCreateRequest) {
    const created = await this.client.createItem('Entity', mapLegacyEntity(input));
    organizationLog('creation_succeeded', { resource_type: 'Entity', id: created.id });
    try {
      return createdResource(await this.getEntity(created.id), created.id);
    } catch (error) {
      // GLPI caches the active recursive entity tree in the Legacy session. A
      // freshly-created child may therefore be writable but temporarily absent
      // from that cached tree. Re-selecting the exact same active context asks
      // GLPI to rebuild it without widening or bypassing the account ACLs.
      if (error instanceof GlpiError && error.status === 403 && error.glpiCode === 'ERROR_RIGHT_MISSING') {
        try {
          const context = activeEntityContext(await this.client.getActiveEntities());
          if (context) {
            await this.client.changeActiveEntities(context.entityId, context.recursive);
            return createdResource(await this.getEntity(created.id), created.id);
          }
        } catch (refreshError) {
          organizationLog('verification_failed', {
            resource_type: 'Entity', id: created.id, context_refresh_error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
        }
      }
      const result = verificationFailure(created.id, error, { creation_message: created.message });
      organizationLog('verification_failed', {
        resource_type: 'Entity', id: created.id,
        verification_error: result.verification_error,
        verification_http_status: result.verification_http_status,
      });
      return result;
    }
  }
  async updateEntity(id: number, input: EntityUpdateRequest) {
    await this.getEntity(id);
    const payload = mapLegacyEntity(input);
    if (Object.keys(payload).length === 0) throw new Error('Entity update requires at least one field');
    await this.client.updateItem('Entity', id, payload);
    return verifyUpdatedEntity(id, () => this.getEntity(id));
  }
}
