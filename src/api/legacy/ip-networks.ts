import { IPNetworkService } from '../../core/ip-networks/service.js';
import {
  IPNetworkCreateRequest,
  IPNetworkListRequest,
  IPNetworkUpdateRequest,
  IPNetworkWriteRequest,
} from '../../core/ip-networks/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

function toListOptions(input: IPNetworkListRequest): ListOptions {
  const options: ListOptions = {};
  if (input.range) {
    options.range = input.range;
  } else {
    const start = input.start ?? 0;
    const limit = input.limit ?? 50;
    options.range = `${start}-${start + limit - 1}`;
  }
  if (input.sort !== undefined) options.sort = input.sort as number;
  options.order = input.order ?? 'ASC';
  options.expand_dropdowns = input.expand_dropdowns === false ? false : true;
  return options;
}

export function mapIPNetworkWriteInput(
  input: IPNetworkWriteRequest
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cidr !== undefined) payload.network = input.cidr;
  if (input.gateway !== undefined) payload.gateway = input.gateway;
  if (input.entity_id !== undefined) payload.entities_id = input.entity_id;
  if (input.is_recursive !== undefined) payload.is_recursive = input.is_recursive ? 1 : 0;
  if (input.addressable !== undefined) payload.addressable = input.addressable ? 1 : 0;
  if (input.comment !== undefined) payload.comment = input.comment;
  return payload;
}

export class LegacyIPNetworkService implements IPNetworkService {
  constructor(private readonly client: GlpiClient) {}

  async list(input: IPNetworkListRequest): Promise<unknown[]> {
    return this.client.getItems('IPNetwork', toListOptions(input));
  }

  async get(id: number): Promise<unknown> {
    return this.client.getItem('IPNetwork', id);
  }

  async create(input: IPNetworkCreateRequest): Promise<unknown> {
    return this.client.createItem('IPNetwork', mapIPNetworkWriteInput(input));
  }

  async update(id: number, input: IPNetworkUpdateRequest): Promise<unknown> {
    await this.client.updateItem('IPNetwork', id, mapIPNetworkWriteInput(input));
    return { success: true, id };
  }
}
