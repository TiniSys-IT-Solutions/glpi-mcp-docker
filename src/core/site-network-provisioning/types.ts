import { AddressingOptions } from '../addressing-sync/types.js';

export interface SiteNetworkProvisioningRequest {
  entity_id: number;
  parent_location_id: number;
  location_name: string;
  network_name: string;
  cidr: string;
  gateway: string;
  is_recursive: boolean;
  addressable: boolean;
  discovery_task_id: number;
  discovery_job_id: number;
  inventory_task_id: number;
  inventory_job_id: number;
  source_ip_network_id?: number;
  source_inventory_range_id?: number;
  source_addressing_range_id?: number;
  copy_addressing_options: boolean;
  copy_snmp_credentials: boolean;
  addressing_options: AddressingOptions & { use_ping: boolean };
  rule_name: string;
  rule_ranking?: number;
  rule_scope_entity_id: number;
  rule_match: 'OR';
  activate_rule: boolean;
  rule_activation_confirmation?: 'I_HAVE_VERIFIED_THE_RULE_ACTIVATION';
}

export interface SiteNetworkProvisioningApplyRequest extends SiteNetworkProvisioningRequest {
  preview_fingerprint: string;
  confirmation: 'I_HAVE_VERIFIED_THE_SITE_NETWORK_PLAN';
}

export type ProvisioningStepStatus = 'already_satisfied' | 'create' | 'update' | 'conflict' | 'unsupported' | 'skipped';
export interface ProvisioningStep {
  key: string;
  status: ProvisioningStepStatus;
  evidence: Record<string, unknown>;
  proposed_action: Record<string, unknown> | null;
  warnings: string[];
  reversible: boolean;
  dependencies: string[];
  ambiguous: boolean;
}
