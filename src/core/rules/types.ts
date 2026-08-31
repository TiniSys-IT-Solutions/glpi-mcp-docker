export interface RuleListRequest {
  start?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

