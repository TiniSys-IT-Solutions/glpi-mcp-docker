export interface InventoryInsightsService {
  auditFortigateHA(input: Record<string, unknown>): Promise<unknown>;
  getProvenance(input: Record<string, unknown>): Promise<unknown>;
  getTimeline(input: Record<string, unknown>): Promise<unknown>;
  getRawPayload(input: Record<string, unknown>): Promise<unknown>;
  previewTaskSchedule(input: Record<string, unknown>): Promise<unknown>;
  setTaskReprepare(input: Record<string, unknown>): Promise<unknown>;
  prepareTaskOnce(input: Record<string, unknown>): Promise<unknown>;
  getTaskExecutionTimeline(input: Record<string, unknown>): Promise<unknown>;
  classifyDiscovery(input: Record<string, unknown>): Promise<unknown>;
  getAssetNetworkIdentity(input: Record<string, unknown>): Promise<unknown>;
}
