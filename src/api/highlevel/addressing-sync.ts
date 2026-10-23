import { HighLevelApiError, HighLevelClient, HighLevelNotSupportedError } from './client.js';
import type { AddressingCommentRequest, AddressingReportRequest, AddressingReservationApplyRequest, AddressingReservationPreviewRequest } from '../../core/addressing-sync/report-schemas.js';
import { AddressingSyncService } from '../../core/addressing-sync/service.js';
import { AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest } from '../../core/addressing-sync/types.js';

export class HighLevelAddressingSyncService implements AddressingSyncService {
  constructor(private readonly client?: HighLevelClient) {}
  async report(input: AddressingReportRequest): Promise<unknown> {
    if (!this.client) return this.unsupported('report');
    const query = new URLSearchParams({ range_id: String(input.range_id), start: String(input.start), limit: String(input.limit) });
    return this.companionRequest(`GenbioCustom/Addressing/Report?${query}`, input);
  }
  async setComment(input: AddressingCommentRequest): Promise<unknown> {
    if (!this.client) return this.unsupported('setComment');
    return this.companionRequest('GenbioCustom/Addressing/IpComment', input, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  private async companionRequest(
    path: string,
    target: { range_id: number; ip?: string },
    init?: RequestInit
  ): Promise<unknown> {
    const context = `Addressing transport=companion_api route=${path.split('?')[0]} range_id=${target.range_id}${target.ip ? ` ip=${target.ip}` : ''}`;
    try {
      return await this.client!.request(path, init);
    } catch (error) {
      if (error instanceof HighLevelApiError) {
        throw new HighLevelApiError(error.status, `${context}: ${error.detail}`, error.body);
      }
      throw new Error(`${context}: ${error instanceof Error ? error.message : 'request failed'}`, { cause: error });
    }
  }
  async previewReservation(_input: AddressingReservationPreviewRequest): Promise<never> { return this.unsupported('previewReservation'); }
  async reserve(_input: AddressingReservationApplyRequest): Promise<never> { return this.unsupported('reserve'); }
  private unsupported(operation: string): never { throw new HighLevelNotSupportedError(`addressing-sync.${operation}`); }
  async list(_input: AddressingListRequest): Promise<never> { return this.unsupported('list'); }
  async get(_rangeId: number): Promise<never> { return this.unsupported('get'); }
  async preview(_input: AddressingPreviewRequest): Promise<never> { return this.unsupported('preview'); }
  async apply(_input: AddressingApplyRequest): Promise<never> { return this.unsupported('apply'); }
}
