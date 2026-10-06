import type { AddressingCommentRequest, AddressingReportRequest, AddressingReservationApplyRequest, AddressingReservationPreviewRequest } from '../../core/addressing-sync/report-schemas.js';
import type { AddressingSyncService } from '../../core/addressing-sync/service.js';
import type { AddressingApplyRequest, AddressingListRequest, AddressingPreviewRequest } from '../../core/addressing-sync/types.js';

export class CompanionAddressingSyncService implements AddressingSyncService {
  constructor(private readonly companion: AddressingSyncService, private readonly legacy: AddressingSyncService) {}
  report(input: AddressingReportRequest) { return this.companion.report(input); }
  setComment(input: AddressingCommentRequest) { return this.companion.setComment(input); }
  previewReservation(input: AddressingReservationPreviewRequest) { return this.legacy.previewReservation(input); }
  reserve(input: AddressingReservationApplyRequest) { return this.legacy.reserve(input); }
  list(input: AddressingListRequest) { return this.legacy.list(input); }
  get(rangeId: number) { return this.legacy.get(rangeId); }
  preview(input: AddressingPreviewRequest) { return this.legacy.preview(input); }
  apply(input: AddressingApplyRequest) { return this.legacy.apply(input); }
}
