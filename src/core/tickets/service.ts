import {
  TicketCreateRequest,
  TicketGetOptions,
  TicketListRequest,
  TicketSearchRequest,
  TicketSearchResult,
  TicketUpdateRequest,
} from './types.js';

export interface TicketService {
  list(input: TicketListRequest): Promise<unknown[]>;
  get(id: number, options?: TicketGetOptions): Promise<unknown>;
  search(input: TicketSearchRequest): Promise<TicketSearchResult>;
  create(input: TicketCreateRequest): Promise<unknown>;
  update(id: number, input: TicketUpdateRequest): Promise<unknown>;
}

export interface GlpiServices {
  tickets: TicketService;
}
