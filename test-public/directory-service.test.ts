import assert from 'node:assert/strict';
import test from 'node:test';
import { HighLevelClient } from '../src/api/highlevel/client.js';
import { HighLevelDirectoryService } from '../src/api/highlevel/directory.js';
import { LegacyDirectoryService } from '../src/api/legacy/directory.js';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';

test('High-Level directory reads use official Administration routes', async () => {
  const paths: string[] = [];
  const client = new HighLevelClient({ url: 'https://glpi.test', apiVersion: '2.3' });
  (client as unknown as { request(path: string): Promise<unknown> }).request = async (path) => {
    paths.push(path);
    return [];
  };
  const service = new HighLevelDirectoryService(client);

  await service.listUsers({ start: 10, limit: 5, activeOnly: true });
  await service.getUser(7);
  await service.findUserByName('jdupont');
  await service.listGroups({ limit: 20 });
  await service.getGroup(4);

  assert.deepEqual(paths, [
    'Administration/User?start=10&limit=5&filter=is_active%3D%3Dtrue',
    'Administration/User/7',
    'Administration/User/username/jdupont',
    'Administration/Group?start=0&limit=20',
    'Administration/Group/4',
  ]);
});

test('Legacy directory reads preserve active filtering and inclusive pagination', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'token' });
  let userOptions: unknown;
  let groupOptions: unknown;
  (client as unknown as { getUsers(options: unknown): Promise<unknown> }).getUsers = async (options) => {
    userOptions = options;
    return [];
  };
  (client as unknown as { getGroups(options: unknown): Promise<unknown> }).getGroups = async (options) => {
    groupOptions = options;
    return [];
  };
  const service = new LegacyDirectoryService(client);

  await service.listUsers({ start: 10, limit: 5, activeOnly: false });
  await service.listGroups({ start: 2, limit: 3 });

  assert.deepEqual(userOptions, { range: '10-14', sort: undefined, order: undefined, expand_dropdowns: undefined, is_active: false });
  assert.deepEqual(groupOptions, { range: '2-4', sort: undefined, order: undefined, expand_dropdowns: undefined });
});
