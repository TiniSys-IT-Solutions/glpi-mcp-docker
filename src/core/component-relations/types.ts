export const COMPONENT_TYPES = ['DeviceMotherboard','DeviceProcessor','DeviceMemory','DeviceHardDrive','DeviceNetworkCard','DeviceGraphicCard','DeviceSoundCard','DeviceDrive','DevicePowerSupply','DeviceBattery','DeviceFirmware','DeviceCase','DeviceControl','DeviceCamera','DeviceSensor','DeviceSimcard','DevicePci','DeviceGeneric'] as const;
export type ComponentType = typeof COMPONENT_TYPES[number];
export const COMPONENT_ASSET_TYPES = ['Computer','NetworkEquipment','Printer','Monitor','Phone','Peripheral','Appliance','Rack','Enclosure','PDU','PassiveDCEquipment'] as const;
