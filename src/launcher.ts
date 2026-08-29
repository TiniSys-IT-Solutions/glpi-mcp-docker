import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { loadEndpointProcessConfigs, EndpointProcessConfig } from './launcher/config.js';

const gatewayEntry = resolve(__dirname, '../node_modules/supergateway/dist/index.js');
const serverEntry = resolve(__dirname, 'index.js');
const children = new Map<string, ChildProcessWithoutNullStreams>();
let shuttingDown = false;

function pipeLines(stream: NodeJS.ReadableStream, prefix: string): void {
  createInterface({ input: stream }).on('line', (line) => console.error(`[${prefix}] ${line}`));
}

function gatewayArgs(config: EndpointProcessConfig): string[] {
  const sessionTimeout = process.env.MCP_SESSION_TIMEOUT_MS ?? '600000';
  const healthPath = config.name === 'stable'
    ? process.env.MCP_STABLE_HEALTH_PATH ?? process.env.MCP_HEALTH_PATH ?? '/healthz'
    : process.env.MCP_PREVIEW_HEALTH_PATH ?? '/healthz';
  return [
    gatewayEntry,
    '--stdio', `node ${serverEntry}`,
    '--outputTransport', 'streamableHttp',
    '--stateful',
    '--sessionTimeout', sessionTimeout,
    '--port', String(config.port),
    '--streamableHttpPath', config.path,
    '--healthEndpoint', healthPath,
    '--logLevel', process.env.MCP_LOG_LEVEL ?? 'info',
  ];
}

function start(config: EndpointProcessConfig): void {
  if (!config.enabled || shuttingDown) return;
  const child = spawn(process.execPath, gatewayArgs(config), {
    env: {
      ...process.env,
      GLPI_API_MODE: config.apiMode,
      MCP_RUNTIME_PROFILE: config.name,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end();
  children.set(config.name, child);
  pipeLines(child.stdout, config.name);
  pipeLines(child.stderr, config.name);
  console.error(
    `[launcher] started ${config.name} pid=${child.pid} port=${config.port} api_mode=${config.apiMode}`
  );

  child.on('error', (error) => {
    console.error(`[launcher] ${config.name} process error: ${error.message}`);
  });

  child.once('close', (code, signal) => {
    children.delete(config.name);
    if (shuttingDown) return;
    console.error(`[launcher] ${config.name} closed code=${code} signal=${signal}`);
    if (config.critical) {
      shutdown(code && code > 0 ? code : 1);
      return;
    }
    setTimeout(() => start(config), 2000).unref();
  });
}

function shutdown(exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 10000);
  timer.unref();
  if (children.size === 0) process.exit(exitCode);
  Promise.all(
    [...children.values()].map(
      (child) => new Promise<void>((resolve) => child.once('exit', () => resolve()))
    )
  ).then(() => process.exit(exitCode));
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => shutdown(0));
}

try {
  for (const config of loadEndpointProcessConfigs()) start(config);
} catch (error) {
  console.error(`[launcher] configuration error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
