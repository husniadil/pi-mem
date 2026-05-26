import { Type, type Static } from 'typebox';
import { search, getObservations, timeline } from './search.ts';
import type { SessionState, GetObservationsParams, TimelineParams } from './types.ts';
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

export const MemGetObservationsParams = Type.Object({
  ids: Type.Array(Type.Number(), {
    description: 'Observation IDs to fetch (from prior mem_search result tables)'
  }),
  orderBy: Type.Optional(Type.Union(
    [Type.Literal('date_desc'), Type.Literal('date_asc')],
    { description: 'Order returned records by created_at' }
  )),
  limit: Type.Optional(Type.Number({
    description: 'Post-filter cap on returned records',
    minimum: 1
  })),
  project: Type.Optional(Type.String({
    description: 'Restrict to one project'
  }))
});
export type MemGetObservationsArgs = Static<typeof MemGetObservationsParams>;

export async function handleGetObservations(
  args: MemGetObservationsArgs,
  ctx: ToolCtx
): Promise<string> {
  if (!ctx.state.enabled) return 'Error: pi-mem disabled (preflight failed)';
  try {
    const records = await getObservations(args as GetObservationsParams, {
      env: ctx.env,
      logger: ctx.logger,
      timeoutMs: ctx.timeoutMs
    });
    return JSON.stringify(records, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

export const MemTimelineParams = Type.Object({
  anchor: Type.Optional(Type.Union(
    [Type.String(), Type.Number()],
    { description: 'Observation ID (number), session ID (e.g. "S123"), or ISO timestamp. XOR with `query`.' }
  )),
  query: Type.Optional(Type.String({
    description: 'Full-text query — claude-mem finds the top match and uses it as anchor. XOR with `anchor`.'
  })),
  depth_before: Type.Optional(Type.Number({
    description: 'Items before the anchor (default 10 at claude-mem side)',
    minimum: 1
  })),
  depth_after: Type.Optional(Type.Number({
    description: 'Items after the anchor (default 10 at claude-mem side)',
    minimum: 1
  })),
  project: Type.Optional(Type.String({
    description: 'Restrict timeline to one project'
  }))
});
export type MemTimelineArgs = Static<typeof MemTimelineParams>;

export async function handleTimeline(args: MemTimelineArgs, ctx: ToolCtx): Promise<string> {
  if (!ctx.state.enabled) return 'Error: pi-mem disabled (preflight failed)';
  try {
    const res = await timeline(args as TimelineParams, {
      env: ctx.env,
      logger: ctx.logger,
      timeoutMs: ctx.timeoutMs
    });
    return extractMarkdown(res);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
