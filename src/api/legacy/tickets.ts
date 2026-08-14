import { TICKET_FIELDS, TICKET_STATUS, TICKET_URGENCY } from '../../core/tickets/constants.js';
import { normalizeTicketFields, normalizeTickets } from '../../core/tickets/normalizer.js';
import { TicketService } from '../../core/tickets/service.js';
import {
  TicketCreateRequest,
  TicketGetOptions,
  TicketListRequest,
  TicketSearchRequest,
  TicketUpdateRequest,
} from '../../core/tickets/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';
import { SearchCriterion } from './search.js';

function toListOptions(input: TicketListRequest): ListOptions {
  const opts: ListOptions = {};
  if (input.range) {
    opts.range = input.range;
  } else {
    const start = input.start ?? 0;
    const limit = input.limit ?? 50;
    opts.range = `${start}-${start + limit - 1}`;
  }
  if (input.sort !== undefined) opts.sort = input.sort as number;
  opts.order = input.order ?? 'DESC';
  opts.expand_dropdowns = input.expand_dropdowns === false ? false : true;
  return opts;
}

export class LegacyTicketService implements TicketService {
  constructor(private readonly client: GlpiClient) {}

  async list(input: TicketListRequest): Promise<unknown[]> {
    let tickets = await this.client.getTickets(toListOptions(input));
    if (typeof input.status === 'number') {
      tickets = tickets.filter((ticket: any) => ticket.status === input.status);
    }
    return normalizeTickets(tickets as unknown as Record<string, unknown>[]);
  }

  async get(id: number, options: TicketGetOptions = {}): Promise<unknown> {
    const [ticket, followups, tasks, solutions] = await Promise.all([
      this.client.getTicket(id, { with_logs: options.with_logs }),
      this.client.getTicketFollowups(id),
      this.client.getTicketTasks(id),
      this.client.getTicketSolutions(id),
    ]);

    return normalizeTicketFields({
      ...(ticket as unknown as Record<string, unknown>),
      status_label: TICKET_STATUS[(ticket as any).status],
      urgency_label: TICKET_URGENCY[(ticket as any).urgency],
      priority_label: TICKET_URGENCY[(ticket as any).priority],
      counts: {
        followups: followups.length,
        tasks: tasks.length,
        solutions: solutions.length,
      },
    });
  }

  async search(input: TicketSearchRequest) {
    const criteria: SearchCriterion[] = [];
    const push = (criterion: SearchCriterion) => {
      if (criteria.length > 0 && !criterion.link) criterion.link = 'AND';
      criteria.push(criterion);
    };

    if (input.status !== undefined) push({ field: TICKET_FIELDS.status, searchtype: 'equals', value: input.status });
    if (input.assigned_user_id !== undefined) push({ field: TICKET_FIELDS.technician_user, searchtype: 'equals', value: input.assigned_user_id });
    if (input.assigned_group_id !== undefined) push({ field: TICKET_FIELDS.technician_group, searchtype: 'equals', value: input.assigned_group_id });
    if (input.requester_user_id !== undefined) push({ field: TICKET_FIELDS.requester_user, searchtype: 'equals', value: input.requester_user_id });
    if (input.category_id !== undefined) push({ field: TICKET_FIELDS.category, searchtype: 'equals', value: input.category_id });
    if (input.entity_id !== undefined) push({ field: TICKET_FIELDS.entity, searchtype: 'equals', value: input.entity_id });
    if (input.priority !== undefined) push({ field: TICKET_FIELDS.priority, searchtype: 'equals', value: input.priority });
    if (input.urgency !== undefined) push({ field: TICKET_FIELDS.urgency, searchtype: 'equals', value: input.urgency });
    if (input.date_from) push({ field: TICKET_FIELDS.date, searchtype: 'morethan', value: input.date_from });
    if (input.date_to) push({ field: TICKET_FIELDS.date, searchtype: 'lessthan', value: input.date_to });
    if (input.text_search) push({ field: TICKET_FIELDS.name, searchtype: 'contains', value: input.text_search });
    if (input.open_only) push({ field: TICKET_FIELDS.status, searchtype: 'lessthan', value: 5 });

    const result = await this.client.search.search('Ticket', {
      criteria,
      start: input.start ?? 0,
      limit: input.limit ?? 50,
      fetchAll: input.fetch_all,
      maxRows: input.max_rows,
      sort: input.sort,
      order: input.order ?? 'DESC',
      expandDropdowns: true,
    });

    return {
      totalcount: result.totalcount,
      count: result.count,
      data: normalizeTickets(result.data as Record<string, unknown>[]),
    };
  }

  async create(input: TicketCreateRequest): Promise<unknown> {
    return this.client.createTicket(input);
  }

  async update(id: number, input: TicketUpdateRequest): Promise<unknown> {
    await this.client.updateTicket(id, input);
    return { success: true, id };
  }
}
