import { IPNetworkService } from './ip-networks/service.js';
import { TicketService } from './tickets/service.js';
import { InventoryPluginService } from './inventory-plugin/service.js';

export interface GlpiServices {
  tickets: TicketService;
  ipNetworks?: IPNetworkService;
  inventoryPlugin?: InventoryPluginService;
}
