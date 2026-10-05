import { HighLevelNotSupportedError } from './client.js';
import type { AddressingCommentRequest, AddressingReportRequest, AddressingReservationApplyRequest, AddressingReservationPreviewRequest } from '../../core/addressing-sync/report-schemas.js';
import { AddressingSyncService } from '../../core/addressing-sync/service.js';
import { AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest } from '../../core/addressing-sync/types.js';

export class HighLevelAddressingSyncService implements AddressingSyncService {
  async report(_input: AddressingReportRequest): Promise<never> { return this.unsupported('report'); }
  async setComment(_input: AddressingCommentRequest): Promise<never> { return this.unsupported('setComment'); }
  async previewReservation(_input: AddressingReservationPreviewRequest): Promise<never> { return this.unsupported('previewReservation'); }
  async reserve(_input: AddressingReservationApplyRequest): Promise<never> { return this.unsupported('reserve'); }
  private unsupported(operation: string): never { throw new HighLevelNotSupportedError(`addressing-sync.${operation}`); }
  async list(_input: AddressingListRequest): Promise<never> { return this.unsupported('list'); }
  async get(_rangeId: number): Promise<never> { return this.unsupported('get'); }
  async preview(_input: AddressingPreviewRequest): Promise<never> { return this.unsupported('preview'); }
  async apply(_input: AddressingApplyRequest): Promise<never> { return this.unsupported('apply'); }
}
