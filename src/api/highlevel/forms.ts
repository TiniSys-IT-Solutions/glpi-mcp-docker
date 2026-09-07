import { FormService } from '../../core/forms/service.js';
import { FormListRequest, FormReviewRequest } from '../../core/forms/types.js';
import { HighLevelNotSupportedError } from './client.js';

export class HighLevelFormService implements FormService {
  async listForms(_input: FormListRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_list_forms');
  }
  async getForm(_id: number): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_get_form');
  }
  async listCategories(_input: FormListRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_list_form_categories');
  }
  async reviewForms(_input: FormReviewRequest): Promise<unknown> {
    throw new HighLevelNotSupportedError('glpi_review_forms');
  }
}
