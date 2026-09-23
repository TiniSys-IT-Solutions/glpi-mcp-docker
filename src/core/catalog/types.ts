export const CATALOG_DOMAINS = ['asset', 'component', 'dropdown', 'management'] as const;
export type CatalogDomain = typeof CATALOG_DOMAINS[number];

export const CATALOG_ITEMTYPES: Record<CatalogDomain, readonly string[]> = {
  asset: ['Computer', 'NetworkEquipment', 'Printer', 'Monitor', 'Phone', 'Peripheral', 'Appliance', 'Rack', 'Enclosure', 'PDU', 'PassiveDCEquipment', 'Unmanaged', 'Software', 'SoftwareLicense', 'CartridgeItem', 'ConsumableItem'],
  component: ['DeviceMotherboard', 'DeviceProcessor', 'DeviceMemory', 'DeviceHardDrive', 'DeviceNetworkCard', 'DeviceGraphicCard', 'DeviceSoundCard', 'DeviceDrive', 'DevicePowerSupply', 'DeviceBattery', 'DeviceFirmware', 'DeviceCase', 'DeviceControl', 'DeviceCamera', 'DeviceSensor', 'DeviceSimcard', 'DevicePci', 'DeviceGeneric'],
  dropdown: ['Location', 'ITILCategory', 'State', 'Manufacturer', 'ComputerModel', 'ComputerType', 'NetworkEquipmentModel', 'NetworkEquipmentType', 'PrinterModel', 'PrinterType', 'MonitorModel', 'MonitorType', 'PhoneModel', 'PhoneType', 'PeripheralModel', 'PeripheralType', 'RequestType', 'SolutionType', 'TaskCategory', 'DocumentType', 'DocumentCategory', 'ContractType', 'SupplierType', 'SoftwareCategory', 'SoftwareLicenseType', 'Calendar', 'Network', 'NetworkPortType', 'VirtualMachineType', 'VirtualMachineSystem', 'VirtualMachineState'],
  management: ['Contract', 'Supplier', 'Contact', 'Budget', 'Document', 'Domain', 'DomainRecord', 'Certificate', 'SoftwareLicense', 'Datacenter', 'Cluster', 'DatabaseInstance', 'Database', 'Line'],
};

export interface CatalogSelection { domain: CatalogDomain; itemtype: string; }
