import { SiteNetworkProvisioningApplyRequest, SiteNetworkProvisioningRequest } from './types.js';

export interface SiteNetworkProvisioningService {
  preview(input: SiteNetworkProvisioningRequest): Promise<unknown>;
  apply(input: SiteNetworkProvisioningApplyRequest): Promise<unknown>;
}
