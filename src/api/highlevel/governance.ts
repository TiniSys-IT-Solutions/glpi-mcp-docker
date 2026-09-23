import { GovernanceService } from '../../core/governance/service.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelGovernanceService implements GovernanceService {
  private no(name: string): never { throw new HighLevelNotSupportedError(name); }
  async listAssetRelations(): Promise<unknown> { return this.no('glpi_list_asset_relations'); }
  async attachAssetRelation(): Promise<unknown> { return this.no('glpi_attach_asset_relation'); }
  async previewDetachAssetRelation(): Promise<unknown> { return this.no('glpi_preview_detach_asset_relation'); }
  async detachAssetRelation(): Promise<unknown> { return this.no('glpi_detach_asset_relation'); }
  async getDropdownUsage(): Promise<unknown> { return this.no('glpi_get_dropdown_usage'); }
  async audit(): Promise<unknown> { return this.no('glpi_run_governance_audit'); }
}
