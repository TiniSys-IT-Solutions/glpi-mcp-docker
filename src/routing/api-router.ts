import { AppConfig } from '../config/env.js';
import { GlpiClient } from '../api/legacy/glpi-client.js';
import { HighLevelClient, HighLevelNotSupportedError } from '../api/highlevel/client.js';
import { HighLevelTicketService } from '../api/highlevel/tickets.js';
import { LegacyTicketService } from '../api/legacy/tickets.js';
import { LegacyIPNetworkService } from '../api/legacy/ip-networks.js';
import { LegacyInventoryPluginService } from '../api/legacy/inventory-plugin.js';
import { LegacySessionService } from '../api/legacy/session.js';
import { HighLevelSessionService } from '../api/highlevel/session.js';
import { GlpiOAuthClient, PasswordGrantTokenProvider } from '../api/highlevel/oauth.js';
import { GlpiServices } from '../core/services.js';
import { LegacyImportEntityRuleService } from '../api/legacy/rules.js';
import { HighLevelImportEntityRuleService } from '../api/highlevel/rules.js';
import { LegacyOrganizationService } from '../api/legacy/organization.js';
import { HighLevelOrganizationService } from '../api/highlevel/organization.js';
import { LegacyDirectoryService } from '../api/legacy/directory.js';
import { HighLevelDirectoryService } from '../api/highlevel/directory.js';

export type BackendName = 'legacy' | 'highlevel';

export const HYBRID_TOOL_BACKENDS: Record<string, BackendName> = {
  glpi_list_import_entity_rules: 'legacy',
  glpi_get_import_entity_rule: 'legacy',
  glpi_list_import_entity_rule_criteria: 'legacy',
  glpi_get_import_entity_rule_criterion: 'legacy',
  glpi_list_import_entity_rule_actions: 'legacy',
  glpi_get_import_entity_rule_action: 'legacy',
  glpi_create_import_entity_subnet_rule: 'legacy',
  glpi_update_import_entity_rule: 'legacy',
  glpi_set_import_entity_rule_enabled: 'legacy',
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
  glpi_list_printers: 'legacy',
  glpi_get_printer: 'legacy',
  glpi_list_monitors: 'legacy',
  glpi_get_monitor: 'legacy',
  glpi_list_phones: 'legacy',
  glpi_get_phone: 'legacy',
  glpi_list_softwares: 'legacy',
  glpi_get_software: 'legacy',
  glpi_create_software: 'legacy',
  glpi_list_users: 'legacy',
  glpi_get_user: 'legacy',
  glpi_search_user: 'legacy',
  glpi_create_user: 'legacy',
  glpi_list_groups: 'legacy',
  glpi_get_group: 'legacy',
  glpi_create_group: 'legacy',
  glpi_add_user_to_group: 'legacy',
  glpi_list_categories: 'legacy',
  glpi_list_entities: 'legacy',
  glpi_get_entity: 'legacy',
  glpi_list_locations: 'legacy',
  glpi_get_location: 'legacy',
  glpi_create_location: 'legacy',
  glpi_create_entity: 'legacy',
  glpi_update_entity: 'legacy',
  glpi_list_projects: 'legacy',
  glpi_get_project: 'legacy',
  glpi_create_project: 'legacy',
  glpi_update_project: 'legacy',
  glpi_list_documents: 'legacy',
  glpi_get_document: 'legacy',
  glpi_list_knowbase: 'legacy',
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
  glpi_list_ip_networks: 'legacy',
  glpi_get_ip_network: 'legacy',
  glpi_create_ip_network: 'legacy',
  glpi_update_ip_network: 'legacy',
  glpi_inventory_list_ip_ranges: 'legacy',
  glpi_inventory_get_ip_range: 'legacy',
  glpi_inventory_create_ip_range: 'legacy',
  glpi_inventory_create_ip_range_from_cidr: 'legacy',
  glpi_inventory_update_ip_range: 'legacy',
  glpi_inventory_list_ip_range_snmp_credentials: 'legacy',
  glpi_inventory_get_ip_range_snmp_credential: 'legacy',
  glpi_inventory_attach_snmp_credential_to_ip_range: 'legacy',
  glpi_inventory_update_ip_range_snmp_credential: 'legacy',
  glpi_inventory_detach_snmp_credential_from_ip_range: 'legacy',
  glpi_inventory_create_task: 'legacy',
  glpi_inventory_update_task: 'legacy',
  glpi_inventory_enable_task: 'legacy',
  glpi_inventory_disable_task: 'legacy',
  glpi_inventory_requeue_task: 'legacy',
  glpi_inventory_create_credential: 'legacy',
  glpi_inventory_update_credential: 'legacy',
  glpi_inventory_list_credentials: 'legacy',
  glpi_inventory_get_credential: 'legacy',
  glpi_inventory_list_tasks: 'legacy',
  glpi_inventory_get_task: 'legacy',
  glpi_inventory_list_task_jobs: 'legacy',
  glpi_inventory_get_task_job: 'legacy',
  glpi_inventory_list_task_job_states: 'legacy',
  glpi_inventory_get_task_job_state: 'legacy',
  glpi_inventory_list_timeslots: 'legacy',
  glpi_inventory_get_timeslot: 'legacy',
  glpi_inventory_list_collects: 'legacy',
  glpi_inventory_get_collect: 'legacy',
  glpi_inventory_list_collect_files: 'legacy',
  glpi_inventory_get_collect_file: 'legacy',
  glpi_inventory_list_collect_registries: 'legacy',
  glpi_inventory_get_collect_registry: 'legacy',
  glpi_inventory_list_collect_wmi_queries: 'legacy',
  glpi_inventory_get_collect_wmi_query: 'legacy',
  glpi_inventory_list_deploy_packages: 'legacy',
  glpi_inventory_get_deploy_package: 'legacy',
  glpi_inventory_list_deploy_groups: 'legacy',
  glpi_inventory_get_deploy_group: 'legacy',
};

export interface ApiRouter {
  legacyClient?: GlpiClient;
  services: GlpiServices;
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

function highLevelClient(config: AppConfig): HighLevelClient {
  const { oauthClientId, oauthClientSecret, oauthUsername, oauthPassword } = config.highlevel;
  const accessTokenProvider = oauthClientId && oauthClientSecret && oauthUsername && oauthPassword
    ? new PasswordGrantTokenProvider(
        new GlpiOAuthClient({
          url: config.glpiUrl,
          clientId: oauthClientId,
          clientSecret: oauthClientSecret,
        }),
        { username: oauthUsername, password: oauthPassword, scope: 'api user' }
      )
    : undefined;
  return new HighLevelClient({
    url: config.glpiUrl,
    apiVersion: config.apiVersion,
    accessTokenProvider,
    timeoutMs: config.http.timeoutMs,
  });
}

export function createApiRouter(config: AppConfig): ApiRouter {
  if (config.apiMode === 'highlevel') {
    const highlevel = highLevelClient(config);
    return {
      services: {
        tickets: new HighLevelTicketService(highlevel),
        session: new HighLevelSessionService(highlevel),
        importEntityRules: new HighLevelImportEntityRuleService(highlevel),
        organization: new HighLevelOrganizationService(highlevel),
        directory: new HighLevelDirectoryService(highlevel),
      },
      backendForTool: () => 'highlevel',
      describeStartup: () =>
        `api_mode=highlevel highlevel_version=${highlevel.apiVersion} auth_mode=${config.authMode}`,
    };
  }

  const client = legacyClient(config);
  return {
    legacyClient: client,
    services: {
      tickets: new LegacyTicketService(client),
      ipNetworks: new LegacyIPNetworkService(client),
      inventoryPlugin: new LegacyInventoryPluginService(client),
      session: new LegacySessionService(client),
      importEntityRules: new LegacyImportEntityRuleService(client),
      organization: new LegacyOrganizationService(client),
      directory: new LegacyDirectoryService(client),
    },
    backendForTool(toolName: string): BackendName {
      if (config.apiMode === 'legacy') return 'legacy';
      const backend = HYBRID_TOOL_BACKENDS[toolName];
      if (!backend) throw new HighLevelNotSupportedError(toolName);
      return backend;
    },
    describeStartup: () =>
      `api_mode=${config.apiMode} highlevel_version=${new HighLevelClient({
        url: config.glpiUrl,
        apiVersion: config.apiVersion,
      }).apiVersion} auth_mode=${config.authMode}`,
  };
}
