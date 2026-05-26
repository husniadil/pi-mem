import { resolvePort, resolveHost } from './port.ts';
import type { SearchResponse } from './types.ts';
import type { Logger } from './logger.ts';

interface SearchOpts {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  timeoutMs: number;
  limit?: number;
}

export async function search(query: string, opts: SearchOpts): Promise<SearchResponse> {
  const host = resolveHost(opts.env);
  const port = resolvePort(opts.env);
  const params = new URLSearchParams({ query });
  if (typeof opts.limit === 'number' && opts.limit > 0) {
    params.set('limit', String(opts.limit));
  }
  const url = `http://${host}:${port}/api/search?${params.toString()}`;
  opts.logger.debug(`search GET ${url}`);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs) });
  } catch (err: unknown) {
    const cause = (err as any)?.cause;
    if (cause?.code === 'ECONNREFUSED') {
      throw new Error('claude-mem worker not reachable. Try `npx claude-mem start`.');
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`search HTTP ${res.status}`);
  }
  return res.json() as Promise<SearchResponse>;
}
