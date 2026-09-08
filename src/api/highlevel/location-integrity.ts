import { LocationIntegrityService } from '../../core/location-integrity/service.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelLocationIntegrityService implements LocationIntegrityService {
  private unsupported(name: string): never { throw new HighLevelNotSupportedError(name); }
  async updateAsset(): Promise<unknown> { return this.unsupported('asset location update'); }
  async reassignAssets(): Promise<unknown> { return this.unsupported('glpi_reassign_assets_from_location_mapping'); }
  async resolveLocation(): Promise<unknown> { return this.unsupported('glpi_resolve_location'); }
  async auditLocations(): Promise<unknown> { return this.unsupported('glpi_audit_locations'); }
  async deleteLocation(): Promise<unknown> { return this.unsupported('glpi_delete_location'); }
  async deleteUnusedLocations(): Promise<unknown> { return this.unsupported('glpi_delete_unused_locations'); }
  async listItemHistory(): Promise<unknown> { return this.unsupported('glpi_list_item_history'); }
  async listLdapDirectories(): Promise<unknown> { return this.unsupported('glpi_list_ldap_directories'); }
  async listAutomaticActions(): Promise<unknown> { return this.unsupported('glpi_list_automatic_actions'); }
}
