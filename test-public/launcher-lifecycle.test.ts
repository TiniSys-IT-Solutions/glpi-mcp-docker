import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('launcher keeps Supergateway stdin open for the gateway lifetime', async () => {
  const source = await readFile(new URL('../src/launcher.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /child\.stdin\.end\s*\(/,
    'Supergateway 4.1 exits when its stdin is closed'
  );
});
