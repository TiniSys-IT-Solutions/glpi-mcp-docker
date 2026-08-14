export const TICKET_STATUS: Record<number, string> = {
  1: 'New',
  2: 'Processing (assigned)',
  3: 'Processing (planned)',
  4: 'Pending',
  5: 'Solved',
  6: 'Closed',
};

export const TICKET_URGENCY: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very high',
};

// Standard Ticket search-option field ids (GLPI >= 9.5). These are fallbacks;
// the Legacy SearchOptions cache can resolve friendly names dynamically.
export const TICKET_FIELDS = {
  id: 2,
  name: 1,
  status: 12,
  date: 15,
  date_mod: 19,
  solvedate: 17,
  closedate: 16,
  priority: 3,
  urgency: 10,
  impact: 11,
  category: 7,
  entity: 80,
  requester_user: 4,
  technician_user: 5,
  technician_group: 8,
  type: 14,
};
