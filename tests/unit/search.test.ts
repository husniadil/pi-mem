// tests/unit/search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { search, getObservations } from '../../src/search.ts';
import { createLogger } from '../../src/logger.ts';

const log = createLogger('silent');
const env = { HOME: '/home/u', CLAUDE_MEM_WORKER_PORT: '37777', CLAUDE_MEM_WORKER_HOST: '127.0.0.1' };

describe('search', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('GET /api/search?query=… with correct URL (no limit)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) });
    await search('auth middleware', { env, logger: log, timeoutMs: 1000 });
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toBe('http://127.0.0.1:37777/api/search?query=auth+middleware');
  });

  it('forwards limit as query param when provided', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) });
    await search('x', { env, logger: log, timeoutMs: 1000, limit: 5 });
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toBe('http://127.0.0.1:37777/api/search?query=x&limit=5');
  });

  it('omits limit param when 0 or negative or undefined', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) });
    await search('x', { env, logger: log, timeoutMs: 1000, limit: 0 });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:37777/api/search?query=x');
    await search('x', { env, logger: log, timeoutMs: 1000, limit: -1 });
    expect(fetchMock.mock.calls[1]![0]).toBe('http://127.0.0.1:37777/api/search?query=x');
  });

  it('returns parsed JSON (MCP content shape) on success', async () => {
    const body = { content: [{ type: 'text', text: 'Found 3 results' }] };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });
    const r = await search('q', { env, logger: log, timeoutMs: 1000 });
    expect(r).toEqual(body);
  });

  it('throws on ECONNREFUSED with helpful message', async () => {
    const err = new TypeError('fetch failed') as any;
    err.cause = { code: 'ECONNREFUSED' };
    fetchMock.mockRejectedValue(err);
    await expect(search('q', { env, logger: log, timeoutMs: 1000 }))
      .rejects.toThrow(/worker not reachable/i);
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(search('q', { env, logger: log, timeoutMs: 1000 }))
      .rejects.toThrow(/HTTP 500/);
  });

  it('throws on timeout (AbortSignal.timeout)', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'TimeoutError'));
    await expect(search('q', { env, logger: log, timeoutMs: 10 }))
      .rejects.toThrow(/aborted|timeout/i);
  });
});

describe('getObservations', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POST /api/observations/batch with ids in JSON body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await getObservations({ ids: [1, 2, 3] }, { env, logger: log, timeoutMs: 1000 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:37777/api/observations/batch');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ ids: [1, 2, 3] });
  });

  it('forwards optional orderBy, limit, project in body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await getObservations(
      { ids: [1], orderBy: 'date_desc', limit: 5, project: 'foo' },
      { env, logger: log, timeoutMs: 1000 }
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ ids: [1], orderBy: 'date_desc', limit: 5, project: 'foo' });
  });

  it('omits optional params when undefined or non-positive', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await getObservations({ ids: [1] }, { env, logger: log, timeoutMs: 1000 });
    const body1 = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body1).toEqual({ ids: [1] });

    await getObservations({ ids: [1], limit: 0, project: '' }, { env, logger: log, timeoutMs: 1000 });
    const body2 = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body2).toEqual({ ids: [1] });
  });

  it('returns parsed bare array on success', async () => {
    const records = [{ id: 1, text: 'hello' }, { id: 2, text: 'world' }];
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => records });
    const r = await getObservations({ ids: [1, 2] }, { env, logger: log, timeoutMs: 1000 });
    expect(r).toEqual(records);
  });

  it('returns empty array when claude-mem returns [] (non-existent IDs dropped)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const r = await getObservations({ ids: [99999] }, { env, logger: log, timeoutMs: 1000 });
    expect(r).toEqual([]);
  });

  it('still POSTs and returns [] when ids is empty (no client-side short-circuit)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const r = await getObservations({ ids: [] }, { env, logger: log, timeoutMs: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ ids: [] });
    expect(r).toEqual([]);
  });

  it('throws on ECONNREFUSED with helpful message', async () => {
    const err = new TypeError('fetch failed') as any;
    err.cause = { code: 'ECONNREFUSED' };
    fetchMock.mockRejectedValue(err);
    await expect(getObservations({ ids: [1] }, { env, logger: log, timeoutMs: 1000 }))
      .rejects.toThrow(/worker not reachable/i);
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(getObservations({ ids: [1] }, { env, logger: log, timeoutMs: 1000 }))
      .rejects.toThrow(/HTTP 400/);
  });
});
