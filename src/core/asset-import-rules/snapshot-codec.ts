import { gunzipSync } from 'node:zlib';
import { assetRuleSnapshotSchema } from './schemas.js';
import { AssetImportRuleSnapshot } from './types.js';

const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;

export function decodeAssetRuleSnapshotGzip(value: string): AssetImportRuleSnapshot {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('snapshot_gzip_base64 is not valid base64');
  const compressed = Buffer.from(value, 'base64');
  if (compressed.length > MAX_COMPRESSED_BYTES) throw new Error('Compressed snapshot exceeds the 2 MiB safety limit');
  let decoded: Buffer;
  try { decoded = gunzipSync(compressed, { maxOutputLength: MAX_SNAPSHOT_BYTES }); }
  catch { throw new Error('snapshot_gzip_base64 is not a valid bounded gzip document'); }
  let parsed: unknown;
  try { parsed = JSON.parse(decoded.toString('utf8')); }
  catch { throw new Error('Compressed snapshot does not contain valid JSON'); }
  return assetRuleSnapshotSchema.parse(parsed);
}
