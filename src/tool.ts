import { Type, type Static } from 'typebox';
import { search } from './search.ts';
import type { SearchResult, SessionState } from './types.ts';
import type { Logger } from './logger.ts';

export const MemSearchParams = Type.Object({
  query: Type.String({ description: 'Search query against claude-mem corpus' }),
  limit: Type.Optional(Type.Number({
    description: 'Max results (1-50)',
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

function formatDate(s?: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

export function formatResults(query: string, results: SearchResult[]): string {
  if (!results.length) return `No matches for query: ${query}`;
  const blocks = results.map(r => {
    const date = formatDate(r.createdAt);
    const heading = date ? `## ${date} — ${r.title ?? '(untitled)'}` : `## ${r.title ?? '(untitled)'}`;
    const body = r.narrative?.trim();
    const files = (r.filesModified ?? []).filter(f => typeof f === 'string' && f.length > 0);
    const lines = [heading];
    if (body) lines.push(body);
    if (files.length) lines.push(`Files: ${files.join(', ')}`);
    return lines.join('\n');
  });
  return `# Memory search: "${query}"\n\n${results.length} matches.\n\n${blocks.join('\n\n')}`;
}

export async function handleSearch(args: MemSearchArgs, ctx: ToolCtx): Promise<string> {
  if (!ctx.state.enabled) return 'Error: pi-mem disabled (preflight failed)';
  try {
    const res = await search(args.query, { env: ctx.env, logger: ctx.logger, timeoutMs: ctx.timeoutMs });
    const results = (res.results ?? []).slice(0, args.limit ?? 10);
    return formatResults(args.query, results);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
