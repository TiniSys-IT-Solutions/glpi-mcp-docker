import { AssetLocationUpdateRequest, LocationMappingRequest } from './types.js';

export interface LocationIntegrityService {
  updateAsset(input: AssetLocationUpdateRequest): Promise<unknown>;
  reassignAssets(input: LocationMappingRequest): Promise<unknown>;
  resolveLocation(input: { name: string; entityId?: number; parentLocationId?: number }): Promise<unknown>;
  auditLocations(input: Record<string, unknown>): Promise<unknown>;
  deleteLocation(input: { locationId: number; dryRun: boolean; purge: boolean; confirmation?: string }): Promise<unknown>;
  deleteUnusedLocations(input: { locationIds: number[]; dryRun: boolean; purge: boolean; confirmation?: string }): Promise<unknown>;
  listItemHistory(input: Record<string, unknown>): Promise<unknown>;
  listLdapDirectories(input: Record<string, unknown>): Promise<unknown>;
  listAutomaticActions(input: Record<string, unknown>): Promise<unknown>;
}
