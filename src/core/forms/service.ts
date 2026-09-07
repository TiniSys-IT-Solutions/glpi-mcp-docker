import { FormListRequest, FormReviewRequest } from './types.js';

export interface FormService {
  listForms(input: FormListRequest): Promise<unknown>;
  getForm(id: number): Promise<unknown>;
  listCategories(input: FormListRequest): Promise<unknown>;
  reviewForms(input: FormReviewRequest): Promise<unknown>;
}
