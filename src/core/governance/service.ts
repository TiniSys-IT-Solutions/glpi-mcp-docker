import { AssetRelationKind, GovernanceAudit } from './types.js';

export interface GovernanceService {
  listAssetRelations(input: { itemtype: string; assetId: number; kind: AssetRelationKind }): Promise<unknown>;
  attachAssetRelation(input: { itemtype: string; assetId: number; kind: AssetRelationKind; relatedId: number; correlationId: string }): Promise<unknown>;
  previewDetachAssetRelation(input: { relationId: number; kind: AssetRelationKind }): Promise<unknown>;
  detachAssetRelation(input: { relationId: number; kind: AssetRelationKind; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
  getDropdownUsage(input: { itemtype: string; id: number; start: number; limit: number }): Promise<unknown>;
  audit(input: { audit: GovernanceAudit; itemtypes?: string[]; entityId?: number; days?: number; requiredFields?: string[]; limit: number }): Promise<unknown>;
}
