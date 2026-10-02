import { AssetControlService } from '../../core/asset-controls/service.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelAssetControlService implements AssetControlService {
  private no(tool: string): never { throw new HighLevelNotSupportedError(`${tool}; plugin TAG has no confirmed GLPI 11 High-Level route`); }
  async listTags(): Promise<unknown> { return this.no('glpi_list_tags'); }
  async listAssetTags(): Promise<unknown> { return this.no('glpi_list_asset_tags'); }
  async attachTag(): Promise<unknown> { return this.no('glpi_attach_tag_to_asset'); }
  async detachTag(): Promise<unknown> { return this.no('glpi_detach_tag_from_asset'); }
  async listInventoryLocks(): Promise<unknown> { return this.no('glpi_list_asset_inventory_locks'); }
  async lockInventoryField(): Promise<unknown> { return this.no('glpi_lock_asset_inventory_field'); }
  async unlockInventoryField(): Promise<unknown> { return this.no('glpi_unlock_asset_inventory_field'); }
}
