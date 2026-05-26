import { Type, type Static } from 'typebox';
import { search } from './search.ts';
import type { SessionState } from './types.ts';
import type { Logger } from './logger.ts';

export const MemSearchParams = Type.Object({
  query: Type.String({ description: 'Search query against claude-mem corpus' }),
  limit: Type.Optional(Type.Number({
    description: 'Max results per category (obs/sessions/prompts) — total results may be 2-3× this',
    minimum: 1,
    maximum: 50,
    default: 10
  }))
});
export type MemSearchArgs = Static<typeof MemSearchParams>;

interface ToolCtx {
  state: SessionState;
  env: NodeJS.ProcessEnv;
  logger: Logger;
  timeoutMs: number;
}

export function extractMarkdown(res: { content?: Array<{ type: string; text: string }> }): string {
  const text = res.content?.find(b => b.type === 'text')?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return 'Error: claude-mem returned an empty or malformed search response';
  }
  return text;
}

export async function handleSearch(args: MemSearchArgs, ctx: ToolCtx): Promise<string> {
  if (!ctx.state.enabled) return 'Error: pi-mem disabled (preflight failed)';
  try {
    const res = await search(args.query, {
      env: ctx.env,
      logger: ctx.logger,
      timeoutMs: ctx.timeoutMs,
      limit: args.limit
    });
    return extractMarkdown(res);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
