import { realpathSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createSessionState, deriveSessionId } from './session.ts';
import { runPreflight } from './preflight.ts';
import { fetchAndCacheContext, injectIntoSystemPrompt } from './inject.ts';
import { captureUserMessage, captureToolResult, captureAgentEnd } from './capture.ts';
import { handleSearch, MEM_SEARCH_SCHEMA } from './tool.ts';
import type { SessionState, ResolvedPaths } from './types.ts';

export default async function piMem(pi: any): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);

  if (!config.enabled) {
    logger.info('pi-mem disabled via PI_MEM_ENABLED=false');
    return;
  }

  let state: SessionState | null = null;
  let paths: ResolvedPaths | null = null;

  pi.on('session_start', async (event: any, ctx: any) => {
    const sessionId = deriveSessionId(event);
    let rootPath: string;
    try { rootPath = realpathSync(process.cwd()); }
    catch { rootPath = process.cwd(); }

    state = createSessionState({ sessionId, rootPath });

    const r = await runPreflight({ env: process.env, logger, timeoutMs: 60000 });
    if (!r.ok || !r.paths) {
      state.enabled = false;
      return;
    }
    paths = r.paths;

    await fetchAndCacheContext({
      state,
      paths,
      ui: ctx.ui,
      logger,
      timeoutMs: config.spawnTimeoutMs
    });
  });

  pi.on('before_agent_start', async (event: any) => {
    if (!state) return event;
    const newPrompt = injectIntoSystemPrompt(event.systemPrompt ?? '', state);
    if (newPrompt === (event.systemPrompt ?? '')) {
      if (!state.enabled) logger.debug('inject skipped: pi-mem disabled (preflight failed)');
      else if (!state.ctxMarkdown) logger.debug('inject skipped: no memory available for this project yet');
      return event;
    }
    return { ...event, systemPrompt: newPrompt };
  });

  pi.on('message_end', (event: any) => {
    if (!state || !paths) return;
    captureUserMessage(event, { state, config, paths, logger });
  });

  pi.on('tool_result', (event: any) => {
    if (!state || !paths) return;
    captureToolResult(event, { state, config, paths, logger });
  });

  pi.on('agent_end', (event: any) => {
    if (!state || !paths) return;
    captureAgentEnd(event, { state, config, paths, logger });
  });

  pi.registerTool('mem_search', {
    description: 'Search the claude-mem corpus for past observations relevant to a query.',
    inputSchema: MEM_SEARCH_SCHEMA,
    async handler(args: { query: string; limit?: number }) {
      if (!state) return 'Error: pi-mem not initialized (no active session)';
      return handleSearch(args, { state, env: process.env, logger, timeoutMs: config.spawnTimeoutMs });
    }
  });

  logger.info('pi-mem extension loaded');
}
