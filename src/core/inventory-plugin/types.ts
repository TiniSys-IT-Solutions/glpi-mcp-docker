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

export type InventoryTaskJobTargetAction = 'add' | 'remove';
export interface InventoryTaskJobTargetChangeRequest {
  task_id: number;
  job_id: number;
  ip_range_id: number;
  action: InventoryTaskJobTargetAction;
}
export interface InventoryTaskJobTargetApplyRequest extends InventoryTaskJobTargetChangeRequest {
  preview_fingerprint: string;
  confirmation: 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_CHANGE' | 'I_HAVE_VERIFIED_THE_TASK_JOB_TARGET_REMOVAL';
}
