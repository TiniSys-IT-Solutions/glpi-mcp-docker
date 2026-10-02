import { AssetInventoryLockRequest, AssetTagChangeRequest, AssetTagRequest, TagListRequest } from './types.js';

export interface AssetControlService {
  listTags(input: TagListRequest): Promise<unknown>;
  listAssetTags(input: AssetTagRequest): Promise<unknown>;
  attachTag(input: AssetTagChangeRequest): Promise<unknown>;
  detachTag(input: AssetTagChangeRequest): Promise<unknown>;
  listInventoryLocks(input: AssetTagRequest): Promise<unknown>;
  lockInventoryField(input: AssetInventoryLockRequest): Promise<unknown>;
  unlockInventoryField(input: AssetInventoryLockRequest): Promise<unknown>;
}
