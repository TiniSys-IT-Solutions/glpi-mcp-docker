import { HighLevelNotSupportedError } from './client.js';
import { AddressingSyncService } from '../../core/addressing-sync/service.js';
import { AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest } from '../../core/addressing-sync/types.js';

export class HighLevelAddressingSyncService implements AddressingSyncService {
  private unsupported(operation: string): never { throw new HighLevelNotSupportedError(`addressing-sync.${operation}`); }
  async list(_input: AddressingListRequest): Promise<never> { return this.unsupported('list'); }
  async get(_rangeId: number): Promise<never> { return this.unsupported('get'); }
  async preview(_input: AddressingPreviewRequest): Promise<never> { return this.unsupported('preview'); }
  async apply(_input: AddressingApplyRequest): Promise<never> { return this.unsupported('apply'); }
}
