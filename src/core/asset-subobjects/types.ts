export const ASSET_SUBOBJECT_KINDS=['volume','os_installation','software_installation','antivirus','virtual_machine','remote_management'] as const; export type AssetSubobjectKind=typeof ASSET_SUBOBJECT_KINDS[number];
export const SUBOBJECT_ASSET_TYPES=['Computer','NetworkEquipment','Printer','Monitor','Phone','Peripheral','Appliance'] as const;
