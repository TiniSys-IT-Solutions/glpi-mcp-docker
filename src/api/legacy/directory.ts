import { DirectoryService } from '../../core/directory/service.js';
import { OrganizationListRequest } from '../../core/organization/types.js';
import { GlpiClient, ListOptions } from './glpi-client.js';

function options(input: OrganizationListRequest): ListOptions {
  const start = input.start ?? 0;
  const limit = input.limit ?? 50;
  return {
    range: `${start}-${start + limit - 1}`,
    sort: input.sort === undefined ? undefined : Number(input.sort),
    order: input.order,
    expand_dropdowns: input.expandDropdowns,
  };
}

export class LegacyDirectoryService implements DirectoryService {
  constructor(private readonly client: GlpiClient) {}

  listUsers(input: OrganizationListRequest & { activeOnly?: boolean }) {
    return this.client.getUsers({ ...options(input), is_active: input.activeOnly ?? true });
  }
  getUser(id: number) { return this.client.getUser(id); }
  findUserByName(name: string) { return this.client.getUserByName(name); }
  listGroups(input: OrganizationListRequest) { return this.client.getGroups(options(input)); }
  getGroup(id: number) { return this.client.getGroup(id); }
}
