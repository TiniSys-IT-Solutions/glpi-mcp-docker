import { HighLevelNotSupportedError } from './client.js';
import { UnmanagedReconciliationService } from '../../core/unmanaged-reconciliation/service.js';
import { UnmanagedApplyRequest, UnmanagedAuditRequest } from '../../core/unmanaged-reconciliation/types.js';

export class HighLevelUnmanagedReconciliationService implements UnmanagedReconciliationService {
  async audit(_input: UnmanagedAuditRequest): Promise<unknown> { throw new HighLevelNotSupportedError('glpi_audit_unmanaged_assets'); }
  async apply(_input: UnmanagedApplyRequest): Promise<unknown> { throw new HighLevelNotSupportedError('glpi_apply_unmanaged_asset_reconciliation'); }
}
