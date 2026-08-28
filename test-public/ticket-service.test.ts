import assert from 'node:assert/strict';
import test from 'node:test';
import { GlpiClient } from '../src/api/legacy/glpi-client.js';
import { LegacyTicketService } from '../src/api/legacy/tickets.js';

test('LegacyTicketService accepts the business ticket contract for create', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let capturedItemtype = '';
  let capturedPayload: unknown;

  (client as any).createItem = async (itemtype: string, payload: unknown) => {
    capturedItemtype = itemtype;
    capturedPayload = payload;
    return { id: 123 };
  };

  const service = new LegacyTicketService(client);
  const result = await service.create({
    name: 'Printer issue',
    content: 'Printer does not answer.',
    entity_id: 8,
    location_id: 42,
    category_id: 12,
    requester_user_id: 100,
    assigned_user_id: 300,
    urgency: 2,
    impact: 3,
    priority: 4,
    status: 1,
    time_to_resolve: '2026-08-20 17:00:00',
  });

  assert.deepEqual(result, { id: 123 });
  assert.equal(capturedItemtype, 'Ticket');
  assert.deepEqual(capturedPayload, {
    name: 'Printer issue',
    content: 'Printer does not answer.',
    status: 1,
    urgency: 2,
    impact: 3,
    priority: 4,
    time_to_resolve: '2026-08-20 17:00:00',
    itilcategories_id: 12,
    entities_id: 8,
    locations_id: 42,
    _users_id_requester: 100,
    _users_id_assign: 300,
  });
});

test('LegacyTicketService accepts the same business contract for update', async () => {
  const client = new GlpiClient({ url: 'https://glpi.test', userToken: 'u' });
  let capturedItemtype = '';
  let capturedId = 0;
  let capturedPayload: unknown;

  (client as any).updateItem = async (itemtype: string, id: number, payload: unknown) => {
    capturedItemtype = itemtype;
    capturedId = id;
    capturedPayload = payload;
    return true;
  };

  const service = new LegacyTicketService(client);
  const result = await service.update(456, {
    name: 'Updated printer issue',
    content: 'Printer responds intermittently.',
    type: 2,
    status: 2,
    entity_id: 9,
    location_id: 84,
    category_id: 13,
    requester_group_id: 200,
    assigned_group_id: 400,
    urgency: 3,
    impact: 4,
    priority: 5,
    time_to_resolve: '2026-08-21 17:00:00',
  });

  assert.deepEqual(result, { success: true, id: 456 });
  assert.equal(capturedItemtype, 'Ticket');
  assert.equal(capturedId, 456);
  assert.deepEqual(capturedPayload, {
    name: 'Updated printer issue',
    content: 'Printer responds intermittently.',
    type: 2,
    status: 2,
    urgency: 3,
    impact: 4,
    priority: 5,
    time_to_resolve: '2026-08-21 17:00:00',
    itilcategories_id: 13,
    entities_id: 9,
    locations_id: 84,
    _groups_id_requester: 200,
    _groups_id_assign: 400,
  });
});
