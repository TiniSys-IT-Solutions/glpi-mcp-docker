export interface InventoryPluginListRequest {
  range?: string;
  start?: number;
  limit?: number;
  sort?: string | number;
  order?: 'ASC' | 'DESC';
  expand_dropdowns?: boolean;
}

export interface InventoryIPRangeWriteRequest {
  name?: string;
  entity_id?: number;
  ip_start?: string;
  ip_end?: string;
}

export interface InventoryTaskWriteRequest {
  name?: string;
  entity_id?: number;
  comment?: string;
  is_active?: boolean;
  datetime_start?: string;
  datetime_end?: string;
  reprepare_if_successful?: boolean;
  is_deploy_on_demand?: boolean;
}

export interface InventoryCredentialWriteRequest {
  name?: string;
  entity_id?: number;
  credential_type?: string;
  username?: string;
  password?: string;
}

export interface InventoryIPRangeSNMPAssociationListRequest extends InventoryPluginListRequest {
  ip_range_id?: number;
  snmp_credential_id?: number;
}

export interface InventoryIPRangeSNMPAssociationCreateRequest {
  ip_range_id: number;
  snmp_credential_id: number;
  rank?: number;
}
