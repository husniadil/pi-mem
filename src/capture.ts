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

/**
 * Extract plain text from pi message content.
 *
 * Pi messages carry `content` as either:
 * - a plain string (older / simpler shape)
 * - an array of MCP-style content blocks: `[{ type: 'text', text: '...' }, ...]`
 *   (the shape pi 0.74+ uses for user, assistant, and toolResult messages)
 *
 * For block arrays we join only text-type blocks with newlines. Non-text
 * blocks (image, resource, etc.) are dropped — claude-mem's corpus is
 * text-oriented and a base64 image payload would just bloat the prompt.
 * Returns '' when nothing usable is present.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b && typeof b === 'object' && (b as any).type === 'text' && typeof (b as any).text === 'string'
      )
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

export function captureUserMessage(event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  const msg = event?.message;
  if (!msg || msg.role !== 'user') return;
  const prompt = extractTextContent(msg.content);
  if (!prompt) return;
  spawn(ctx, 'session-init', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath,
    prompt
  });
}

export function captureToolResult(event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  const toolName = event?.tool?.name ?? event?.toolName ?? 'unknown';
  const rawResponse = event?.output ?? event?.toolResponse;
  // toolResponse may be a content-block array (pi tool execute() return shape)
  // or already a string. Normalize to string so claude-mem corpus stays clean.
  const toolResponse = Array.isArray(rawResponse) ? extractTextContent(rawResponse) : rawResponse;
  spawn(ctx, 'observation', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath,
    toolName,
    toolInput: event?.input ?? event?.toolInput,
    toolResponse
  });
}

export function captureAgentEnd(_event: any, ctx: CaptureCtx): void {
  if (!active(ctx)) return;
  spawn(ctx, 'summarize', {
    sessionId: ctx.state.sessionId,
    cwd: ctx.state.rootPath
  });
}
