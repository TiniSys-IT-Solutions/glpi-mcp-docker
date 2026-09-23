import { ComponentType } from './types.js';
export interface ComponentRelationService {
  list(input: { itemtype: string; assetId: number; componentType: ComponentType }): Promise<unknown>;
  usage(input: { componentType: ComponentType; componentId: number }): Promise<unknown>;
  attach(input: { itemtype: string; assetId: number; componentType: ComponentType; componentId: number; fields: Record<string, unknown>; correlationId: string }): Promise<unknown>;
  update(input: { componentType: ComponentType; relationId: number; fields: Record<string, unknown>; expectedAssetId?: number; correlationId: string }): Promise<unknown>;
  previewDetach(input: { componentType: ComponentType; relationId: number }): Promise<unknown>;
  detach(input: { componentType: ComponentType; relationId: number; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
}
