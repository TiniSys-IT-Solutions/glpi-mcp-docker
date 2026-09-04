export interface PrinterUpdateRequest {
  entityId?: number;
  locationId?: number;
  name?: string;
  serial?: string | null;
  inventoryNumber?: string | null;
  comment?: string | null;
  stateId?: number;
  manufacturerId?: number;
  modelId?: number;
  printerTypeId?: number;
  networkId?: number;
  assignedUserId?: number;
  assignedTechnicianId?: number;
  contact?: string | null;
  contactNumber?: string | null;
  memorySize?: number;
  recursive?: boolean;
  global?: boolean;
}

export interface AppendPrinterCommentRequest {
  text: string;
  separator?: string;
}

export interface ReassignPrintersRequest {
  printerIds?: number[];
  dryRun: boolean;
  preservePreviousLocationInComment: boolean;
  commentPrefix: string;
  confirmation?: 'I_HAVE_VERIFIED_THE_PRINTER_REASSIGNMENT_PLAN';
}

export type PrinterReassignmentStatus =
  | 'ready' | 'already_correct' | 'ambiguous_ip' | 'no_matching_rule'
  | 'multiple_matching_rules' | 'rule_inactive' | 'invalid_rule_actions'
  | 'invalid_target' | 'updated' | 'error';
