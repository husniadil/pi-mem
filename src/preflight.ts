import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from './paths.ts';
import { runStart } from './worker.ts';
import type { ResolvedPaths } from './types.ts';
import type { Logger } from './logger.ts';

export interface PreflightResult {
  ok: boolean;
  reason?: string;
  paths: ResolvedPaths | null;
}

interface PreflightOpts {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  timeoutMs: number;
}

function checkVersion(paths: ResolvedPaths): { ok: boolean; version?: string } {
  // workerScript = <pluginDir>/scripts/worker-service.cjs
  // package.json lives at <pluginDir>/package.json
  const pkgPath = join(paths.pluginDir, 'package.json');
  if (!existsSync(pkgPath)) return { ok: false };
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const v: string = pkg.version ?? '';
    const major = Number.parseInt(v.split('.')[0] ?? '', 10);
    return { ok: major === 13, version: v };
  } catch {
    return { ok: false };
  }
}

export async function runPreflight(opts: PreflightOpts): Promise<PreflightResult> {
  const paths = resolvePaths(opts.env);
  if (!paths) {
    const reason = 'claude-mem is not installed. Run `npx claude-mem install` first.';
    opts.logger.error(reason);
    return { ok: false, reason, paths: null };
  }

  const v = checkVersion(paths);
  if (!v.ok) {
    const reason = v.version
      ? `claude-mem ${v.version} not supported (need 13.x). Memory disabled.`
      : `claude-mem package.json missing or unreadable at ${paths.pluginDir}. Memory disabled.`;
    opts.logger.error(reason);
    return { ok: false, reason, paths };
  }

  try {
    await runStart(paths, { timeoutMs: opts.timeoutMs, logger: opts.logger });
  } catch (err) {
    const reason = `claude-mem worker failed to start: ${(err as Error).message}`;
    opts.logger.error(reason);
    return { ok: false, reason, paths };
  }

  return { ok: true, paths };
}
