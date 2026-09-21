export type RangePolicy = 'usable_hosts' | 'full_cidr';
export type SyncAction = 'create' | 'update' | 'unchanged' | 'skip' | 'conflict';

export interface AddressingOptions {
  use_as_filter?: boolean;
  alloted_ip?: boolean;
  double_ip?: boolean;
  free_ip?: boolean;
  reserved_ip?: boolean;
  use_ping?: boolean;
}

export interface AddressingOverrides extends AddressingOptions {
  location_id?: number;
  network_id?: number;
  vlan_id?: number;
  fqdn_id?: number;
  name?: string;
  comment?: string;
}

export interface AddressingListRequest {
  entity_id?: number;
  location_id?: number;
  network_id?: number;
  vlan_id?: number;
  ip_network_id?: number;
  include_deleted?: boolean;
  start?: number;
  limit?: number;
}

export interface AddressingPreviewRequest {
  ip_network_ids?: number[];
  entity_id?: number;
  include_recursive?: boolean;
  only_addressable?: boolean;
  range_policy?: RangePolicy;
  match_location?: boolean;
  match_network?: boolean;
  match_vlan?: boolean;
  match_fqdn?: boolean;
  adopt_exact_matches?: boolean;
  defaults?: AddressingOptions;
  overrides_by_ip_network_id?: Record<string, AddressingOverrides>;
  start?: number;
  limit?: number;
}

export interface AddressingApplyRequest extends AddressingPreviewRequest {
  ip_network_ids: number[];
  preview_fingerprint: string;
  confirmation: 'I_HAVE_VERIFIED_THE_ADDRESSING_SYNC';
  allow_create?: boolean;
  allow_update?: boolean;
  update_inferred_metadata?: boolean;
}

export interface IPNetworkRecord {
  id: number;
  name: string;
  network: string;
  entities_id?: number;
  is_recursive?: number | boolean;
  addressable?: number | boolean;
  comment?: string;
  date_mod?: string;
}

export interface AddressingRangeRecord {
  id: number;
  entities_id: number;
  name: string;
  begin_ip: string;
  end_ip: string;
  locations_id?: number;
  networks_id?: number;
  vlans_id?: number;
  fqdns_id?: number;
  use_as_filter?: number | boolean;
  alloted_ip?: number | boolean;
  double_ip?: number | boolean;
  free_ip?: number | boolean;
  reserved_ip?: number | boolean;
  use_ping?: number | boolean;
  comment?: string;
  is_deleted?: number | boolean;
  date_mod?: string;
  [key: string]: unknown;
}

export interface MatchEvidence {
  id: number;
  name?: string;
  score: number;
  method: string;
  observations?: Record<string, unknown>;
}

export interface AddressingPlanItem {
  ip_network_id: number;
  action: SyncAction;
  source: IPNetworkRecord;
  existing_range?: AddressingRangeRecord;
  proposed_range?: Record<string, unknown>;
  current_values?: Record<string, unknown>;
  proposed_values?: Record<string, unknown>;
  changed_fields: string[];
  location?: MatchEvidence;
  network?: MatchEvidence;
  vlan?: MatchEvidence;
  fqdn?: MatchEvidence;
  warnings: string[];
  reason?: string;
  state_fingerprint: string;
}

export interface AddressingPreviewResult {
  itemtype: string;
  fingerprint: string;
  items: AddressingPlanItem[];
  summary: Record<SyncAction, number>;
}
