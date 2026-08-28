import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readSafeUpload } from '../src/security/upload.js';

test('readSafeUpload accepts a regular file inside the configured root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glpi-upload-'));
  await writeFile(join(root, 'document.txt'), 'safe');
  const result = await readSafeUpload('document.txt', root, 100);
  assert.equal(Buffer.from(result.data).toString(), 'safe');
});

test('readSafeUpload rejects traversal and symlink escape', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'glpi-upload-'));
  const root = join(parent, 'uploads');
  await mkdir(root);
  const outside = join(parent, 'secret.txt');
  await writeFile(outside, 'secret');
  await symlink(outside, join(root, 'link.txt'));
  await assert.rejects(() => readSafeUpload('../secret.txt', root, 100), /outside/);
  await assert.rejects(() => readSafeUpload('link.txt', root, 100), /outside/);
});

test('readSafeUpload enforces the configured size limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glpi-upload-'));
  await writeFile(join(root, 'large.txt'), '12345');
  await assert.rejects(() => readSafeUpload('large.txt', root, 4), /exceeds/);
});
