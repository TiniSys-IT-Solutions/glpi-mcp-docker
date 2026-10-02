export const TAGGABLE_ASSET_TYPES = ['Printer', 'Computer', 'NetworkEquipment'] as const;
export type TaggableAssetType = typeof TAGGABLE_ASSET_TYPES[number];

export interface TagListRequest {
  query?: string;
  active_only?: boolean;
  start?: number;
  limit?: number;
}

export interface AssetTagRequest {
  asset_type: TaggableAssetType;
  asset_id: number;
}

export interface AssetTagChangeRequest extends AssetTagRequest {
  tag_id: number;
}

export interface AssetInventoryLockRequest extends AssetTagRequest {
  field: string;
}
