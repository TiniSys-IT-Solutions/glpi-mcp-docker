import {
  InventoryCredentialWriteRequest,
  InventoryIPRangeWriteRequest,
  InventoryPluginListRequest,
  InventoryTaskWriteRequest,
  InventoryIPRangeSNMPAssociationCreateRequest,
  InventoryIPRangeSNMPAssociationListRequest,
} from './types.js';

export type InventoryPluginResource =
  | 'agents' | 'agent_modules' | 'credentials' | 'tasks' | 'task_jobs' | 'task_job_states' | 'task_job_logs' | 'timeslots' | 'timeslot_entries'
  | 'collects' | 'collect_files' | 'collect_registries' | 'collect_wmi_queries'
  | 'collect_file_results' | 'collect_registry_results' | 'collect_wmi_results'
  | 'deploy_packages' | 'deploy_groups' | 'deploy_mirrors';

export interface InventoryPluginService {
  list(resource: InventoryPluginResource, input: InventoryPluginListRequest): Promise<unknown[]>;
  get(resource: InventoryPluginResource, id: number): Promise<unknown>;
  listIPRanges(input: InventoryPluginListRequest): Promise<unknown[]>;
  getIPRange(id: number): Promise<unknown>;
  createIPRange(input: InventoryIPRangeWriteRequest & { name: string; ip_start: string; ip_end: string }): Promise<unknown>;
  createIPRangeFromCIDR(input: { name: string; cidr: string; entity_id?: number; usable_hosts_only?: boolean }): Promise<unknown>;
  updateIPRange(id: number, input: InventoryIPRangeWriteRequest): Promise<unknown>;
  listIPRangeSNMPCredentials(input: InventoryIPRangeSNMPAssociationListRequest): Promise<unknown[]>;
  getIPRangeSNMPCredential(id: number): Promise<unknown>;
  attachSNMPCredentialToIPRange(input: InventoryIPRangeSNMPAssociationCreateRequest): Promise<unknown>;
  updateIPRangeSNMPCredential(id: number, rank: number): Promise<unknown>;
  detachSNMPCredentialFromIPRange(id: number): Promise<unknown>;
  createTask(input: InventoryTaskWriteRequest & { name: string }): Promise<unknown>;
  updateTask(id: number, input: InventoryTaskWriteRequest): Promise<unknown>;
  setTaskActive(id: number, active: boolean): Promise<unknown>;
  requeueTask(id: number): Promise<unknown>;
  createCredential(input: InventoryCredentialWriteRequest & { name: string; credential_type: string }): Promise<unknown>;
  updateCredential(id: number, input: InventoryCredentialWriteRequest): Promise<unknown>;
}
