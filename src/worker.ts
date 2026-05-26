import { spawn, type ChildProcess } from 'node:child_process';
import type { ResolvedPaths, HookResponse } from './types.ts';
import type { Logger } from './logger.ts';

interface SpawnOpts {
  timeoutMs: number;
  logger: Logger;
}

function spawnWorker(paths: ResolvedPaths, args: string[]): ChildProcess {
  return spawn('node', [paths.bunRunner, paths.workerScript, ...args], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function collect(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', () => resolve(''));
  });
}

function awaitExit(child: ChildProcess, opts: SpawnOpts): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const stderrPromise = collect(child.stderr!);
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(new Error(`pi-mem worker spawn timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', async (code) => {
      clearTimeout(timer);
      const stderr = await stderrPromise;
      resolve({ code: code ?? 0, stderr });
    });
  });
}

export async function runStart(paths: ResolvedPaths, opts: SpawnOpts): Promise<void> {
  const child = spawnWorker(paths, ['start']);
  child.stdin?.end();
  const { code, stderr } = await awaitExit(child, opts);
  if (code !== 0) {
    throw new Error(`pi-mem worker start exit ${code}: ${stderr.trim().slice(-200)}`);
  }
}

export async function runHook(
  paths: ResolvedPaths,
  platform: string,
  command: string,
  payload: unknown,
  opts: SpawnOpts
): Promise<HookResponse> {
  const child = spawnWorker(paths, ['hook', platform, command]);
  const stdoutPromise = collect(child.stdout!);
  child.stdin?.end(JSON.stringify(payload));

  const { code, stderr } = await awaitExit(child, opts);
  if (code !== 0) {
    throw new Error(`pi-mem hook ${command} exit ${code}: ${stderr.trim().slice(-200)}`);
  }
  const stdout = await stdoutPromise;
  try {
    return JSON.parse(stdout) as HookResponse;
  } catch {
    opts.logger.warn(`hook ${command} returned non-JSON stdout (len=${stdout.length})`);
    return {};
  }
}

export function runHookFireAndForget(
  paths: ResolvedPaths,
  platform: string,
  command: string,
  payload: unknown,
  opts: SpawnOpts
): void {
  let child: ChildProcess;
  try {
    child = spawnWorker(paths, ['hook', platform, command]);
  } catch (err) {
    opts.logger.warn(`capture spawn failed for ${command}: ${(err as Error).message}`);
    return;
  }
  child.unref();
  try {
    child.stdin?.end(JSON.stringify(payload));
  } catch (err) {
    opts.logger.warn(`capture stdin write failed for ${command}: ${(err as Error).message}`);
  }
  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {}
    opts.logger.warn(`capture ${command} timed out, killed`);
  }, opts.timeoutMs);
  timer.unref();
  child.on('error', (err) => {
    clearTimeout(timer);
    opts.logger.warn(`capture ${command} error: ${err.message}`);
  });
  child.on('exit', (code) => {
    clearTimeout(timer);
    if (code !== 0) opts.logger.warn(`capture ${command} exit ${code}`);
  });
}
