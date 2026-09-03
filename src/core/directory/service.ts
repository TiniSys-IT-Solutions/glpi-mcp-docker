import { OrganizationListRequest } from '../organization/types.js';

export interface DirectoryService {
  listUsers(input: OrganizationListRequest & { activeOnly?: boolean }): Promise<unknown>;
  getUser(id: number): Promise<unknown>;
  findUserByName(name: string): Promise<unknown>;
  listGroups(input: OrganizationListRequest): Promise<unknown>;
  getGroup(id: number): Promise<unknown>;
}
