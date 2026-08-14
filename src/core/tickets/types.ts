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
}
