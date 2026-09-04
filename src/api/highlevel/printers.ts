import { PrinterService } from '../../core/assets/service.js';
import { AppendPrinterCommentRequest, PrinterUpdateRequest, ReassignPrintersRequest } from '../../core/assets/types.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelPrinterService implements PrinterService {
  async update(_id: number, _input: PrinterUpdateRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_update_printer');
  }
  async appendComment(_printerId: number, _input: AppendPrinterCommentRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_append_printer_comment');
  }
  async reassignFromImportEntityRules(_input: ReassignPrintersRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_reassign_printers_from_import_entity_rules');
  }
}
