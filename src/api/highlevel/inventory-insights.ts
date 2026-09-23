import { HighLevelNotSupportedError } from './client.js';
import { InventoryInsightsService } from '../../core/inventory-insights/service.js';

export class HighLevelInventoryInsightsService implements InventoryInsightsService {
  private no(name: string): never { throw new HighLevelNotSupportedError(name); }
  async auditFortigateHA(): Promise<unknown> { return this.no('glpi_audit_fortigate_ha_assets'); }
  async getProvenance(): Promise<unknown> { return this.no('glpi_get_asset_inventory_provenance'); }
  async getTimeline(): Promise<unknown> { return this.no('glpi_get_asset_inventory_timeline'); }
  async getRawPayload(): Promise<unknown> { return this.no('glpi_get_asset_inventory_raw_payload'); }
  async previewTaskSchedule(): Promise<unknown> { return this.no('glpi_inventory_preview_task_schedule'); }
  async setTaskReprepare(): Promise<unknown> { return this.no('glpi_inventory_set_task_reprepare'); }
  async prepareTaskOnce(): Promise<unknown> { return this.no('glpi_inventory_prepare_task_once'); }
  async getTaskExecutionTimeline(): Promise<unknown> { return this.no('glpi_inventory_get_task_execution_timeline'); }
  async classifyDiscovery(): Promise<unknown> { return this.no('glpi_classify_unmanaged_discovery'); }
  async getAssetNetworkIdentity(): Promise<unknown> { return this.no('glpi_get_asset_network_identity'); }
}
