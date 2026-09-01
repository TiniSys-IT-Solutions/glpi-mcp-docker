#!/usr/bin/env node

/**
 * MCP Server for GLPI v3.0
 *
 * Major changes vs v2:
 *   - Unified HTTP layer with auto-reauth, structured errors, retries.
 *   - List tools accept start/limit/fetch_all/forcedisplay/criteria/sort/order
 *     (backward-compatible: `limit` alone still works).
 *   - New `glpi_count` and `glpi_search_v2` (multi-criteria, forcedisplay).
 *   - High-level `glpi_search_tickets` with friendly params (status/assigned/...).
 *   - `glpi_get_ticket_timeline` merges followups+tasks+solutions+validations.
 *   - `glpi_tickets_stats_by` ventilation by status/category/technician/entity/month.
 *   - Link, validation, document, SLA, satisfaction tools.
 *   - Field-id mapping via /listSearchOptions for resilience across GLPI versions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { basename, extname } from 'node:path';
import { isIP } from 'node:net';
import { z } from 'zod';
import { GlpiClient, ListOptions } from './api/legacy/glpi-client.js';
import { GlpiError } from './api/legacy/http.js';
import { cidrToIPRange } from './api/legacy/inventory-plugin.js';
import { SearchCriterion, SearchType, SearchLink } from './api/legacy/search.js';
import { loadConfig } from './config/env.js';
import { TICKET_FIELDS, TICKET_STATUS, TICKET_URGENCY } from './core/tickets/constants.js';
import { TicketService } from './core/tickets/service.js';
import { IPNetworkService } from './core/ip-networks/service.js';
import { InventoryPluginResource, InventoryPluginService } from './core/inventory-plugin/service.js';
import { SessionService } from './core/session/service.js';
import { ImportEntityRuleService } from './core/rules/service.js';
import { OrganizationService } from './core/organization/service.js';
import { PRODUCT_NAME, PRODUCT_VERSION, formatBuildInfo, getBuildInfo } from './build-info.js';
import { ApiRouter, createApiRouter } from './routing/api-router.js';
import { readSafeUpload } from './security/upload.js';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const listArgsSchema = z.object({
  start: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  range: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
  expand_dropdowns: z.boolean().optional(),
  criteria: z.array(z.unknown()).optional(),
  fetch_all: z.boolean().optional(),
}).passthrough();

const ticketReadSchema = z.object({
  id: z.number().int().min(1),
  with_logs: z.boolean().optional(),
}).passthrough();

const ticketSearchSchema = z.object({
  status: z.number().optional(),
  assigned_user_id: z.number().optional(),
  assigned_group_id: z.number().optional(),
  requester_user_id: z.number().optional(),
  category_id: z.number().optional(),
  entity_id: z.number().optional(),
  priority: z.number().optional(),
  urgency: z.number().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  text_search: z.string().optional(),
  open_only: z.boolean().optional(),
  start: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
}).passthrough();

function isValidCidr(value: string): boolean {
  const separator = value.lastIndexOf('/');
  if (separator <= 0) return false;
  const address = value.slice(0, separator).trim();
  const prefix = Number(value.slice(separator + 1));
  const version = isIP(address);
  return Number.isInteger(prefix) && (
    (version === 4 && prefix >= 0 && prefix <= 32) ||
    (version === 6 && prefix >= 0 && prefix <= 128)
  );
}

const ipNetworkFieldsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  cidr: z.string().trim().refine(isValidCidr, {
    message: 'Expected IPv4 or IPv6 CIDR notation, for example 192.0.2.0/24',
  }).optional(),
  gateway: z.string().trim().refine((value) => value === '' || isIP(value) !== 0, {
    message: 'Expected a valid IPv4 or IPv6 address',
  }).optional(),
  entity_id: z.number().int().min(0).optional(),
  is_recursive: z.boolean().optional(),
  addressable: z.boolean().optional(),
  comment: z.string().optional(),
});

const ipNetworkCreateSchema = ipNetworkFieldsSchema.extend({
  name: z.string().trim().min(1),
  cidr: z.string().trim().refine(isValidCidr, {
    message: 'Expected IPv4 or IPv6 CIDR notation, for example 192.0.2.0/24',
  }),
});

const ipNetworkUpdateSchema = ipNetworkFieldsSchema.extend({
  id: z.number().int().min(1),
}).refine(({ id: _id, ...fields }) => Object.values(fields).some((value) => value !== undefined), {
  message: 'At least one field to update is required',
});

const importEntitySubnetRuleCreateSchema = z.object({
  name: z.string().trim().min(1),
  cidr: z.string().trim().refine((value) => {
    try {
      const { ip_start } = cidrToIPRange(value, false);
      return value.split('/')[0] === ip_start;
    } catch {
      return false;
    }
  }, { message: 'Expected a canonical IPv4 CIDR, for example 10.63.170.0/24' }),
  target_entity_id: z.number().int().min(1),
  target_location_id: z.number().int().min(1),
  scope_entity_id: z.number().int().min(0).optional(),
  ranking: z.number().int().min(0).optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  recursive: z.boolean().optional(),
});

const importEntityRuleEnabledSchema = z.object({
  rule_id: z.number().int().min(1),
  enabled: z.boolean(),
  confirmation: z.literal('I_HAVE_VERIFIED_THE_RULE'),
});

const gpsFieldsSchema = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  altitude: z.number().optional(),
};

const locationCreateSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  alias: z.string().trim().min(1).optional(),
  comment: z.string().optional(),
  entity_id: z.number().int().min(0).optional(),
  is_recursive: z.boolean().optional(),
  parent_location_id: z.number().int().min(1).optional(),
  locations_id: z.number().int().min(1).optional(),
  room: z.string().optional(),
  building: z.string().optional(),
  address: z.string().optional(),
  town: z.string().optional(),
  postcode: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  ...gpsFieldsSchema,
});

const entityCreateSchema = z.object({
  name: z.string().trim().min(1),
  parent_entity_id: z.number().int().min(0).optional(),
  comment: z.string().optional(),
  registration_number: z.string().optional(),
  address: z.string().optional(),
  postcode: z.string().optional(),
  town: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  ...gpsFieldsSchema,
  website: z.string().url().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROBLEM_STATUS: Record<number, string> = {
  1: 'New', 2: 'Accepted', 3: 'Planned', 4: 'Pending', 5: 'Solved', 6: 'Closed',
};

const CHANGE_STATUS: Record<number, string> = {
  1: 'New', 2: 'Evaluation', 3: 'Approval', 4: 'Accepted', 5: 'Pending',
  6: 'Test', 7: 'Qualification', 8: 'Applied', 9: 'Review', 10: 'Closed',
  11: 'Refused', 12: 'Canceled',
};

const VALIDATION_STATUS: Record<number, string> = {
  1: 'Waiting', 2: 'Granted', 3: 'Refused',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse common list-tool arguments into a ListOptions.
 *
 * Accepts (in order of precedence):
 *   - `range`: "START-END" string passed through as-is
 *   - `start` + `limit`: assembled into range
 *   - `limit` alone: range = "0-{limit-1}" (backward-compat with v2)
 */
function parseListArgs(args: Record<string, unknown> | undefined): ListOptions {
  const opts: ListOptions = {};
  if (!args) return { range: '0-49', expand_dropdowns: true };

  if (typeof args.range === 'string') {
    opts.range = args.range;
  } else if (args.start !== undefined || args.limit !== undefined) {
    const start = (args.start as number) ?? 0;
    const limit = (args.limit as number) ?? 50;
    opts.range = `${start}-${start + limit - 1}`;
  } else {
    opts.range = '0-49';
  }

  if (args.sort !== undefined) opts.sort = args.sort as number;
  if (args.order) opts.order = args.order as 'ASC' | 'DESC';
  if (args.is_deleted !== undefined) opts.is_deleted = args.is_deleted as boolean;
  if (args.include_deleted !== undefined) opts.is_deleted = args.include_deleted as boolean;
  // Default expand_dropdowns to true for human-readable output.
  opts.expand_dropdowns =
    args.expand_dropdowns === false ? false : true;
  return opts;
}

interface CriteriaArg {
  field: number | string;
  searchtype: SearchType;
  value: string | number | boolean;
  link?: SearchLink;
}

async function resolveCriteria(
  client: GlpiClient,
  itemtype: string,
  raw: CriteriaArg[]
): Promise<SearchCriterion[]> {
  return Promise.all(
    raw.map(async (c) => ({
      field: (await client.searchOptions.resolveField(itemtype, c.field)) ??
        (typeof c.field === 'number' ? c.field : 0),
      searchtype: c.searchtype,
      value: c.value,
      link: c.link,
    }))
  );
}

function text(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}

function formatTicketSummary(t: any) {
  return {
    id: t.id,
    name: t.name,
    status: TICKET_STATUS[t.status] ?? t.status,
    urgency: TICKET_URGENCY[t.urgency] ?? t.urgency,
    priority: TICKET_URGENCY[t.priority] ?? t.priority,
    date: t.date,
    date_mod: t.date_mod,
    entities_id: t.entities_id,
    itilcategories_id: t.itilcategories_id,
  };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: PRODUCT_NAME, version: PRODUCT_VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

let apiRouter: ApiRouter;
let client: GlpiClient;
let ticketService: TicketService;
let ipNetworkService: IPNetworkService;
let inventoryPluginService: InventoryPluginService;
let sessionService: SessionService;
let importEntityRuleService: ImportEntityRuleService;
let organizationService: OrganizationService;

const TICKET_SERVICE_TOOLS = new Set([
  'glpi_list_tickets',
  'glpi_get_ticket',
  'glpi_search_tickets',
  'glpi_create_ticket',
  'glpi_update_ticket',
]);

const IMPORT_ENTITY_RULE_SERVICE_TOOLS = new Set([
  'glpi_list_import_entity_rules',
  'glpi_get_import_entity_rule',
  'glpi_list_import_entity_rule_criteria',
  'glpi_get_import_entity_rule_criterion',
  'glpi_list_import_entity_rule_actions',
  'glpi_get_import_entity_rule_action',
  'glpi_create_import_entity_subnet_rule',
  'glpi_set_import_entity_rule_enabled',
]);

const ORGANIZATION_SERVICE_TOOLS = new Set([
  'glpi_list_locations',
  'glpi_get_location',
  'glpi_create_location',
  'glpi_list_entities',
  'glpi_get_entity',
  'glpi_create_entity',
]);

function isTicketServiceTool(toolName: string): boolean {
  return TICKET_SERVICE_TOOLS.has(toolName);
}

function isBackendServiceTool(toolName: string): boolean {
  return isTicketServiceTool(toolName) ||
    IMPORT_ENTITY_RULE_SERVICE_TOOLS.has(toolName) ||
    ORGANIZATION_SERVICE_TOOLS.has(toolName) ||
    toolName === 'glpi_get_session_info';
}

function requireLegacyClient(toolName: string): GlpiClient {
  if (!client) {
    throw new McpError(ErrorCode.InvalidRequest, `Not supported in GLPI_API_MODE=highlevel: ${toolName}`);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const LIST_TOOL_COMMON_PROPS = {
  start: { type: 'number', description: 'Offset (default 0)' },
  limit: { type: 'number', description: 'Max rows in this call (default 50)' },
  range: { type: 'string', description: 'Explicit "START-END" range; overrides start/limit' },
  sort: { type: 'number', description: 'Sort by field id (search option id)' },
  order: { type: 'string', enum: ['ASC', 'DESC'] },
  expand_dropdowns: { type: 'boolean', description: 'Resolve FK ids to labels (default true)' },
};

const INVENTORY_PLUGIN_READ_TOOLS: Array<{
  resource: InventoryPluginResource;
  plural: string;
  singular: string;
  description: string;
}> = [
  { resource: 'credentials', plural: 'credentials', singular: 'credential', description: 'remote-device credentials (secrets are never returned)' },
  { resource: 'tasks', plural: 'tasks', singular: 'task', description: 'inventory tasks' },
  { resource: 'task_jobs', plural: 'task_jobs', singular: 'task_job', description: 'inventory task jobs' },
  { resource: 'task_job_states', plural: 'task_job_states', singular: 'task_job_state', description: 'task execution states' },
  { resource: 'timeslots', plural: 'timeslots', singular: 'timeslot', description: 'execution time slots' },
  { resource: 'collects', plural: 'collects', singular: 'collect', description: 'collection definitions' },
  { resource: 'collect_files', plural: 'collect_files', singular: 'collect_file', description: 'file collection definitions' },
  { resource: 'collect_registries', plural: 'collect_registries', singular: 'collect_registry', description: 'registry collection definitions' },
  { resource: 'collect_wmi_queries', plural: 'collect_wmi_queries', singular: 'collect_wmi_query', description: 'WMI collection definitions' },
  { resource: 'deploy_packages', plural: 'deploy_packages', singular: 'deploy_package', description: 'deployment packages' },
  { resource: 'deploy_groups', plural: 'deploy_groups', singular: 'deploy_group', description: 'deployment target groups' },
];

/** MIME types for glpi_upload_document, keyed by lowercase file extension. */
const UPLOAD_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
};

// ---------------------------------------------------------------------------
// Tool safety annotations (MCP ToolAnnotations)
//
// Derived from the tool name so every current and future tool gets hints:
//   - list/get/search/count/stats  -> readOnlyHint
//   - delete                       -> destructiveHint (data loss possible)
//   - update/set/assign            -> destructiveHint (overwrites existing data)
//   - create/add/link/attach       -> additive write (non-destructive, non-idempotent)
// openWorldHint is false everywhere: tools only reach the configured GLPI.
// ---------------------------------------------------------------------------

interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

function toolAnnotations(name: string): ToolAnnotations {
  if (/^glpi_(list_|get_|search|count$|tickets_stats)/.test(name) || /^glpi_inventory_(list|get)_/.test(name)) {
    return { readOnlyHint: true, openWorldHint: false };
  }
  if (/^glpi_delete_/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  if (/^glpi_(update_|set_|assign_)/.test(name) || /^glpi_inventory_(update_|enable_|disable_)/.test(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  }
  // create / add / link / attach: additive writes. Re-running duplicates data.
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
}

function annotate<T extends { name: string }>(tool: T): T & { annotations: ToolAnnotations } {
  return { ...tool, annotations: toolAnnotations(tool.name) };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ============== READ — TICKETS ==============
    {
      name: 'glpi_list_tickets',
      description: 'List tickets. Supports start/limit/range/sort/order/status filter.',
      inputSchema: {
        type: 'object',
        properties: {
          ...LIST_TOOL_COMMON_PROPS,
          status: { type: 'number', description: '1=New 2=Assigned 3=Planned 4=Pending 5=Solved 6=Closed' },
        },
      },
    },
    {
      name: 'glpi_get_ticket',
      description: 'Get a ticket with status/urgency labels and counts of linked items.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          with_logs: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'glpi_get_ticket_timeline',
      description: 'Full chronological timeline of a ticket: followups + tasks + solutions + validations, sorted by date.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    },
    {
      name: 'glpi_search_tickets',
      description: 'High-level ticket search with friendly params. Use this instead of glpi_search_v2 for tickets.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'number', description: '1..6 (see status reference)' },
          assigned_user_id: { type: 'number' },
          assigned_group_id: { type: 'number' },
          requester_user_id: { type: 'number' },
          category_id: { type: 'number' },
          entity_id: { type: 'number' },
          priority: { type: 'number', description: '1=Very low .. 5=Very high' },
          urgency: { type: 'number', description: '1..5' },
          date_from: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS' },
          date_to: { type: 'string', description: 'YYYY-MM-DD HH:MM:SS' },
          text_search: { type: 'string', description: 'Free text in title' },
          open_only: { type: 'boolean', description: 'Status < 5 only' },
          start: { type: 'number' },
          limit: { type: 'number' },
          fetch_all: { type: 'boolean', description: 'Paginate until totalcount; capped by max_rows (default 1000).' },
          max_rows: { type: 'number' },
          order: { type: 'string', enum: ['ASC', 'DESC'] },
          sort: { type: 'number' },
        },
      },
    },
    {
      name: 'glpi_get_ticket_followups',
      description: 'List followups of a ticket.',
      inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] },
    },
    {
      name: 'glpi_get_ticket_tasks',
      description: 'List tasks of a ticket.',
      inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] },
    },
    {
      name: 'glpi_get_ticket_solutions',
      description: 'List solutions of a ticket.',
      inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] },
    },
    {
      name: 'glpi_get_ticket_validations',
      description: 'List validations (approvals) of a ticket.',
      inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] },
    },
    {
      name: 'glpi_get_ticket_documents',
      description: 'List documents (attachments) of a ticket.',
      inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] },
    },

    // ============== WRITE — TICKETS ==============
    {
      name: 'glpi_create_ticket',
      description: 'Create a new ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          content: { type: 'string' },
          urgency: { type: 'number' },
          impact: { type: 'number' },
          priority: { type: 'number' },
          type: { type: 'number', description: '1=Incident, 2=Request' },
          category_id: { type: 'number' },
          entity_id: { type: 'number' },
          location_id: { type: 'number' },
          user_id_assign: { type: 'number' },
          group_id_assign: { type: 'number' },
          assigned_user_id: { type: 'number' },
          assigned_group_id: { type: 'number' },
          requester_user_id: { type: 'number' },
          requester_group_id: { type: 'number' },
          time_to_resolve: { type: 'string' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'glpi_update_ticket',
      description: 'Update fields of a ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          content: { type: 'string' },
          status: { type: 'number' },
          urgency: { type: 'number' },
          priority: { type: 'number' },
          impact: { type: 'number' },
          type: { type: 'number', description: '1=Incident, 2=Request' },
          category_id: { type: 'number' },
          entity_id: { type: 'number' },
          location_id: { type: 'number' },
          requester_user_id: { type: 'number' },
          requester_group_id: { type: 'number' },
          assigned_user_id: { type: 'number' },
          assigned_group_id: { type: 'number' },
          time_to_resolve: { type: 'string' },
          itilcategories_id: { type: 'number', description: 'Deprecated Legacy alias; use category_id.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'glpi_delete_ticket',
      description: '⚠️ DESTRUCTIVE: delete a ticket. force=true purges (irrecoverable).',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' }, force: { type: 'boolean' } },
        required: ['id'],
      },
    },
    {
      name: 'glpi_add_followup',
      description: 'Add a followup comment to a ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          content: { type: 'string' },
          is_private: { type: 'boolean' },
        },
        required: ['ticket_id', 'content'],
      },
    },
    {
      name: 'glpi_add_task',
      description: 'Add a task (with time tracking) to a ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          content: { type: 'string' },
          actiontime: { type: 'number' },
          is_private: { type: 'boolean' },
          state: { type: 'number', description: '0=Info 1=Todo 2=Done' },
          users_id_tech: { type: 'number' },
          groups_id_tech: { type: 'number' },
        },
        required: ['ticket_id', 'content'],
      },
    },
    {
      name: 'glpi_add_solution',
      description: 'Add a solution to a ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          content: { type: 'string' },
          solutiontypes_id: { type: 'number' },
        },
        required: ['ticket_id', 'content'],
      },
    },
    {
      name: 'glpi_assign_ticket',
      description: 'Assign a ticket to a user OR a group. type: 1=requester, 2=assigned, 3=observer.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          user_id: { type: 'number' },
          group_id: { type: 'number' },
          type: { type: 'number' },
        },
        required: ['ticket_id'],
      },
    },
    {
      name: 'glpi_link_tickets',
      description: 'Link two tickets. link_type: 1=link 2=duplicate 3=parent.',
      inputSchema: {
        type: 'object',
        properties: {
          parent_id: { type: 'number' },
          child_id: { type: 'number' },
          link_type: { type: 'number' },
        },
        required: ['parent_id', 'child_id'],
      },
    },
    {
      name: 'glpi_add_ticket_validation',
      description: 'Request a validation (approval) on a ticket. The chosen user receives the approval request.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          users_id_validate: { type: 'number', description: 'User asked to validate' },
          comment_submission: { type: 'string' },
        },
        required: ['ticket_id', 'users_id_validate'],
      },
    },
    {
      name: 'glpi_set_validation_status',
      description: 'Approve (2) or refuse (3) an existing TicketValidation. Provide optional comment.',
      inputSchema: {
        type: 'object',
        properties: {
          validation_id: { type: 'number' },
          status: { type: 'number', enum: [2, 3], description: '2=granted, 3=refused' },
          comment_validation: { type: 'string' },
        },
        required: ['validation_id', 'status'],
      },
    },
    {
      name: 'glpi_upload_document',
      description:
        'Upload a local file (by path) as a GLPI Document. If ticket_id is set, the document is also attached to that ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path relative to MCP_UPLOAD_ROOT (default: /uploads)',
          },
          name: { type: 'string', description: 'Document title (default: file name)' },
          ticket_id: {
            type: 'number',
            description: 'If set, attach the uploaded document to this ticket',
          },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'glpi_attach_document_to_ticket',
      description: 'Link an existing document (uploaded separately) to a ticket via Document_Item.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket_id: { type: 'number' },
          document_id: { type: 'number' },
        },
        required: ['ticket_id', 'document_id'],
      },
    },
    {
      name: 'glpi_get_ticket_satisfaction',
      description: 'Get satisfaction survey data (score, comment) for a ticket.',
      inputSchema: {
        type: 'object',
        properties: { ticket_id: { type: 'number' } },
        required: ['ticket_id'],
      },
    },
    {
      name: 'glpi_list_overdue_tickets',
      description: 'List tickets whose SLA resolution deadline (time_to_resolve) is in the past and status < 5.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_id: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },

    // ============== PROBLEMS / CHANGES ==============
    {
      name: 'glpi_list_problems',
      description: 'List problems.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_problem',
      description: 'Get a problem with status label.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_problem',
      description: 'Create a problem.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, content: { type: 'string' },
          urgency: { type: 'number' }, impact: { type: 'number' }, priority: { type: 'number' },
          category_id: { type: 'number' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'glpi_update_problem',
      description: 'Update a problem.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' }, name: { type: 'string' }, content: { type: 'string' },
          status: { type: 'number' }, urgency: { type: 'number' },
        },
        required: ['id'],
      },
    },
    {
      name: 'glpi_list_changes',
      description: 'List changes.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_change',
      description: 'Get a change with status label.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_change',
      description: 'Create a change.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, content: { type: 'string' },
          urgency: { type: 'number' }, impact: { type: 'number' }, priority: { type: 'number' },
          category_id: { type: 'number' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'glpi_update_change',
      description: 'Update a change.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' }, name: { type: 'string' }, content: { type: 'string' },
          status: { type: 'number' },
        },
        required: ['id'],
      },
    },

    // ============== ASSETS ==============
    ...[
      'computers', 'softwares', 'network_equipments', 'printers', 'monitors', 'phones',
    ].flatMap((asset) => {
      const singular = asset.replace(/s$/, '');
      return [
        {
          name: `glpi_list_${asset}`,
          description: `List ${asset.replace('_', ' ')}.`,
          inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
        },
        {
          name: `glpi_get_${singular}`,
          description: `Get a ${singular.replace('_', ' ')} by id.`,
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              with_softwares: { type: 'boolean' },
              with_networkports: { type: 'boolean' },
              with_connections: { type: 'boolean' },
              with_documents: { type: 'boolean' },
            },
            required: ['id'],
          },
        },
      ];
    }),
    {
      name: 'glpi_create_computer',
      description: 'Add a computer to inventory.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          serial: { type: 'string' }, otherserial: { type: 'string' },
          contact: { type: 'string' }, comment: { type: 'string' },
          locations_id: { type: 'number' }, states_id: { type: 'number' },
          computertypes_id: { type: 'number' }, manufacturers_id: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_update_computer',
      description: 'Update a computer.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' }, name: { type: 'string' }, serial: { type: 'string' },
          comment: { type: 'string' }, locations_id: { type: 'number' }, states_id: { type: 'number' },
        },
        required: ['id'],
      },
    },
    {
      name: 'glpi_delete_computer',
      description: '⚠️ DESTRUCTIVE: delete a computer. force=true purges.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' }, force: { type: 'boolean' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_software',
      description: 'Add software.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, comment: { type: 'string' },
          manufacturers_id: { type: 'number' }, softwarecategories_id: { type: 'number' },
        },
        required: ['name'],
      },
    },

    // ============== IMPORT ENTITY RULES ==============
    {
      name: 'glpi_list_import_entity_rules',
      description: 'List rules that assign inventoried items to GLPI entities, in evaluation order.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_import_entity_rule',
      description: 'Get one entity-assignment rule, including its criteria and actions when available.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'GLPI rule id' } },
        required: ['id'],
      },
    },
    {
      name: 'glpi_list_import_entity_rule_criteria',
      description: 'List the matching criteria attached to one entity-assignment rule.',
      inputSchema: {
        type: 'object',
        properties: { rule_id: { type: 'number' }, ...LIST_TOOL_COMMON_PROPS },
        required: ['rule_id'],
      },
    },
    {
      name: 'glpi_get_import_entity_rule_criterion',
      description: 'Get one matching criterion attached to an entity-assignment rule.',
      inputSchema: {
        type: 'object',
        properties: { rule_id: { type: 'number' }, criterion_id: { type: 'number' } },
        required: ['rule_id', 'criterion_id'],
      },
    },
    {
      name: 'glpi_list_import_entity_rule_actions',
      description: 'List the assignment actions attached to one entity-assignment rule.',
      inputSchema: {
        type: 'object',
        properties: { rule_id: { type: 'number' }, ...LIST_TOOL_COMMON_PROPS },
        required: ['rule_id'],
      },
    },
    {
      name: 'glpi_get_import_entity_rule_action',
      description: 'Get one assignment action attached to an entity-assignment rule.',
      inputSchema: {
        type: 'object',
        properties: { rule_id: { type: 'number' }, action_id: { type: 'number' } },
        required: ['rule_id', 'action_id'],
      },
    },
    {
      name: 'glpi_create_import_entity_subnet_rule',
      description: 'Create a complete IPv4 CIDR entity-assignment rule with entity and location actions. The rule is always created disabled and must be verified before explicit activation.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cidr: { type: 'string', description: 'Canonical IPv4 network in CIDR notation, for example 10.63.170.0/24' },
          target_entity_id: { type: 'number' },
          target_location_id: { type: 'number' },
          scope_entity_id: { type: 'number', description: 'Rule scope entity; defaults to root entity 0' },
          ranking: { type: 'number', description: 'Evaluation order; omit to let GLPI choose' },
          description: { type: 'string' },
          comment: { type: 'string' },
          recursive: { type: 'boolean', description: 'Apply rule scope to sub-entities; defaults to false' },
        },
        required: ['name', 'cidr', 'target_entity_id', 'target_location_id'],
      },
    },
    {
      name: 'glpi_set_import_entity_rule_enabled',
      description: 'Enable or disable an existing entity-assignment rule after its criteria, actions and ranking have been verified.',
      inputSchema: {
        type: 'object',
        properties: {
          rule_id: { type: 'number' },
          enabled: { type: 'boolean' },
          confirmation: { type: 'string', enum: ['I_HAVE_VERIFIED_THE_RULE'] },
        },
        required: ['rule_id', 'enabled', 'confirmation'],
      },
    },

    // ============== IP NETWORKS ==============
    {
      name: 'glpi_list_ip_networks',
      description: 'List declared IPv4 and IPv6 LANs (GLPI IPNetwork objects).',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_ip_network',
      description: 'Get one declared LAN by its GLPI IPNetwork id.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'GLPI IPNetwork id' } },
        required: ['id'],
      },
    },
    {
      name: 'glpi_create_ip_network',
      description: 'Declare an IPv4 or IPv6 LAN. GLPI computes its hierarchy automatically from the CIDR and entity.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable LAN name' },
          cidr: { type: 'string', description: 'Network in CIDR notation, for example 192.0.2.0/24 or 2001:db8::/64' },
          gateway: { type: 'string', description: 'Optional gateway address inside the network' },
          entity_id: { type: 'number', description: 'Owning GLPI entity id' },
          is_recursive: { type: 'boolean', description: 'Make the LAN visible in child entities' },
          addressable: { type: 'boolean', description: 'Whether GLPI may associate addresses with this network' },
          comment: { type: 'string' },
        },
        required: ['name', 'cidr'],
      },
    },
    {
      name: 'glpi_update_ip_network',
      description: 'Update a declared LAN. Changing cidr lets GLPI recompute the implicit network hierarchy.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'GLPI IPNetwork id' },
          name: { type: 'string' },
          cidr: { type: 'string', description: 'Network in CIDR notation' },
          gateway: { type: 'string', description: 'Gateway address; use an empty string to clear it' },
          entity_id: { type: 'number' },
          is_recursive: { type: 'boolean' },
          addressable: { type: 'boolean' },
          comment: { type: 'string' },
        },
        required: ['id'],
      },
    },

    // ============== GLPI INVENTORY PLUGIN ==============
    ...INVENTORY_PLUGIN_READ_TOOLS.flatMap(({ plural, singular, description }) => [
      {
        name: `glpi_inventory_list_${plural}`,
        description: `List GLPI Inventory ${description}.`,
        inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
      },
      {
        name: `glpi_inventory_get_${singular}`,
        description: `Get one GLPI Inventory ${description.replace(/s$/, '')} by id.`,
        inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      },
    ]),
    {
      name: 'glpi_inventory_list_ip_ranges',
      description: 'List GLPI Inventory IPv4 discovery/inventory ranges.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_inventory_get_ip_range',
      description: 'Get one GLPI Inventory IP range.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_inventory_create_ip_range',
      description: 'Create an explicit GLPI Inventory IPv4 range.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, entity_id: { type: 'number' },
          ip_start: { type: 'string' }, ip_end: { type: 'string' },
        },
        required: ['name', 'ip_start', 'ip_end'],
      },
    },
    {
      name: 'glpi_inventory_create_ip_range_from_cidr',
      description: 'Create a GLPI Inventory IPv4 range from CIDR; network/broadcast addresses are excluded by default.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, cidr: { type: 'string', description: 'IPv4 CIDR, for example 192.0.2.0/24' },
          entity_id: { type: 'number' },
          usable_hosts_only: { type: 'boolean', description: 'Default true; exclude network and broadcast for /0../30' },
        },
        required: ['name', 'cidr'],
      },
    },
    {
      name: 'glpi_inventory_update_ip_range',
      description: 'Update an existing GLPI Inventory IP range.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' }, name: { type: 'string' }, entity_id: { type: 'number' }, ip_start: { type: 'string' }, ip_end: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'glpi_inventory_create_task',
      description: 'Create a GLPI Inventory task definition without running it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, entity_id: { type: 'number' }, comment: { type: 'string' }, is_active: { type: 'boolean' },
          datetime_start: { type: 'string' }, datetime_end: { type: 'string' }, reprepare_if_successful: { type: 'boolean' }, is_deploy_on_demand: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_inventory_update_task',
      description: 'Update a GLPI Inventory task definition.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' }, name: { type: 'string' }, entity_id: { type: 'number' }, comment: { type: 'string' }, is_active: { type: 'boolean' },
          datetime_start: { type: 'string' }, datetime_end: { type: 'string' }, reprepare_if_successful: { type: 'boolean' }, is_deploy_on_demand: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'glpi_inventory_enable_task',
      description: 'Enable a GLPI Inventory task definition.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_inventory_disable_task',
      description: 'Disable a GLPI Inventory task definition.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_inventory_create_credential',
      description: 'Create a GLPI Inventory remote-device credential. Password is write-only and never returned.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, entity_id: { type: 'number' }, credential_type: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' } },
        required: ['name', 'credential_type'],
      },
    },
    {
      name: 'glpi_inventory_update_credential',
      description: 'Update or rotate a GLPI Inventory credential. Password is write-only.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' }, name: { type: 'string' }, entity_id: { type: 'number' }, credential_type: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' } },
        required: ['id'],
      },
    },

    // ============== KB / CONTRACTS / SUPPLIERS / LOCATIONS / PROJECTS ==============
    {
      name: 'glpi_list_knowbase',
      description: 'List KB articles.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_knowbase_item',
      description: 'Get a KB article.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_search_knowbase',
      description: 'Search KB articles by free text in title (field id resolved dynamically).',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query'],
      },
    },
    {
      name: 'glpi_create_knowbase_item',
      description: 'Create a KB article.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, answer: { type: 'string' },
          is_faq: { type: 'boolean' }, knowbaseitemcategories_id: { type: 'number' },
        },
        required: ['name', 'answer'],
      },
    },
    {
      name: 'glpi_list_contracts',
      description: 'List contracts.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_contract',
      description: 'Get a contract.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_contract',
      description: 'Create a contract.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, num: { type: 'string' },
          begin_date: { type: 'string' }, duration: { type: 'number' },
          notice: { type: 'number' }, comment: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_list_suppliers',
      description: 'List suppliers.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_supplier',
      description: 'Get a supplier.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_supplier',
      description: 'Create a supplier.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, address: { type: 'string' }, postcode: { type: 'string' },
          town: { type: 'string' }, country: { type: 'string' }, website: { type: 'string' },
          phonenumber: { type: 'string' }, email: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_list_locations',
      description: 'List locations.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_location',
      description: 'Get a location.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_location',
      description: 'Create a GLPI location with hierarchy, entity scope, code, alias, address and GPS coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, code: { type: 'string' }, alias: { type: 'string' },
          comment: { type: 'string' }, entity_id: { type: 'number' },
          is_recursive: { type: 'boolean' },
          parent_location_id: { type: 'number' },
          locations_id: { type: 'number', description: 'Deprecated alias for parent_location_id' },
          address: { type: 'string' }, postcode: { type: 'string' }, town: { type: 'string' },
          state: { type: 'string' }, country: { type: 'string' },
          building: { type: 'string' }, room: { type: 'string' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          altitude: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_list_projects',
      description: 'List projects.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_project',
      description: 'Get a project.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_project',
      description: 'Create a project.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, code: { type: 'string' }, content: { type: 'string' },
          priority: { type: 'number' }, plan_start_date: { type: 'string' },
          plan_end_date: { type: 'string' }, users_id: { type: 'number' }, groups_id: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_update_project',
      description: 'Update a project (progress, dates, content).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' }, name: { type: 'string' }, content: { type: 'string' },
          percent_done: { type: 'number' },
          real_start_date: { type: 'string' }, real_end_date: { type: 'string' },
        },
        required: ['id'],
      },
    },

    // ============== USERS / GROUPS / CATEGORIES / ENTITIES / DOCUMENTS ==============
    {
      name: 'glpi_list_users',
      description: 'List users. active_only defaults to true (uses search criteria, not searchText).',
      inputSchema: {
        type: 'object',
        properties: { ...LIST_TOOL_COMMON_PROPS, active_only: { type: 'boolean' } },
      },
    },
    {
      name: 'glpi_get_user',
      description: 'Get a user.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_search_user',
      description: 'Search a user by login name (exact "contains" on name field).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    {
      name: 'glpi_create_user',
      description: 'Create a user.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, password: { type: 'string' },
          realname: { type: 'string' }, firstname: { type: 'string' },
          email: { type: 'string' }, phone: { type: 'string' }, profiles_id: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_list_groups',
      description: 'List groups.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_group',
      description: 'Get a group.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_group',
      description: 'Create a group.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, comment: { type: 'string' },
          is_requester: { type: 'boolean' }, is_assign: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_add_user_to_group',
      description: 'Add a user to a group.',
      inputSchema: {
        type: 'object',
        properties: { user_id: { type: 'number' }, group_id: { type: 'number' }, is_manager: { type: 'boolean' } },
        required: ['user_id', 'group_id'],
      },
    },
    {
      name: 'glpi_list_categories',
      description: 'List ticket categories.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_list_entities',
      description: 'List entities.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_entity',
      description: 'Get an entity.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },
    {
      name: 'glpi_create_entity',
      description: 'Create a GLPI entity with parent hierarchy, address, GPS coordinates and contact information.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, parent_entity_id: { type: 'number' },
          comment: { type: 'string' }, registration_number: { type: 'string' },
          address: { type: 'string' }, postcode: { type: 'string' }, town: { type: 'string' },
          state: { type: 'string' }, country: { type: 'string' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          altitude: { type: 'number' }, website: { type: 'string' },
          phone: { type: 'string' }, fax: { type: 'string' }, email: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'glpi_list_documents',
      description: 'List documents.',
      inputSchema: { type: 'object', properties: LIST_TOOL_COMMON_PROPS },
    },
    {
      name: 'glpi_get_document',
      description: 'Get a document.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    },

    // ============== STATS ==============
    {
      name: 'glpi_get_ticket_stats',
      description: 'Ticket counts by status. Optional filters: entity, date_from, date_to.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_id: { type: 'number' },
          date_from: { type: 'string', description: 'YYYY-MM-DD' },
          date_to: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
    },
    {
      name: 'glpi_get_asset_stats',
      description: 'Total counts per asset type (Computer/Monitor/Printer/NetworkEquipment/Phone/Software).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'glpi_tickets_stats_by',
      description: 'Ticket count broken down by a dimension (status / category / technician / entity / month). Optional period filter.',
      inputSchema: {
        type: 'object',
        properties: {
          dimension: {
            type: 'string',
            enum: ['status', 'category', 'technician', 'entity', 'month'],
          },
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          entity_id: { type: 'number' },
        },
        required: ['dimension'],
      },
    },

    // ============== SESSION ==============
    {
      name: 'glpi_get_session_info',
      description: 'Active profile + available profiles + entities.',
      inputSchema: { type: 'object', properties: {} },
    },

    // ============== GENERIC SEARCH / COUNT ==============
    {
      name: 'glpi_search_v2',
      description: 'Multi-criteria search. Use criteria[]: {field, searchtype, value, link}. Supports forcedisplay, sort, order, start/limit, fetch_all.',
      inputSchema: {
        type: 'object',
        properties: {
          itemtype: { type: 'string' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { description: 'field_id (number) OR friendly name resolved via listSearchOptions' },
                searchtype: {
                  type: 'string',
                  enum: ['contains', 'notcontains', 'equals', 'notequals', 'lessthan', 'morethan', 'under', 'notunder', 'empty', 'notempty'],
                },
                value: {},
                link: { type: 'string', enum: ['AND', 'OR', 'AND NOT', 'OR NOT'] },
              },
              required: ['field', 'searchtype', 'value'],
            },
          },
          forcedisplay: { type: 'array', items: { type: 'number' } },
          start: { type: 'number' },
          limit: { type: 'number' },
          sort: { type: 'number' },
          order: { type: 'string', enum: ['ASC', 'DESC'] },
          fetch_all: { type: 'boolean' },
          max_rows: { type: 'number' },
          expand_dropdowns: { type: 'boolean' },
        },
        required: ['itemtype'],
      },
    },
    {
      name: 'glpi_count',
      description: 'Return totalcount for an itemtype + criteria (cheap range=0-0 probe).',
      inputSchema: {
        type: 'object',
        properties: {
          itemtype: { type: 'string' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {},
                searchtype: { type: 'string' },
                value: {},
                link: { type: 'string' },
              },
              required: ['field', 'searchtype', 'value'],
            },
          },
        },
        required: ['itemtype'],
      },
    },
    {
      name: 'glpi_list_search_options',
      description: 'Discover the searchable fields of an itemtype (returns field_id → name/uid/datatype). Useful to build criteria for glpi_search_v2.',
      inputSchema: {
        type: 'object',
        properties: { itemtype: { type: 'string' } },
        required: ['itemtype'],
      },
    },

    // ============== legacy compat: keep glpi_search (mono-criterion) as deprecated alias ==============
    {
      name: 'glpi_search',
      description: '[DEPRECATED — prefer glpi_search_v2] Single-criterion search (kept for backward compat).',
      inputSchema: {
        type: 'object',
        properties: {
          itemtype: { type: 'string' },
          field: { type: 'number' },
          searchtype: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['itemtype', 'field', 'searchtype', 'value'],
      },
    },
  ].map(annotate),
}));

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: argsRaw } = request.params;
  const args = (argsRaw ?? {}) as Record<string, unknown>;

  try {
    const backend = apiRouter.backendForTool(name);
    console.error(`[MCP] ${name} -> ${backend}`);
    if (backend === 'highlevel' && !isBackendServiceTool(name)) {
      throw new McpError(ErrorCode.InvalidRequest, `Not supported in GLPI_API_MODE=highlevel: ${name}`);
    }

    const inventoryReadTool = INVENTORY_PLUGIN_READ_TOOLS.find(
      ({ plural, singular }) => name === `glpi_inventory_list_${plural}` || name === `glpi_inventory_get_${singular}`
    );
    if (inventoryReadTool) {
      if (name === `glpi_inventory_list_${inventoryReadTool.plural}`) {
        return text(await inventoryPluginService.list(inventoryReadTool.resource, listArgsSchema.parse(args)));
      }
      const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
      return text(await inventoryPluginService.get(inventoryReadTool.resource, id));
    }

    switch (name) {
      // ==== IMPORT ENTITY RULES — read ====
      case 'glpi_list_import_entity_rules': {
        const validated = listArgsSchema.parse(args);
        return text(await importEntityRuleService.list({
          start: validated.start,
          limit: validated.limit,
          sort: validated.sort,
          order: validated.order,
        }));
      }

      case 'glpi_get_import_entity_rule': {
        const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
        return text(await importEntityRuleService.get(id));
      }

      case 'glpi_list_import_entity_rule_criteria': {
        const validated = listArgsSchema.extend({
          rule_id: z.number().int().min(1),
        }).parse(args);
        return text(await importEntityRuleService.listCriteria(validated.rule_id, {
          start: validated.start,
          limit: validated.limit,
          sort: validated.sort,
          order: validated.order,
        }));
      }

      case 'glpi_get_import_entity_rule_criterion': {
        const validated = z.object({
          rule_id: z.number().int().min(1),
          criterion_id: z.number().int().min(1),
        }).parse(args);
        return text(await importEntityRuleService.getCriterion(
          validated.rule_id,
          validated.criterion_id
        ));
      }

      case 'glpi_list_import_entity_rule_actions': {
        const validated = listArgsSchema.extend({
          rule_id: z.number().int().min(1),
        }).parse(args);
        return text(await importEntityRuleService.listActions(validated.rule_id, {
          start: validated.start,
          limit: validated.limit,
          sort: validated.sort,
          order: validated.order,
        }));
      }

      case 'glpi_get_import_entity_rule_action': {
        const validated = z.object({
          rule_id: z.number().int().min(1),
          action_id: z.number().int().min(1),
        }).parse(args);
        return text(await importEntityRuleService.getAction(
          validated.rule_id,
          validated.action_id
        ));
      }

      case 'glpi_create_import_entity_subnet_rule': {
        const validated = importEntitySubnetRuleCreateSchema.parse(args);
        return text(await importEntityRuleService.createSubnetRule({
          name: validated.name,
          cidr: validated.cidr,
          targetEntityId: validated.target_entity_id,
          targetLocationId: validated.target_location_id,
          scopeEntityId: validated.scope_entity_id,
          ranking: validated.ranking,
          description: validated.description,
          comment: validated.comment,
          recursive: validated.recursive,
        }));
      }

      case 'glpi_set_import_entity_rule_enabled': {
        const validated = importEntityRuleEnabledSchema.parse(args);
        return text(await importEntityRuleService.setEnabled(validated.rule_id, validated.enabled));
      }

      // ==== TICKETS — read ====
      case 'glpi_list_tickets': {
        const validated = listArgsSchema.parse(args);
        const opts = parseListArgs(validated);
        const tickets = await ticketService.list({
          ...opts,
          order: opts.order ?? 'DESC',
          status: validated.status as number,
        });
        return text(tickets.map(formatTicketSummary));
      }

      case 'glpi_get_ticket': {
        const validated = ticketReadSchema.parse(args);
        const { id, with_logs } = validated;
        return text(await ticketService.get(id, { with_logs }));
      }

      case 'glpi_get_ticket_timeline': {
        const id = args.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'id required');
        const [followups, tasks, solutions, validations] = await Promise.all([
          client.getTicketFollowups(id),
          client.getTicketTasks(id),
          client.getTicketSolutions(id),
          client.getTicketValidations(id),
        ]);
        const timeline = [
          ...followups.map((f: any) => ({ kind: 'followup', date: f.date_creation ?? f.date, ...f })),
          ...tasks.map((t: any) => ({ kind: 'task', date: t.date_creation ?? t.date, ...t })),
          ...solutions.map((s: any) => ({ kind: 'solution', date: s.date_creation ?? s.date, ...s })),
          ...validations.map((v: any) => ({
            kind: 'validation',
            date: v.submission_date ?? v.date_creation ?? v.date,
            status_label: VALIDATION_STATUS[v.status] ?? v.status,
            ...v,
          })),
        ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
        return text({ ticket_id: id, count: timeline.length, timeline });
      }

      case 'glpi_search_tickets': {
        const validated = ticketSearchSchema.parse(args);
        return text(await ticketService.search(validated));
      }

      case 'glpi_get_ticket_followups': {
        const id = args.ticket_id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketFollowups(id));
      }
      case 'glpi_get_ticket_tasks': {
        const id = args.ticket_id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketTasks(id));
      }
      case 'glpi_get_ticket_solutions': {
        const id = args.ticket_id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketSolutions(id));
      }
      case 'glpi_get_ticket_validations': {
        const id = args.ticket_id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketValidations(id));
      }
      case 'glpi_get_ticket_documents': {
        const id = args.ticket_id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketDocuments(id));
      }

      // ==== TICKETS — write ====
      case 'glpi_create_ticket': {
        const name = args.name as string;
        const content = args.content as string;
        if (!name || !content) throw new McpError(ErrorCode.InvalidParams, 'name and content required');
        const result = await ticketService.create({
          name,
          content,
          status: args.status as number,
          urgency: (args.urgency as number) ?? 3,
          impact: args.impact as number,
          priority: args.priority as number,
          type: (args.type as number) ?? 1,
          category_id: args.category_id as number,
          entity_id: args.entity_id as number,
          location_id: args.location_id as number,
          assigned_user_id: (args.assigned_user_id ?? args.user_id_assign) as number,
          assigned_group_id: (args.assigned_group_id ?? args.group_id_assign) as number,
          requester_user_id: args.requester_user_id as number,
          requester_group_id: args.requester_group_id as number,
          time_to_resolve: args.time_to_resolve as string,
        });
        return text({ success: true, ...(result as Record<string, unknown>) });
      }

      case 'glpi_update_ticket': {
        const id = args.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'id required');
        const updates: Record<string, unknown> = {};
        [
          'name',
          'content',
          'status',
          'urgency',
          'priority',
          'impact',
          'type',
          'category_id',
          'entity_id',
          'location_id',
          'requester_user_id',
          'requester_group_id',
          'assigned_user_id',
          'assigned_group_id',
          'user_id_assign',
          'group_id_assign',
          'time_to_resolve',
          'itilcategories_id',
          'entities_id',
          'locations_id',
        ].forEach((k) => {
          if (args[k] !== undefined) updates[k] = args[k];
        });
        return text(await ticketService.update(id, updates));
      }

      case 'glpi_delete_ticket': {
        const id = args.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'id required');
        await client.deleteTicket(id, args.force as boolean);
        return text({ success: true, id, purged: !!args.force });
      }

      case 'glpi_add_followup': {
        const ticket_id = args.ticket_id as number;
        const content = args.content as string;
        if (!ticket_id || !content) throw new McpError(ErrorCode.InvalidParams, 'ticket_id and content required');
        const result = await client.addTicketFollowup(ticket_id, content, args.is_private as boolean);
        return text({ success: true, followup_id: result.id });
      }

      case 'glpi_add_task': {
        const ticket_id = args.ticket_id as number;
        const content = args.content as string;
        if (!ticket_id || !content) throw new McpError(ErrorCode.InvalidParams, 'ticket_id and content required');
        const result = await client.addTicketTask(ticket_id, content, {
          is_private: args.is_private as boolean,
          actiontime: args.actiontime as number,
          state: args.state as number,
          users_id_tech: args.users_id_tech as number,
          groups_id_tech: args.groups_id_tech as number,
        });
        return text({ success: true, task_id: result.id });
      }

      case 'glpi_add_solution': {
        const ticket_id = args.ticket_id as number;
        const content = args.content as string;
        if (!ticket_id || !content) throw new McpError(ErrorCode.InvalidParams, 'ticket_id and content required');
        const result = await client.addTicketSolution(ticket_id, content, args.solutiontypes_id as number);
        return text({ success: true, solution_id: result.id });
      }

      case 'glpi_assign_ticket': {
        const ticket_id = args.ticket_id as number;
        if (!ticket_id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        const user_id = args.user_id as number;
        const group_id = args.group_id as number;
        if (!user_id && !group_id) {
          throw new McpError(ErrorCode.InvalidParams, 'user_id or group_id required');
        }
        const result = await client.assignTicket(ticket_id, {
          users_id: user_id,
          groups_id: group_id,
          type: args.type as number,
        });
        return text({ success: true, assignment_id: result.id });
      }

      case 'glpi_link_tickets': {
        const parent_id = args.parent_id as number;
        const child_id = args.child_id as number;
        if (!parent_id || !child_id) throw new McpError(ErrorCode.InvalidParams, 'parent_id and child_id required');
        const result = await client.linkTickets(parent_id, child_id, (args.link_type as number) ?? 1);
        return text({ success: true, link_id: result.id });
      }

      case 'glpi_add_ticket_validation': {
        const ticket_id = args.ticket_id as number;
        const users_id_validate = args.users_id_validate as number;
        if (!ticket_id || !users_id_validate) {
          throw new McpError(ErrorCode.InvalidParams, 'ticket_id and users_id_validate required');
        }
        const result = await client.addTicketValidation(ticket_id, {
          users_id_validate,
          comment_submission: args.comment_submission as string,
        });
        return text({ success: true, validation_id: result.id });
      }

      case 'glpi_set_validation_status': {
        const validation_id = args.validation_id as number;
        const status = args.status as 2 | 3;
        if (!validation_id || (status !== 2 && status !== 3)) {
          throw new McpError(ErrorCode.InvalidParams, 'validation_id and status (2 or 3) required');
        }
        await client.setTicketValidationStatus(
          validation_id,
          status,
          args.comment_validation as string
        );
        return text({ success: true, validation_id, status_label: VALIDATION_STATUS[status] });
      }

      case 'glpi_upload_document': {
        const filePath = args.file_path as string;
        if (!filePath) throw new McpError(ErrorCode.InvalidParams, 'file_path required');
        let upload: Awaited<ReturnType<typeof readSafeUpload>>;
        try {
          upload = await readSafeUpload(filePath);
        } catch (err) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `cannot read file "${filePath}": ${err instanceof Error ? err.message : err}`
          );
        }
        const filename = basename(upload.path);
        const ticket_id = args.ticket_id as number | undefined;
        // Linking via the manifest (itemtype/items_id) lets GLPI create the
        // Document_Item itself, which also works for restricted profiles that
        // cannot POST Document_Item directly.
        const document = await client.uploadDocument({
          filename,
          data: upload.data,
          name: args.name as string | undefined,
          mimeType: UPLOAD_MIME_TYPES[extname(filename).toLowerCase()],
          ...(ticket_id ? { itemtype: 'Ticket', items_id: ticket_id } : {}),
        });
        return text({ success: true, document_id: document.id, ...(ticket_id ? { ticket_id } : {}) });
      }

      case 'glpi_attach_document_to_ticket': {
        const ticket_id = args.ticket_id as number;
        const document_id = args.document_id as number;
        if (!ticket_id || !document_id) {
          throw new McpError(ErrorCode.InvalidParams, 'ticket_id and document_id required');
        }
        const result = await client.attachDocumentToTicket(ticket_id, document_id);
        return text({ success: true, link_id: result.id });
      }

      case 'glpi_get_ticket_satisfaction': {
        const ticket_id = args.ticket_id as number;
        if (!ticket_id) throw new McpError(ErrorCode.InvalidParams, 'ticket_id required');
        return text(await client.getTicketSatisfaction(ticket_id));
      }

      case 'glpi_list_overdue_tickets': {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const criteria: SearchCriterion[] = [
          { field: TICKET_FIELDS.status, searchtype: 'lessthan', value: 5 },
          // time_to_resolve search-option id is typically 18; fall back to 18.
          { field: 18, searchtype: 'lessthan', value: now, link: 'AND' },
          { field: 18, searchtype: 'notempty', value: '', link: 'AND' },
        ];
        if (args.entity_id !== undefined) {
          criteria.push({ field: TICKET_FIELDS.entity, searchtype: 'equals', value: args.entity_id as number, link: 'AND' });
        }
        const result = await client.search.search('Ticket', {
          criteria,
          limit: (args.limit as number) ?? 50,
          expandDropdowns: true,
          order: 'ASC',
          sort: 18,
        });
        return text({
          totalcount: result.totalcount,
          count: result.count,
          data: result.data,
        });
      }

      // ==== PROBLEMS / CHANGES ====
      case 'glpi_list_problems': {
        const list = await client.getProblems({ ...parseListArgs(args), order: 'DESC' });
        return text(list.map((p: any) => ({
          id: p.id, name: p.name,
          status: PROBLEM_STATUS[p.status] ?? p.status,
          urgency: TICKET_URGENCY[p.urgency] ?? p.urgency,
          date: p.date,
        })));
      }
      case 'glpi_get_problem': {
        const id = args.id as number;
        const p = await client.getProblem(id);
        return text({
          ...p,
          status_label: PROBLEM_STATUS[(p as any).status],
          urgency_label: TICKET_URGENCY[(p as any).urgency],
        });
      }
      case 'glpi_create_problem': {
        const result = await client.createProblem({
          name: args.name as string,
          content: args.content as string,
          urgency: args.urgency as number,
          impact: args.impact as number,
          priority: args.priority as number,
          itilcategories_id: args.category_id as number,
        });
        return text({ success: true, ...result });
      }
      case 'glpi_update_problem': {
        const id = args.id as number;
        const updates: Record<string, unknown> = {};
        ['name', 'content', 'status', 'urgency'].forEach((k) => {
          if (args[k] !== undefined) updates[k] = args[k];
        });
        await client.updateProblem(id, updates as any);
        return text({ success: true, id });
      }

      case 'glpi_list_changes': {
        const list = await client.getChanges({ ...parseListArgs(args), order: 'DESC' });
        return text(list.map((c: any) => ({
          id: c.id, name: c.name,
          status: CHANGE_STATUS[c.status] ?? c.status,
          urgency: TICKET_URGENCY[c.urgency] ?? c.urgency,
          date: c.date,
        })));
      }
      case 'glpi_get_change': {
        const id = args.id as number;
        const c = await client.getChange(id);
        return text({
          ...c,
          status_label: CHANGE_STATUS[(c as any).status],
          urgency_label: TICKET_URGENCY[(c as any).urgency],
        });
      }
      case 'glpi_create_change': {
        const result = await client.createChange({
          name: args.name as string,
          content: args.content as string,
          urgency: args.urgency as number,
          impact: args.impact as number,
          priority: args.priority as number,
          itilcategories_id: args.category_id as number,
        });
        return text({ success: true, ...result });
      }
      case 'glpi_update_change': {
        const id = args.id as number;
        const updates: Record<string, unknown> = {};
        ['name', 'content', 'status'].forEach((k) => {
          if (args[k] !== undefined) updates[k] = args[k];
        });
        await client.updateChange(id, updates as any);
        return text({ success: true, id });
      }

      // ==== ASSETS ====
      case 'glpi_list_computers':
        return text(await client.getComputers(parseListArgs(args)));
      case 'glpi_get_computer':
        return text(await client.getComputer(args.id as number, {
          with_softwares: args.with_softwares as boolean,
          with_connections: args.with_connections as boolean,
          with_networkports: args.with_networkports as boolean,
          with_documents: args.with_documents as boolean,
        }));
      case 'glpi_create_computer':
        return text({ success: true, ...(await client.createComputer(args)) });
      case 'glpi_update_computer': {
        const id = args.id as number;
        const updates = { ...args }; delete (updates as any).id;
        await client.updateComputer(id, updates as any);
        return text({ success: true, id });
      }
      case 'glpi_delete_computer':
        await client.deleteComputer(args.id as number, args.force as boolean);
        return text({ success: true, id: args.id, purged: !!args.force });

      case 'glpi_list_softwares':
        return text(await client.getSoftwares(parseListArgs(args)));
      case 'glpi_get_software':
        return text(await client.getSoftware(args.id as number));
      case 'glpi_create_software':
        return text({ success: true, ...(await client.createSoftware(args)) });

      case 'glpi_list_network_equipments':
        return text(await client.getNetworkEquipments(parseListArgs(args)));
      case 'glpi_get_network_equipment':
        return text(await client.getNetworkEquipment(args.id as number, {
          with_networkports: args.with_networkports as boolean,
        }));

      case 'glpi_list_printers':
        return text(await client.getPrinters(parseListArgs(args)));
      case 'glpi_get_printer':
        return text(await client.getPrinter(args.id as number));

      case 'glpi_list_monitors':
        return text(await client.getMonitors(parseListArgs(args)));
      case 'glpi_get_monitor':
        return text(await client.getMonitor(args.id as number));

      case 'glpi_list_phones':
        return text(await client.getPhones(parseListArgs(args)));
      case 'glpi_get_phone':
        return text(await client.getPhone(args.id as number));

      // ==== IP NETWORKS ====
      case 'glpi_list_ip_networks': {
        const validated = listArgsSchema.parse(args);
        return text(await ipNetworkService.list(validated));
      }
      case 'glpi_get_ip_network': {
        const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
        return text(await ipNetworkService.get(id));
      }
      case 'glpi_create_ip_network': {
        const validated = ipNetworkCreateSchema.parse(args);
        return text(await ipNetworkService.create(validated));
      }
      case 'glpi_update_ip_network': {
        const validated = ipNetworkUpdateSchema.parse(args);
        const { id, ...updates } = validated;
        return text(await ipNetworkService.update(id, updates));
      }

      // ==== GLPI INVENTORY PLUGIN ====
      case 'glpi_inventory_list_ip_ranges':
        return text(await inventoryPluginService.listIPRanges(listArgsSchema.parse(args)));
      case 'glpi_inventory_get_ip_range': {
        const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
        return text(await inventoryPluginService.getIPRange(id));
      }
      case 'glpi_inventory_create_ip_range': {
        const validated = z.object({
          name: z.string().trim().min(1), entity_id: z.number().int().min(0).optional(),
          ip_start: z.string().refine((value) => isIP(value) === 4, 'Expected IPv4 address'),
          ip_end: z.string().refine((value) => isIP(value) === 4, 'Expected IPv4 address'),
        }).parse(args);
        return text(await inventoryPluginService.createIPRange(validated));
      }
      case 'glpi_inventory_create_ip_range_from_cidr': {
        const validated = z.object({
          name: z.string().trim().min(1), cidr: z.string().trim().min(1),
          entity_id: z.number().int().min(0).optional(), usable_hosts_only: z.boolean().optional(),
        }).parse(args);
        return text(await inventoryPluginService.createIPRangeFromCIDR(validated));
      }
      case 'glpi_inventory_update_ip_range': {
        const validated = z.object({
          id: z.number().int().min(1), name: z.string().trim().min(1).optional(), entity_id: z.number().int().min(0).optional(),
          ip_start: z.string().refine((value) => isIP(value) === 4, 'Expected IPv4 address').optional(),
          ip_end: z.string().refine((value) => isIP(value) === 4, 'Expected IPv4 address').optional(),
        }).parse(args);
        const { id, ...updates } = validated;
        return text(await inventoryPluginService.updateIPRange(id, updates));
      }
      case 'glpi_inventory_create_task': {
        const validated = z.object({
          name: z.string().trim().min(1), entity_id: z.number().int().min(0).optional(), comment: z.string().optional(), is_active: z.boolean().optional(),
          datetime_start: z.string().optional(), datetime_end: z.string().optional(), reprepare_if_successful: z.boolean().optional(), is_deploy_on_demand: z.boolean().optional(),
        }).parse(args);
        return text(await inventoryPluginService.createTask(validated));
      }
      case 'glpi_inventory_update_task': {
        const validated = z.object({
          id: z.number().int().min(1), name: z.string().trim().min(1).optional(), entity_id: z.number().int().min(0).optional(), comment: z.string().optional(), is_active: z.boolean().optional(),
          datetime_start: z.string().optional(), datetime_end: z.string().optional(), reprepare_if_successful: z.boolean().optional(), is_deploy_on_demand: z.boolean().optional(),
        }).parse(args);
        const { id, ...updates } = validated;
        return text(await inventoryPluginService.updateTask(id, updates));
      }
      case 'glpi_inventory_enable_task':
        return text(await inventoryPluginService.setTaskActive(z.number().int().min(1).parse(args.id), true));
      case 'glpi_inventory_disable_task':
        return text(await inventoryPluginService.setTaskActive(z.number().int().min(1).parse(args.id), false));
      case 'glpi_inventory_create_credential': {
        const validated = z.object({
          name: z.string().trim().min(1), entity_id: z.number().int().min(0).optional(), credential_type: z.string().trim().min(1), username: z.string().optional(), password: z.string().optional(),
        }).parse(args);
        return text(await inventoryPluginService.createCredential(validated));
      }
      case 'glpi_inventory_update_credential': {
        const validated = z.object({
          id: z.number().int().min(1), name: z.string().trim().min(1).optional(), entity_id: z.number().int().min(0).optional(), credential_type: z.string().trim().min(1).optional(), username: z.string().optional(), password: z.string().optional(),
        }).parse(args);
        const { id, ...updates } = validated;
        return text(await inventoryPluginService.updateCredential(id, updates));
      }

      // ==== KB / CONTRACTS / SUPPLIERS / LOCATIONS / PROJECTS ====
      case 'glpi_list_knowbase':
        return text(await client.getKnowbaseItems(parseListArgs(args)));
      case 'glpi_get_knowbase_item':
        return text(await client.getKnowbaseItem(args.id as number));
      case 'glpi_search_knowbase':
        return text(await client.searchKnowbase(args.query as string, (args.limit as number) ?? 50));
      case 'glpi_create_knowbase_item': {
        const result = await client.createKnowbaseItem({
          name: args.name as string,
          answer: args.answer as string,
          is_faq: args.is_faq ? 1 : 0,
          knowbaseitemcategories_id: args.knowbaseitemcategories_id as number,
        });
        return text({ success: true, ...result });
      }

      case 'glpi_list_contracts':
        return text(await client.getContracts(parseListArgs(args)));
      case 'glpi_get_contract':
        return text(await client.getContract(args.id as number));
      case 'glpi_create_contract':
        return text({ success: true, ...(await client.createContract(args)) });

      case 'glpi_list_suppliers':
        return text(await client.getSuppliers(parseListArgs(args)));
      case 'glpi_get_supplier':
        return text(await client.getSupplier(args.id as number));
      case 'glpi_create_supplier':
        return text({ success: true, ...(await client.createSupplier(args)) });

      case 'glpi_list_locations':
        return text(await organizationService.listLocations(listArgsSchema.parse(args)));
      case 'glpi_get_location': {
        const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
        return text(await organizationService.getLocation(id));
      }
      case 'glpi_create_location': {
        const input = locationCreateSchema.parse(args);
        return text(await organizationService.createLocation({
          name: input.name,
          code: input.code,
          alias: input.alias,
          comment: input.comment,
          entityId: input.entity_id,
          recursive: input.is_recursive,
          parentLocationId: input.parent_location_id ?? input.locations_id,
          room: input.room,
          building: input.building,
          address: input.address,
          town: input.town,
          postcode: input.postcode,
          state: input.state,
          country: input.country,
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
        }));
      }

      case 'glpi_list_projects':
        return text(await client.getProjects(parseListArgs(args)));
      case 'glpi_get_project':
        return text(await client.getProject(args.id as number));
      case 'glpi_create_project':
        return text({ success: true, ...(await client.createProject(args)) });
      case 'glpi_update_project': {
        const id = args.id as number;
        const updates: Record<string, unknown> = {};
        ['name', 'content', 'percent_done', 'real_start_date', 'real_end_date'].forEach((k) => {
          if (args[k] !== undefined) updates[k] = args[k];
        });
        await client.updateProject(id, updates as any);
        return text({ success: true, id });
      }

      // ==== USERS / GROUPS ====
      case 'glpi_list_users':
        return text(await client.getUsers({
          ...parseListArgs(args),
          is_active: args.active_only === false ? false : true,
        }));
      case 'glpi_get_user':
        return text(await client.getUser(args.id as number));
      case 'glpi_search_user':
        return text(await client.getUserByName(args.name as string));
      case 'glpi_create_user':
        return text({ success: true, ...(await client.createUser({
          name: args.name as string,
          password: args.password as string,
          realname: args.realname as string,
          firstname: args.firstname as string,
          email: args.email as string,
          phone: args.phone as string,
          profiles_id: args.profiles_id as number,
        })) });

      case 'glpi_list_groups':
        return text(await client.getGroups(parseListArgs(args)));
      case 'glpi_get_group':
        return text(await client.getGroup(args.id as number));
      case 'glpi_create_group':
        return text({ success: true, ...(await client.createGroup({
          name: args.name as string,
          comment: args.comment as string,
          is_requester: args.is_requester ? 1 : 0,
          is_assign: args.is_assign ? 1 : 0,
        })) });
      case 'glpi_add_user_to_group':
        return text({ success: true, ...(await client.addUserToGroup(
          args.user_id as number,
          args.group_id as number,
          args.is_manager as boolean
        )) });

      case 'glpi_list_categories':
        return text(await client.getCategories(parseListArgs(args)));
      case 'glpi_list_entities':
        return text(await organizationService.listEntities(listArgsSchema.parse(args)));
      case 'glpi_get_entity': {
        const { id } = z.object({ id: z.number().int().min(1) }).parse(args);
        return text(await organizationService.getEntity(id));
      }
      case 'glpi_create_entity': {
        const input = entityCreateSchema.parse(args);
        return text(await organizationService.createEntity({
          name: input.name,
          parentEntityId: input.parent_entity_id,
          comment: input.comment,
          registrationNumber: input.registration_number,
          address: input.address,
          postcode: input.postcode,
          town: input.town,
          state: input.state,
          country: input.country,
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          website: input.website,
          phone: input.phone,
          fax: input.fax,
          email: input.email,
        }));
      }
      case 'glpi_list_documents':
        return text(await client.getDocuments(parseListArgs(args)));
      case 'glpi_get_document':
        return text(await client.getDocument(args.id as number));

      // ==== STATS ====
      case 'glpi_get_ticket_stats': {
        const stats = await client.getTicketStats({
          entity_id: args.entity_id as number,
          date_from: args.date_from as string,
          date_to: args.date_to as string,
        });
        return text({
          ...stats,
          summary: `${stats.total} tickets — new:${stats.new} processing:${stats.processing} pending:${stats.pending} solved:${stats.solved} closed:${stats.closed}`,
        });
      }

      case 'glpi_get_asset_stats': {
        const stats = await client.getAssetStats();
        return text({ ...stats, total: stats.computers + stats.monitors + stats.printers + stats.networkEquipments + stats.phones });
      }

      case 'glpi_tickets_stats_by': {
        const dimension = args.dimension as 'status' | 'category' | 'technician' | 'entity' | 'month';
        const base: SearchCriterion[] = [];
        if (args.entity_id !== undefined) base.push({ field: TICKET_FIELDS.entity, searchtype: 'equals', value: args.entity_id as number });
        if (args.date_from) base.push({ field: TICKET_FIELDS.date, searchtype: 'morethan', value: args.date_from as string, link: 'AND' });
        if (args.date_to) base.push({ field: TICKET_FIELDS.date, searchtype: 'lessthan', value: args.date_to as string, link: 'AND' });

        const counts: Record<string, number> = {};

        if (dimension === 'status') {
          for (const [statusId, label] of Object.entries(TICKET_STATUS)) {
            const c: SearchCriterion[] = [
              { field: TICKET_FIELDS.status, searchtype: 'equals', value: Number(statusId) },
              ...base.map((b, i) => ({ ...b, link: 'AND' as const })),
            ];
            counts[label] = await client.search.count('Ticket', c);
          }
        } else if (dimension === 'category') {
          const cats = await client.getCategories({ range: '0-199' });
          for (const cat of cats as any[]) {
            const c: SearchCriterion[] = [
              { field: TICKET_FIELDS.category, searchtype: 'equals', value: cat.id },
              ...base.map((b) => ({ ...b, link: 'AND' as const })),
            ];
            const n = await client.search.count('Ticket', c);
            if (n > 0) counts[cat.completename ?? cat.name] = n;
          }
        } else if (dimension === 'technician') {
          const users = await client.getUsers({ range: '0-199', is_active: true });
          for (const u of users) {
            const c: SearchCriterion[] = [
              { field: TICKET_FIELDS.technician_user, searchtype: 'equals', value: u.id },
              ...base.map((b) => ({ ...b, link: 'AND' as const })),
            ];
            const n = await client.search.count('Ticket', c);
            if (n > 0) counts[`${u.firstname ?? ''} ${u.realname ?? ''} (${u.name})`.trim()] = n;
          }
        } else if (dimension === 'entity') {
          const entities = await client.getEntities({ range: '0-99' });
          for (const e of entities as any[]) {
            const c: SearchCriterion[] = [
              { field: TICKET_FIELDS.entity, searchtype: 'equals', value: e.id },
              ...base.map((b) => ({ ...b, link: 'AND' as const })),
            ];
            const n = await client.search.count('Ticket', c);
            if (n > 0) counts[e.completename ?? e.name] = n;
          }
        } else if (dimension === 'month') {
          // Compute monthly buckets between date_from and date_to (or last 6 months).
          const to = args.date_to ? new Date(args.date_to as string) : new Date();
          const from = args.date_from ? new Date(args.date_from as string) : new Date(to.getFullYear(), to.getMonth() - 5, 1);
          const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
          while (cursor <= to) {
            const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
            const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const fmt = (d: Date) => d.toISOString().slice(0, 10) + ' 00:00:00';
            const monthCriteria: SearchCriterion[] = [
              { field: TICKET_FIELDS.date, searchtype: 'morethan', value: fmt(monthStart) },
              { field: TICKET_FIELDS.date, searchtype: 'lessthan', value: fmt(monthEnd), link: 'AND' },
            ];
            if (args.entity_id !== undefined) {
              monthCriteria.push({ field: TICKET_FIELDS.entity, searchtype: 'equals', value: args.entity_id as number, link: 'AND' });
            }
            const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
            counts[key] = await client.search.count('Ticket', monthCriteria);
            cursor.setMonth(cursor.getMonth() + 1);
          }
        } else {
          throw new McpError(ErrorCode.InvalidParams, `Unknown dimension: ${dimension}`);
        }

        return text({ dimension, counts, total: Object.values(counts).reduce((s, n) => s + n, 0) });
      }

      // ==== SESSION ====
      case 'glpi_get_session_info': {
        return text(await sessionService.getInfo());
      }

      // ==== SEARCH ====
      case 'glpi_search_v2': {
        const itemtype = args.itemtype as string;
        if (!itemtype) throw new McpError(ErrorCode.InvalidParams, 'itemtype required');
        const rawCriteria = (args.criteria as CriteriaArg[]) ?? [];
        const criteria = await resolveCriteria(client, itemtype, rawCriteria);
        const result = await client.search.search(itemtype, {
          criteria,
          forcedisplay: args.forcedisplay as number[],
          start: args.start as number,
          limit: args.limit as number,
          sort: args.sort as number,
          order: args.order as 'ASC' | 'DESC',
          fetchAll: args.fetch_all as boolean,
          maxRows: args.max_rows as number,
          expandDropdowns: args.expand_dropdowns !== false,
        });
        return text(result);
      }

      case 'glpi_count': {
        const itemtype = args.itemtype as string;
        if (!itemtype) throw new McpError(ErrorCode.InvalidParams, 'itemtype required');
        const rawCriteria = (args.criteria as CriteriaArg[]) ?? [];
        const criteria = await resolveCriteria(client, itemtype, rawCriteria);
        const totalcount = await client.search.count(itemtype, criteria);
        return text({ itemtype, totalcount });
      }

      case 'glpi_list_search_options': {
        const itemtype = args.itemtype as string;
        if (!itemtype) throw new McpError(ErrorCode.InvalidParams, 'itemtype required');
        const cat = await client.searchOptions.get(itemtype);
        const entries = Array.from(cat.byId.values()).map((o) => ({
          id: o.id, name: o.name, uid: o.uid, table: o.table,
          field: o.field, datatype: o.datatype,
          available_searchtypes: o.available_searchtypes,
        }));
        return text({ itemtype, count: entries.length, options: entries });
      }

      // legacy
      case 'glpi_search': {
        const itemtype = args.itemtype as string;
        const field = args.field as number;
        const searchtype = args.searchtype as SearchType;
        const value = args.value as string;
        if (!itemtype || field === undefined || !searchtype || value === undefined) {
          throw new McpError(ErrorCode.InvalidParams, 'itemtype, field, searchtype, value required');
        }
        const result = await client.search.search(itemtype, {
          criteria: [{ field, searchtype, value }],
          expandDropdowns: true,
        });
        return text(result);
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${name}: ${issues}`);
    }
    if (error instanceof GlpiError) {
      const detail = error.glpiCode
        ? `${error.glpiCode}${error.glpiMessage ? ' — ' + error.glpiMessage : ''}`
        : error.message;
      throw new McpError(
        ErrorCode.InternalError,
        `GLPI API error on ${name} (HTTP ${error.status}): ${detail}`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'glpi://server/info', name: 'Server Information', description: 'Product and embedded component versions', mimeType: 'application/json' },
    { uri: 'glpi://tickets/open', name: 'Open Tickets', description: 'Tickets with status < 5', mimeType: 'application/json' },
    { uri: 'glpi://tickets/recent', name: 'Recent Tickets', description: 'Most recent tickets', mimeType: 'application/json' },
    { uri: 'glpi://problems/open', name: 'Open Problems', description: 'Open problems', mimeType: 'application/json' },
    { uri: 'glpi://changes/pending', name: 'Pending Changes', description: 'Pending changes', mimeType: 'application/json' },
    { uri: 'glpi://computers', name: 'Computers', description: 'Computers', mimeType: 'application/json' },
    { uri: 'glpi://groups', name: 'Groups', description: 'Groups', mimeType: 'application/json' },
    { uri: 'glpi://categories', name: 'Categories', description: 'ITIL categories', mimeType: 'application/json' },
    { uri: 'glpi://stats/tickets', name: 'Ticket Statistics', description: 'Ticket counts', mimeType: 'application/json' },
    { uri: 'glpi://stats/assets', name: 'Asset Statistics', description: 'Asset counts', mimeType: 'application/json' },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  try {
    if (uri === 'glpi://server/info') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(getBuildInfo(), null, 2) }] };
    }
    requireLegacyClient(uri);
    switch (uri) {
      case 'glpi://tickets/open': {
        const result = await client.search.search('Ticket', {
          criteria: [{ field: TICKET_FIELDS.status, searchtype: 'lessthan', value: 5 }],
          limit: 100,
          order: 'DESC',
          sort: TICKET_FIELDS.date_mod,
          expandDropdowns: true,
        });
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(result.data, null, 2) }] };
      }
      case 'glpi://tickets/recent': {
        const tickets = await client.getTickets({ range: '0-19', order: 'DESC', expand_dropdowns: true });
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(tickets, null, 2) }] };
      }
      case 'glpi://problems/open': {
        const problems = await client.getProblems({ range: '0-99' });
        const open = (problems as any[]).filter((p) => p.status < 5);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(open, null, 2) }] };
      }
      case 'glpi://changes/pending': {
        const changes = await client.getChanges({ range: '0-99' });
        const pending = (changes as any[]).filter((c) => c.status < 8);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(pending, null, 2) }] };
      }
      case 'glpi://computers':
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await client.getComputers({ range: '0-99', is_deleted: false }), null, 2) }] };
      case 'glpi://groups':
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await client.getGroups({ range: '0-99' }), null, 2) }] };
      case 'glpi://categories':
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await client.getCategories({ range: '0-99' }), null, 2) }] };
      case 'glpi://stats/tickets':
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await client.getTicketStats(), null, 2) }] };
      case 'glpi://stats/assets':
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await client.getAssetStats(), null, 2) }] };
      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    const config = loadConfig();
    apiRouter = createApiRouter(config);
    client = apiRouter.legacyClient as GlpiClient;
    ticketService = apiRouter.services.tickets;
    ipNetworkService = apiRouter.services.ipNetworks as IPNetworkService;
    inventoryPluginService = apiRouter.services.inventoryPlugin as InventoryPluginService;
    sessionService = apiRouter.services.session;
    importEntityRuleService = apiRouter.services.importEntityRules;
    organizationService = apiRouter.services.organization;
    console.error(`[MCP] ${formatBuildInfo()}`);
    console.error(`[MCP] startup ${apiRouter.describeStartup()}`);

    // Try to open the session eagerly, but don't die if GLPI is momentarily
    // unreachable: the HTTP layer re-authenticates lazily on first request.
    if (apiRouter.legacyClient) {
      try {
        await client.initSession();
        console.error('GLPI session initialized');
      } catch (error) {
        console.error(
          `Warning: could not reach GLPI at startup (${error instanceof Error ? error.message : error}). ` +
          'The session will be established on the first request.'
        );
      }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MCP] ${PRODUCT_NAME} v${PRODUCT_VERSION} running on stdio`);

    const shutdown = async () => {
      if (apiRouter.legacyClient) {
        try {
          await client.killSession();
        } catch (error) {
          console.error('Warning: killSession failed during shutdown:', error instanceof Error ? error.message : error);
        }
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
