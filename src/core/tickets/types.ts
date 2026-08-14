export interface TicketWriteRequest {
  name?: string;
  content?: string;
  type?: number;
  status?: number;
  urgency?: number;
  impact?: number;
  priority?: number;
  category_id?: number;
  entity_id?: number;
  location_id?: number;
  requester_user_id?: number;
  requester_group_id?: number;
  assigned_user_id?: number;
  assigned_group_id?: number;
  time_to_resolve?: string;

  // Temporary Legacy compatibility aliases. Prefer assigned_user_id and
  // assigned_group_id in new MCP calls.
  user_id_assign?: number;
  group_id_assign?: number;
  itilcategories_id?: number;
  entities_id?: number;
  locations_id?: number;
}

export interface TicketCreateRequest extends TicketWriteRequest {
  name: string;
  content: string;
}

export interface TicketUpdateRequest extends TicketWriteRequest {}

export interface TicketGetOptions {
  with_logs?: boolean;
}

export interface TicketListRequest {
  range?: string;
  start?: number;
  limit?: number;
  sort?: string | number;
  order?: 'ASC' | 'DESC';
  expand_dropdowns?: boolean;
  status?: number;
}

export interface TicketSearchRequest {
  status?: number;
  assigned_user_id?: number;
  assigned_group_id?: number;
  requester_user_id?: number;
  category_id?: number;
  entity_id?: number;
  priority?: number;
  urgency?: number;
  date_from?: string;
  date_to?: string;
  text_search?: string;
  open_only?: boolean;
  start?: number;
  limit?: number;
  fetch_all?: boolean;
  max_rows?: number;
  sort?: number;
  order?: 'ASC' | 'DESC';
}

export interface TicketSearchResult {
  totalcount?: number;
  count: number;
  data: unknown[];
}
