import { NetworkTopologyService } from '../../core/network-topology/service.js';
import { HighLevelNotSupportedError } from './client.js';
export class HighLevelNetworkTopologyService implements NetworkTopologyService {
  private no(name: string): never { throw new HighLevelNotSupportedError(name); }
  async listPorts(): Promise<unknown> { return this.no('glpi_list_asset_network_ports'); }
  async getPort(): Promise<unknown> { return this.no('glpi_get_network_port'); }
  async createPort(): Promise<unknown> { return this.no('glpi_create_network_port'); }
  async updatePort(): Promise<unknown> { return this.no('glpi_update_network_port'); }
  async attachVlan(): Promise<unknown> { return this.no('glpi_attach_vlan_to_port'); }
  async connectPorts(): Promise<unknown> { return this.no('glpi_connect_network_ports'); }
  async previewRemoveLink(): Promise<unknown> { return this.no('glpi_preview_remove_network_link'); }
  async removeLink(): Promise<unknown> { return this.no('glpi_remove_network_link'); }
  async attachIPAddress(): Promise<unknown> { return this.no('glpi_attach_ip_address'); }
  async moveIPAddress(): Promise<unknown> { return this.no('glpi_move_ip_address'); }
  async previewDelete(): Promise<unknown> { return this.no('glpi_preview_delete_network_object'); }
  async delete(): Promise<unknown> { return this.no('glpi_delete_network_object'); }
}
