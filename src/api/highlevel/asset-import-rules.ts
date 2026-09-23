import { HighLevelNotSupportedError } from './client.js';
import { AssetImportRuleService } from '../../core/asset-import-rules/service.js';

export class HighLevelAssetImportRuleService implements AssetImportRuleService {
  private unsupported(operation: string): never { throw new HighLevelNotSupportedError(operation); }
  async list(): Promise<unknown> { return this.unsupported('glpi_list_asset_import_rules'); }
  async get(): Promise<unknown> { return this.unsupported('glpi_get_asset_import_rule'); }
  async exportSnapshot(): Promise<unknown> { return this.unsupported('glpi_export_asset_import_rules'); }
  async diffSnapshots(): Promise<unknown> { return this.unsupported('glpi_diff_asset_import_rule_snapshots'); }
  async previewRestore(): Promise<unknown> { return this.unsupported('glpi_preview_restore_asset_import_rules'); }
  async applyRestore(): Promise<unknown> { return this.unsupported('glpi_apply_restore_asset_import_rules'); }
  async simulate(): Promise<unknown> { return this.unsupported('glpi_simulate_asset_import_rules'); }
  async analyzeRisks(): Promise<unknown> { return this.unsupported('glpi_analyze_asset_import_rule_risks'); }
  async guardedMutation(operation: string): Promise<unknown> { return this.unsupported(operation); }
}
