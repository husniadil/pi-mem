import { runHook } from './worker.ts';
import type { ResolvedPaths, SessionState } from './types.ts';
import type { Logger } from './logger.ts';

type NotifyLevel = 'info' | 'warning' | 'error';

export interface UI {
  notify(msg: string, level: NotifyLevel): void;
}

interface FetchOpts {
  state: SessionState;
  paths: ResolvedPaths;
  ui: UI;
  logger: Logger;
  timeoutMs: number;
}

export async function fetchAndCacheContext(opts: FetchOpts): Promise<void> {
  const { state, paths, ui, logger, timeoutMs } = opts;
  try {
    const res = await runHook(
      paths,
      'pi',
      'context',
      { sessionId: state.sessionId, cwd: state.rootPath },
      { timeoutMs, logger }
    );
    state.ctxMarkdown = (res.hookSpecificOutput?.additionalContext ?? '').trim();
    if (res.systemMessage && typeof res.systemMessage === 'string') {
      if (!ui?.notify) {
        logger.debug('ctx.ui.notify unavailable (likely non-interactive session); skipping TUI banner');
      } else {
        try {
          ui.notify(res.systemMessage, 'info');
        } catch (err) {
          logger.warn(`ui.notify failed: ${(err as Error).message}`);
        }
      }
    }
  } catch (err) {
    state.ctxMarkdown = '';
    logger.warn(`context fetch failed: ${(err as Error).message}. Continuing without memory.`);
  }
}

export function injectIntoSystemPrompt(base: string, state: SessionState): string {
  if (!state.enabled || !state.ctxMarkdown) return base;
  return `${base}\n\n<claude-mem-context>\n${state.ctxMarkdown}\n</claude-mem-context>`;
}
