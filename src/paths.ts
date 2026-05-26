import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedPaths } from './types.ts';

function claudeConfigDir(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? '', '.claude');
}

function findLatestCacheVersion(cacheBase: string): string | null {
  if (!existsSync(cacheBase)) return null;
  let entries: string[] = [];
  try {
    entries = readdirSync(cacheBase);
  } catch {
    return null;
  }
  let bestName: string | null = null;
  let bestMtime = -Infinity;
  for (const name of entries) {
    const full = join(cacheBase, name);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs > bestMtime) {
      bestMtime = mtimeMs;
      bestName = name;
    }
  }
  return bestName;
}

function tryPluginDir(pluginDir: string): ResolvedPaths | null {
  const workerScript = join(pluginDir, 'scripts', 'worker-service.cjs');
  const bunRunner = join(pluginDir, 'scripts', 'bun-runner.js');
  if (!existsSync(workerScript) || !existsSync(bunRunner)) return null;
  return { workerScript, bunRunner, pluginDir };
}

export function resolvePaths(env: NodeJS.ProcessEnv): ResolvedPaths | null {
  // 1) CLAUDE_PLUGIN_ROOT (Claude Code injected)
  if (env.CLAUDE_PLUGIN_ROOT) {
    const r = tryPluginDir(env.CLAUDE_PLUGIN_ROOT);
    if (r) return r;
  }

  const ccd = claudeConfigDir(env);

  // 2) Latest cache version
  const cacheBase = join(ccd, 'plugins', 'cache', 'thedotmack', 'claude-mem');
  const latest = findLatestCacheVersion(cacheBase);
  if (latest) {
    const r = tryPluginDir(join(cacheBase, latest, 'plugin'));
    if (r) return r;
  }

  // 3) Marketplace canonical
  const marketplace = join(ccd, 'plugins', 'marketplaces', 'thedotmack', 'plugin');
  const r3 = tryPluginDir(marketplace);
  if (r3) return r3;

  return null;
}
