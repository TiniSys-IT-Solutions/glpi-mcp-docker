export interface FormListRequest {
  start?: number;
  limit?: number;
  activeOnly?: boolean;
  includeDrafts?: boolean;
}

export interface FormReviewRequest {
  formIds?: number[];
  activeOnly?: boolean;
  includeDrafts?: boolean;
  limit?: number;
}

export interface FormTextEntry {
  path: string;
  objectType: 'form' | 'section' | 'question' | 'comment' | 'option';
  objectId: number;
  field: string;
  html: string | null;
  text: string;
}
