import { AssetImportRuleListRequest, AssetImportRuleSnapshot, RestorePreviewRequest } from './types.js';

export interface AssetImportRuleService {
  list(input: AssetImportRuleListRequest): Promise<unknown>;
  get(id: number): Promise<unknown>;
  exportSnapshot(input: AssetImportRuleListRequest): Promise<unknown>;
  diffSnapshots(before: AssetImportRuleSnapshot, after: AssetImportRuleSnapshot): Promise<unknown>;
  previewRestore(input: RestorePreviewRequest): Promise<unknown>;
  applyRestore(input: RestorePreviewRequest & { previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
  simulate(input: { unmanagedIds?: number[]; inventoryPayload?: Record<string, unknown>; snapshot?: AssetImportRuleSnapshot; stopAtFirstMatch: boolean }): Promise<unknown>;
  analyzeRisks(snapshot?: AssetImportRuleSnapshot): Promise<unknown>;
  guardedMutation(operation: string, input: Record<string, unknown>): Promise<unknown>;
}
