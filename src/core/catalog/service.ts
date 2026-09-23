import { CatalogSelection } from './types.js';

export interface CatalogService {
  list(input: CatalogSelection & { start: number; limit: number; fetchAll: boolean; includeDeleted: boolean }): Promise<unknown>;
  get(input: CatalogSelection & { id: number }): Promise<unknown>;
  create(input: CatalogSelection & { fields: Record<string, unknown>; correlationId: string }): Promise<unknown>;
  update(input: CatalogSelection & { id: number; fields: Record<string, unknown>; correlationId: string }): Promise<unknown>;
  previewDelete(input: CatalogSelection & { id: number; purge: boolean }): Promise<unknown>;
  delete(input: CatalogSelection & { id: number; purge: boolean; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
}
