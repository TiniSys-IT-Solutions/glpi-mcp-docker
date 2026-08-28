import {
  IPNetworkCreateRequest,
  IPNetworkListRequest,
  IPNetworkUpdateRequest,
} from './types.js';

export interface IPNetworkService {
  list(input: IPNetworkListRequest): Promise<unknown[]>;
  get(id: number): Promise<unknown>;
  create(input: IPNetworkCreateRequest): Promise<unknown>;
  update(id: number, input: IPNetworkUpdateRequest): Promise<unknown>;
}
