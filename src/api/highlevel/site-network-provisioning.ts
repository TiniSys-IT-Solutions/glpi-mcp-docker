import { SiteNetworkProvisioningService } from '../../core/site-network-provisioning/service.js';
import { SiteNetworkProvisioningApplyRequest, SiteNetworkProvisioningRequest } from '../../core/site-network-provisioning/types.js';

export class HighLevelSiteNetworkProvisioningService implements SiteNetworkProvisioningService {
  private unsupported(): never { throw new Error('Not supported in GLPI_API_MODE=highlevel: site network provisioning routes are not confirmed by GLPI 11 Swagger'); }
  async preview(_input: SiteNetworkProvisioningRequest): Promise<unknown> { return this.unsupported(); }
  async apply(_input: SiteNetworkProvisioningApplyRequest): Promise<unknown> { return this.unsupported(); }
}
