export const ASSET_IMPORT_ITEMTYPES = ['Computer', 'Printer', 'NetworkEquipment', 'Phone', 'Peripheral'] as const;
export type AssetImportItemtype = typeof ASSET_IMPORT_ITEMTYPES[number];

export interface AssetImportRuleListRequest {
  activeOnly?: boolean;
  itemtypeFilter?: AssetImportItemtype;
  includeCriteria: boolean;
  includeActions: boolean;
  fetchAll: boolean;
}

export interface AssetImportRuleSnapshot {
  schema_version: 1;
  source: { glpi_version: string | null; api_mode: 'legacy' | 'highlevel' };
  rules: Record<string, unknown>[];
  fingerprint: string;
  captured_at?: string;
}

export interface RestorePreviewRequest {
  snapshot: AssetImportRuleSnapshot;
  restoreMode: 'exact' | 'merge';
  allowCreate: boolean;
  allowUpdate: boolean;
  allowDisable: boolean;
  allowDelete: boolean;
}
