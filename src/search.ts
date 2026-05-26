import { resolvePort, resolveHost } from './port.ts';
import type { SearchResponse, GetObservationsParams, ObservationRecord } from './types.ts';
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

interface GetObservationsOpts {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  timeoutMs: number;
}

export async function getObservations(
  params: GetObservationsParams,
  opts: GetObservationsOpts
): Promise<ObservationRecord[]> {
  const host = resolveHost(opts.env);
  const port = resolvePort(opts.env);
  const url = `http://${host}:${port}/api/observations/batch`;

  const body: Record<string, unknown> = { ids: params.ids };
  if (params.orderBy !== undefined) body.orderBy = params.orderBy;
  if (typeof params.limit === 'number' && params.limit > 0) body.limit = params.limit;
  if (typeof params.project === 'string' && params.project.length > 0) body.project = params.project;

  opts.logger.debug(`getObservations POST ${url} ids=${params.ids.length}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs)
    });
  } catch (err: unknown) {
    const cause = (err as any)?.cause;
    if (cause?.code === 'ECONNREFUSED') {
      throw new Error('claude-mem worker not reachable. Try `npx claude-mem start`.');
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`get_observations HTTP ${res.status}`);
  }
  return res.json() as Promise<ObservationRecord[]>;
}
