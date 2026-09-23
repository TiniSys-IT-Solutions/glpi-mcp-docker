export interface NetworkTopologyService {
  listPorts(input: { itemtype: string; assetId: number }): Promise<unknown>;
  getPort(id: number): Promise<unknown>;
  createPort(input: { itemtype: string; assetId: number; fields: Record<string, unknown>; correlationId: string }): Promise<unknown>;
  updatePort(input: { id: number; fields: Record<string, unknown>; expectedAssetId?: number; correlationId: string }): Promise<unknown>;
  attachVlan(input: { portId: number; vlanId: number; tagged?: boolean; correlationId: string }): Promise<unknown>;
  connectPorts(input: { portId: number; peerPortId: number; correlationId: string }): Promise<unknown>;
  previewRemoveLink(input: { kind: 'vlan' | 'port_connection'; relationId: number }): Promise<unknown>;
  removeLink(input: { kind: 'vlan' | 'port_connection'; relationId: number; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
  attachIPAddress(input: { portId: number; address: string; networkName?: string; fqdnId?: number; correlationId: string }): Promise<unknown>;
  moveIPAddress(input: { ipAddressId: number; targetPortId: number; networkName?: string; fqdnId?: number; expectedNetworkNameId?: number; correlationId: string }): Promise<unknown>;
  previewDelete(input: { kind: 'ip_address' | 'network_port'; id: number }): Promise<unknown>;
  delete(input: { kind: 'ip_address' | 'network_port'; id: number; previewFingerprint: string; confirmation: string; correlationId: string }): Promise<unknown>;
}
