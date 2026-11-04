import { ObjectDeletionService } from '../../core/object-deletion/service.js';
import { HighLevelNotSupportedError } from './client.js';
export class HighLevelObjectDeletionService implements ObjectDeletionService {
  async preview(): Promise<unknown> { throw new HighLevelNotSupportedError('glpi_preview_delete_business_object'); }
  async delete(): Promise<unknown> { throw new HighLevelNotSupportedError('glpi_delete_business_object'); }
}
