export interface TicketWriteInput {
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
  user_id_assign?: number;
  group_id_assign?: number;
  time_to_resolve?: string;

  // Legacy-compatible aliases kept during migration.
  itilcategories_id?: number;
  entities_id?: number;
  locations_id?: number;
  _users_id_requester?: number;
  _groups_id_requester?: number;
  _users_id_assign?: number;
  _groups_id_assign?: number;
}

function assignIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value !== undefined) target[key] = value;
}

export function mapTicketWriteInput(input: TicketWriteInput): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  assignIfDefined(output, 'name', input.name);
  assignIfDefined(output, 'content', input.content);
  assignIfDefined(output, 'type', input.type);
  assignIfDefined(output, 'status', input.status);
  assignIfDefined(output, 'urgency', input.urgency);
  assignIfDefined(output, 'impact', input.impact);
  assignIfDefined(output, 'priority', input.priority);
  assignIfDefined(output, 'time_to_resolve', input.time_to_resolve);

  assignIfDefined(output, 'itilcategories_id', input.category_id ?? input.itilcategories_id);
  assignIfDefined(output, 'entities_id', input.entity_id ?? input.entities_id);
  assignIfDefined(output, 'locations_id', input.location_id ?? input.locations_id);

  assignIfDefined(
    output,
    '_users_id_requester',
    input.requester_user_id ?? input._users_id_requester
  );
  assignIfDefined(
    output,
    '_groups_id_requester',
    input.requester_group_id ?? input._groups_id_requester
  );
  assignIfDefined(
    output,
    '_users_id_assign',
    input.assigned_user_id ?? input.user_id_assign ?? input._users_id_assign
  );
  assignIfDefined(
    output,
    '_groups_id_assign',
    input.assigned_group_id ?? input.group_id_assign ?? input._groups_id_assign
  );

  return output;
}
