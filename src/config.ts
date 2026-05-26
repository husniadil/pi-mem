import type { Config, LogLevel } from './types.ts';

const VALID_LEVELS: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

function parseBool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return dflt;
}

function parsePositiveInt(v: string | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return n;
}

function parseLogLevel(v: string | undefined, dflt: LogLevel): LogLevel {
  if (v === undefined) return dflt;
  return (VALID_LEVELS as string[]).includes(v) ? (v as LogLevel) : dflt;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    enabled:        parseBool(env.PI_MEM_ENABLED, true),
    capture:        parseBool(env.PI_MEM_CAPTURE, true),
    spawnTimeoutMs: parsePositiveInt(env.PI_MEM_SPAWN_TIMEOUT_MS, 30000),
    logLevel:       parseLogLevel(env.PI_MEM_LOG_LEVEL, 'warn')
  };
}
