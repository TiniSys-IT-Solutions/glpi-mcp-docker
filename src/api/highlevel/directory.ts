import { DirectoryService } from '../../core/directory/service.js';
import { OrganizationListRequest } from '../../core/organization/types.js';
import { HighLevelClient } from './client.js';

function query(input: OrganizationListRequest & { activeOnly?: boolean }): string {
  const params = new URLSearchParams();
  params.set('start', String(input.start ?? 0));
  params.set('limit', String(input.limit ?? 50));
  if (input.sort) params.set('sort', input.sort);
  if (input.order) params.set('order', input.order);
  if (input.activeOnly !== undefined) params.set('filter', `is_active==${input.activeOnly}`);
  return params.toString();
}

export class HighLevelDirectoryService implements DirectoryService {
  constructor(private readonly client: HighLevelClient) {}

  listUsers(input: OrganizationListRequest & { activeOnly?: boolean }) {
    return this.client.request(`Administration/User?${query(input)}`);
  }
  getUser(id: number) { return this.client.request(`Administration/User/${id}`); }
  findUserByName(name: string) {
    return this.client.request(`Administration/User/username/${encodeURIComponent(name)}`);
  }
  listGroups(input: OrganizationListRequest) {
    return this.client.request(`Administration/Group?${query(input)}`);
  }
  getGroup(id: number) { return this.client.request(`Administration/Group/${id}`); }
}
