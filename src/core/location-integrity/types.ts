export const LOCATION_ASSET_TYPES = [
  'Computer', 'Monitor', 'Printer', 'NetworkEquipment', 'Phone', 'Peripheral', 'Appliance',
] as const;

export type LocationAssetType = typeof LOCATION_ASSET_TYPES[number];

export interface AssetLocationUpdateRequest {
  itemtype: LocationAssetType;
  id: number;
  locationId?: number;
  entityId?: number;
  name?: string;
  serial?: string | null;
  inventoryNumber?: string | null;
  comment?: string | null;
  stateId?: number;
  manufacturerId?: number;
  modelId?: number;
  typeId?: number;
  assignedUserId?: number;
  assignedTechnicianId?: number;
  contact?: string | null;
  contactNumber?: string | null;
  recursive?: boolean;
  correlationId?: string;
}

export interface LocationMappingRequest {
  mapping: Array<{ oldLocationId: number; newLocationId: number }>;
  itemtypes: LocationAssetType[];
  dryRun: boolean;
  batchSize: number;
  continueOnError: boolean;
  correlationId?: string;
  confirmation?: string;
}
