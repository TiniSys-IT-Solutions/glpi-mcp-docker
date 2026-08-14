export function normalizeTicketFields<T extends Record<string, unknown>>(ticket: T): T {
  return {
    ...ticket,
    category_id: ticket.category_id ?? ticket.itilcategories_id,
    entity_id: ticket.entity_id ?? ticket.entities_id,
    location_id: ticket.location_id ?? ticket.locations_id,
  };
}

export function normalizeTickets<T extends Record<string, unknown>>(tickets: T[]): T[] {
  return tickets.map(normalizeTicketFields);
}
