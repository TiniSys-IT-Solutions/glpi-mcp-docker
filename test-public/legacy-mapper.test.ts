import assert from 'node:assert/strict';
import test from 'node:test';
import { mapTicketWriteInput } from '../src/api/legacy/mapper.js';

test('mapTicketWriteInput maps friendly ticket fields to GLPI Legacy fields', () => {
  const payload = mapTicketWriteInput({
    name: 'Printer issue',
    content: 'Printer does not answer.',
    type: 1,
    status: 2,
    urgency: 2,
    impact: 3,
    priority: 3,
    category_id: 12,
    entity_id: 8,
    location_id: 42,
    requester_user_id: 100,
    requester_group_id: 200,
    assigned_user_id: 300,
    assigned_group_id: 400,
    time_to_resolve: '2026-08-20 17:00:00',
  });

  assert.deepEqual(payload, {
    name: 'Printer issue',
    content: 'Printer does not answer.',
    type: 1,
    status: 2,
    urgency: 2,
    impact: 3,
    priority: 3,
    time_to_resolve: '2026-08-20 17:00:00',
    itilcategories_id: 12,
    entities_id: 8,
    locations_id: 42,
    _users_id_requester: 100,
    _groups_id_requester: 200,
    _users_id_assign: 300,
    _groups_id_assign: 400,
  });
});

test('mapTicketWriteInput keeps legacy aliases during migration', () => {
  const payload = mapTicketWriteInput({
    itilcategories_id: 7,
    entities_id: 9,
    locations_id: 11,
    user_id_assign: 13,
    group_id_assign: 15,
  });

  assert.equal(payload.itilcategories_id, 7);
  assert.equal(payload.entities_id, 9);
  assert.equal(payload.locations_id, 11);
  assert.equal(payload._users_id_assign, 13);
  assert.equal(payload._groups_id_assign, 15);
});

test('mapTicketWriteInput maps update location_id to locations_id', () => {
  const payload = mapTicketWriteInput({
    location_id: 84,
  });

  assert.deepEqual(payload, {
    locations_id: 84,
  });
});
