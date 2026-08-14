import { TicketService } from '../../core/tickets/service.js';
import {
  TicketCreateRequest,
  TicketGetOptions,
  TicketListRequest,
  TicketSearchRequest,
  TicketUpdateRequest,
} from '../../core/tickets/types.js';
import { HighLevelClient } from './client.js';

export class HighLevelTicketService implements TicketService {
  constructor(private readonly client: HighLevelClient) {}

  async list(_input: TicketListRequest): Promise<unknown[]> {
    return this.client.unsupported('tickets.list');
  }

  async get(_id: number, _options: TicketGetOptions = {}): Promise<unknown> {
    return this.client.unsupported('tickets.get');
  }

  async search(_input: TicketSearchRequest) {
    return this.client.unsupported('tickets.search');
  }

  async create(_input: TicketCreateRequest): Promise<unknown> {
    return this.client.unsupported('tickets.create');
  }

  async update(_id: number, _input: TicketUpdateRequest): Promise<unknown> {
    return this.client.unsupported('tickets.update');
  }
}
