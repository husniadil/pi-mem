import { runHookFireAndForget } from './worker.ts';
import type { Config, ResolvedPaths, SessionState } from './types.ts';
import type { Logger } from './logger.ts';

export interface CaptureCtx {
  state: SessionState;
  config: Config;
  paths: ResolvedPaths;
  logger: Logger;
}

function active(ctx: CaptureCtx): boolean {
  return ctx.state.enabled && ctx.config.capture;
}

function spawn(ctx: CaptureCtx, command: string, payload: unknown): void {
  runHookFireAndForget(ctx.paths, 'pi', command, payload, {
    timeoutMs: ctx.config.spawnTimeoutMs,
    logger: ctx.logger
  });
}

export function captureUserMessage(event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  const msg = event?.message;
  if (!msg || msg.role !== 'user') return;
  const prompt = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
  spawn(ctx, 'session-init', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath,
    prompt
  });
}

export function captureToolResult(event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  const toolName = event?.tool?.name ?? event?.toolName ?? 'unknown';
  spawn(ctx, 'observation', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath,
    toolName,
    toolInput: event?.input ?? event?.toolInput,
    toolResponse: event?.output ?? event?.toolResponse
  });
}

export function captureAgentEnd(_event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  spawn(ctx, 'summarize', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath
  });
}
