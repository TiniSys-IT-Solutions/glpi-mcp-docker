import { UnmanagedApplyRequest, UnmanagedAuditRequest } from './types.js';

export interface UnmanagedReconciliationService {
  audit(input: UnmanagedAuditRequest): Promise<unknown>;
  apply(input: UnmanagedApplyRequest): Promise<unknown>;
}
