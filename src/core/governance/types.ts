export const ASSET_RELATION_KINDS = ['contract', 'document', 'certificate', 'domain'] as const;
export type AssetRelationKind = typeof ASSET_RELATION_KINDS[number];

export const GOVERNANCE_AUDITS = [
  'asset_completeness', 'dropdown_duplicates', 'orphan_documents',
  'contract_expirations', 'certificate_expirations',
  'stale_assets', 'inventory_coverage', 'unassigned_itil_items', 'ticket_sla_risk',
] as const;
export type GovernanceAudit = typeof GOVERNANCE_AUDITS[number];

export const RELATION_ASSET_TYPES = [
  'Computer', 'NetworkEquipment', 'Printer', 'Monitor', 'Phone', 'Peripheral',
  'Appliance', 'Rack', 'Enclosure', 'PDU', 'PassiveDCEquipment', 'Unmanaged',
] as const;
