import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function settingsPath(env: NodeJS.ProcessEnv): string {
  const dataDir = env.CLAUDE_MEM_DATA_DIR ?? join(env.HOME ?? '', '.claude-mem');
  return join(dataDir, 'settings.json');
}

function readSettingsField(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const path = settingsPath(env);
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const root = raw && typeof raw === 'object' ? raw : {};
    const env_ = root.env && typeof root.env === 'object' ? root.env : root;
    const v = env_[key];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

function defaultPort(): string {
  const uid = (process.getuid?.() ?? 77) % 100;
  return String(37700 + uid);
}

export function resolvePort(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_MEM_WORKER_PORT ?? readSettingsField(env, 'CLAUDE_MEM_WORKER_PORT') ?? defaultPort();
}

export function resolveHost(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_MEM_WORKER_HOST ?? readSettingsField(env, 'CLAUDE_MEM_WORKER_HOST') ?? '127.0.0.1';
}
