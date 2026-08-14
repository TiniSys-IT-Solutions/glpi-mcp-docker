import { AppConfig } from '../config/env.js';
import { GlpiClient } from '../api/legacy/glpi-client.js';
import { HighLevelClient, HighLevelNotSupportedError } from '../api/highlevel/client.js';

export type RoutedGlpiClient = GlpiClient;
export type BackendName = 'legacy' | 'highlevel';

export const HYBRID_TOOL_BACKENDS: Record<string, BackendName> = {
  glpi_list_tickets: 'legacy',
  glpi_get_ticket: 'legacy',
  glpi_get_ticket_timeline: 'legacy',
  glpi_search_tickets: 'legacy',
  glpi_get_ticket_followups: 'legacy',
  glpi_get_ticket_tasks: 'legacy',
  glpi_get_ticket_solutions: 'legacy',
  glpi_get_ticket_validations: 'legacy',
  glpi_get_ticket_documents: 'legacy',
  glpi_create_ticket: 'legacy',
  glpi_update_ticket: 'legacy',
  glpi_delete_ticket: 'legacy',
  glpi_add_followup: 'legacy',
  glpi_add_task: 'legacy',
  glpi_add_solution: 'legacy',
  glpi_assign_ticket: 'legacy',
  glpi_link_tickets: 'legacy',
  glpi_add_ticket_validation: 'legacy',
  glpi_set_validation_status: 'legacy',
  glpi_upload_document: 'legacy',
  glpi_attach_document_to_ticket: 'legacy',
  glpi_get_ticket_satisfaction: 'legacy',
  glpi_list_overdue_tickets: 'legacy',
  glpi_list_problems: 'legacy',
  glpi_get_problem: 'legacy',
  glpi_create_problem: 'legacy',
  glpi_update_problem: 'legacy',
  glpi_list_changes: 'legacy',
  glpi_get_change: 'legacy',
  glpi_create_change: 'legacy',
  glpi_update_change: 'legacy',
  glpi_list_computers: 'legacy',
  glpi_get_computer: 'legacy',
  glpi_create_computer: 'legacy',
  glpi_update_computer: 'legacy',
  glpi_delete_computer: 'legacy',
  glpi_list_network_equipments: 'legacy',
  glpi_get_network_equipment: 'legacy',
  glpi_create_network_equipment: 'legacy',
  glpi_update_network_equipment: 'legacy',
  glpi_delete_network_equipment: 'legacy',
  glpi_list_printers: 'legacy',
  glpi_get_printer: 'legacy',
  glpi_create_printer: 'legacy',
  glpi_update_printer: 'legacy',
  glpi_delete_printer: 'legacy',
  glpi_list_monitors: 'legacy',
  glpi_get_monitor: 'legacy',
  glpi_create_monitor: 'legacy',
  glpi_update_monitor: 'legacy',
  glpi_delete_monitor: 'legacy',
  glpi_list_phones: 'legacy',
  glpi_get_phone: 'legacy',
  glpi_create_phone: 'legacy',
  glpi_update_phone: 'legacy',
  glpi_delete_phone: 'legacy',
  glpi_list_software: 'legacy',
  glpi_get_software: 'legacy',
  glpi_create_software: 'legacy',
  glpi_update_software: 'legacy',
  glpi_delete_software: 'legacy',
  glpi_list_users: 'legacy',
  glpi_get_user: 'legacy',
  glpi_create_user: 'legacy',
  glpi_list_groups: 'legacy',
  glpi_get_group: 'legacy',
  glpi_create_group: 'legacy',
  glpi_add_user_to_group: 'legacy',
  glpi_list_categories: 'legacy',
  glpi_list_entities: 'legacy',
  glpi_list_locations: 'legacy',
  glpi_get_location: 'legacy',
  glpi_create_location: 'legacy',
  glpi_list_projects: 'legacy',
  glpi_get_project: 'legacy',
  glpi_create_project: 'legacy',
  glpi_update_project: 'legacy',
  glpi_list_documents: 'legacy',
  glpi_get_document: 'legacy',
  glpi_search_knowbase: 'legacy',
  glpi_get_knowbase_item: 'legacy',
  glpi_create_knowbase_item: 'legacy',
  glpi_list_contracts: 'legacy',
  glpi_get_contract: 'legacy',
  glpi_create_contract: 'legacy',
  glpi_list_suppliers: 'legacy',
  glpi_get_supplier: 'legacy',
  glpi_create_supplier: 'legacy',
  glpi_get_ticket_stats: 'legacy',
  glpi_get_asset_stats: 'legacy',
  glpi_tickets_stats_by: 'legacy',
  glpi_search_v2: 'legacy',
  glpi_count: 'legacy',
  glpi_list_search_options: 'legacy',
  glpi_get_session_info: 'legacy',
  glpi_search: 'legacy',
};

export interface ApiRouter {
  client: RoutedGlpiClient;
  backendForTool(toolName: string): BackendName;
  describeStartup(): string;
}

function legacyClient(config: AppConfig): GlpiClient {
  return new GlpiClient({
    url: config.glpiUrl,
    appToken: config.legacy.appToken,
    userToken: config.legacy.userToken,
    username: config.legacy.username,
    password: config.legacy.password,
    timeoutMs: config.http.timeoutMs,
    maxRetries: config.http.maxRetries,
  });
}

function highLevelProxy(config: AppConfig): RoutedGlpiClient {
  const highlevel = new HighLevelClient({
    url: config.glpiUrl,
    apiVersion: config.apiVersion,
  });
  const unsupportedNested = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'string') {
          return () => highlevel.unsupported(prop);
        }
        return undefined;
      },
    }
  );

  return new Proxy(highlevel, {
    get(target, prop) {
      if (prop in target) {
        return Reflect.get(target, prop);
      }
      if (prop === 'search' || prop === 'searchOptions') {
        return unsupportedNested;
      }
      if (typeof prop === 'string') {
        return () => target.unsupported(prop);
      }
      return undefined;
    },
  }) as unknown as RoutedGlpiClient;
}

export function createApiRouter(config: AppConfig): ApiRouter {
  if (config.apiMode === 'highlevel') {
    const client = highLevelProxy(config);
    return {
      client,
      backendForTool: () => 'highlevel',
      describeStartup: () =>
        `api_mode=highlevel highlevel_version=${config.apiVersion} auth_mode=${config.authMode}`,
    };
  }

  const client = legacyClient(config);
  return {
    client,
    backendForTool(toolName: string): BackendName {
      if (config.apiMode === 'legacy') return 'legacy';
      const backend = HYBRID_TOOL_BACKENDS[toolName];
      if (!backend) throw new HighLevelNotSupportedError(toolName);
      return backend;
    },
    describeStartup: () =>
      `api_mode=${config.apiMode} highlevel_version=${config.apiVersion} auth_mode=${config.authMode}`,
  };
}
