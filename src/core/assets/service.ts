import { AppendPrinterCommentRequest, PrinterUpdateRequest, ReassignPrintersRequest } from './types.js';

export interface PrinterService {
  update(id: number, input: PrinterUpdateRequest): Promise<unknown>;
  appendComment(printerId: number, input: AppendPrinterCommentRequest): Promise<unknown>;
  reassignFromImportEntityRules(input: ReassignPrintersRequest): Promise<unknown>;
}
