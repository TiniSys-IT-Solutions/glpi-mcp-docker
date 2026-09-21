export const MANAGED_ASSET_TYPES = ['Computer', 'Printer', 'NetworkEquipment', 'Phone', 'Peripheral'] as const;
export type ManagedAssetType = typeof MANAGED_ASSET_TYPES[number];
export type Confidence = 'low' | 'medium' | 'high';

export interface UnmanagedAuditRequest {
  entityId?: number;
  recursive: boolean;
  unmanagedIds?: number[];
  createdFrom?: string;
  modifiedFrom?: string;
  limit: number;
  fetchAll: boolean;
  maxRows: number;
  assetTypes: ManagedAssetType[];
  minimumConfidence: Confidence;
  includeUnmatched: boolean;
}

export interface UnmanagedApplyRequest {
  actions: Array<{ unmanagedId: number; action: string; destinationItemtype?: ManagedAssetType; destinationId?: number }>;
  dryRun: boolean;
  confirmation?: string;
  correlationId?: string;
}
