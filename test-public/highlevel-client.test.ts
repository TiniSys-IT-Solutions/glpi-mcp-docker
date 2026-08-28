import assert from 'node:assert/strict';
import test from 'node:test';
import { HighLevelClient, normalizeHighLevelApiVersion } from '../src/api/highlevel/client.js';

test('normalizeHighLevelApiVersion accepts a bare version', () => {
  assert.equal(normalizeHighLevelApiVersion('2.3'), 'v2.3');
});

test('normalizeHighLevelApiVersion accepts an already-prefixed version', () => {
  assert.equal(normalizeHighLevelApiVersion('v2.3'), 'v2.3');
});

test('HighLevelClient builds /api.php/v2.3 for bare and prefixed versions', () => {
  const bare = new HighLevelClient({
    url: 'https://glpi.example.local',
    apiVersion: '2.3',
  });
  const prefixed = new HighLevelClient({
    url: 'https://glpi.example.local/',
    apiVersion: 'v2.3',
  });

  assert.equal(bare.baseUrl, 'https://glpi.example.local/api.php/v2.3');
  assert.equal(prefixed.baseUrl, 'https://glpi.example.local/api.php/v2.3');
});
