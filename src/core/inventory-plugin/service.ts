import {
  InventoryCredentialWriteRequest,
  InventoryIPRangeWriteRequest,
  InventoryPluginListRequest,
  InventoryTaskWriteRequest,
} from './types.js';

export type InventoryPluginResource =
  | 'credentials' | 'tasks' | 'task_jobs' | 'task_job_states' | 'timeslots'
  | 'collects' | 'collect_files' | 'collect_registries' | 'collect_wmi_queries'
  | 'deploy_packages' | 'deploy_groups';

export interface InventoryPluginService {
  list(resource: InventoryPluginResource, input: InventoryPluginListRequest): Promise<unknown[]>;
  get(resource: InventoryPluginResource, id: number): Promise<unknown>;
  listIPRanges(input: InventoryPluginListRequest): Promise<unknown[]>;
  getIPRange(id: number): Promise<unknown>;
  createIPRange(input: InventoryIPRangeWriteRequest & { name: string; ip_start: string; ip_end: string }): Promise<unknown>;
  createIPRangeFromCIDR(input: { name: string; cidr: string; entity_id?: number; usable_hosts_only?: boolean }): Promise<unknown>;
  updateIPRange(id: number, input: InventoryIPRangeWriteRequest): Promise<unknown>;
  createTask(input: InventoryTaskWriteRequest & { name: string }): Promise<unknown>;
  updateTask(id: number, input: InventoryTaskWriteRequest): Promise<unknown>;
  setTaskActive(id: number, active: boolean): Promise<unknown>;
  requeueTask(id: number): Promise<unknown>;
  createCredential(input: InventoryCredentialWriteRequest & { name: string; credential_type: string }): Promise<unknown>;
  updateCredential(id: number, input: InventoryCredentialWriteRequest): Promise<unknown>;
}
