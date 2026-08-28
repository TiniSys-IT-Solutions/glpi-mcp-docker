import { IPNetworkService } from './ip-networks/service.js';
import { TicketService } from './tickets/service.js';

export interface GlpiServices {
  tickets: TicketService;
  ipNetworks?: IPNetworkService;
}
