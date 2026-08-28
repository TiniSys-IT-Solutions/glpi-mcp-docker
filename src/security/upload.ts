import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export interface SafeUpload {
  data: Uint8Array;
  path: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('MCP_UPLOAD_MAX_BYTES must be a positive integer');
  }
  return parsed;
}

export async function readSafeUpload(
  requestedPath: string,
  uploadRoot = process.env.MCP_UPLOAD_ROOT ?? '/uploads',
  maxBytes = positiveInteger(process.env.MCP_UPLOAD_MAX_BYTES, 25 * 1024 * 1024)
): Promise<SafeUpload> {
  const canonicalRoot = await realpath(resolve(uploadRoot));
  const candidate = isAbsolute(requestedPath) ? requestedPath : resolve(canonicalRoot, requestedPath);
  const canonicalPath = await realpath(candidate);
  const fromRoot = relative(canonicalRoot, canonicalPath);

  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('file is outside MCP_UPLOAD_ROOT');
  }

  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) throw new Error('path is not a regular file');
  if (metadata.size > maxBytes) {
    throw new Error(`file exceeds MCP_UPLOAD_MAX_BYTES (${maxBytes})`);
  }

  return { data: await readFile(canonicalPath), path: canonicalPath };
}
