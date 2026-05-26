// tests/unit/tool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSearch, formatResults, MEM_SEARCH_SCHEMA } from '../../src/tool.ts';
import { createLogger } from '../../src/logger.ts';

vi.mock('../../src/search.ts', () => ({ search: vi.fn() }));
import { search } from '../../src/search.ts';

const log = createLogger('silent');
const env = { HOME: '/home/u' };
const state = { enabled: true, sessionId: 's', rootPath: '/r', ctxMarkdown: '' };

describe('mem_search tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schema declares query string, optional limit', () => {
    expect(MEM_SEARCH_SCHEMA.required).toContain('query');
    expect(MEM_SEARCH_SCHEMA.properties.query.type).toBe('string');
    expect(MEM_SEARCH_SCHEMA.properties.limit.type).toBe('number');
  });

  it('returns error string when state.enabled=false', async () => {
    const r = await handleSearch({ query: 'x' }, { state: { ...state, enabled: false }, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/disabled/);
  });

  it('returns formatted markdown on success', async () => {
    (search as any).mockResolvedValue({
      results: [{ title: 'A thing', narrative: 'desc', filesModified: ['a.ts'], createdAt: '2026-05-20T10:00:00Z' }]
    });
    const r = await handleSearch({ query: 'auth' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/# Memory search: "auth"/);
    expect(r).toMatch(/A thing/);
    expect(r).toMatch(/a\.ts/);
  });

  it('returns "no matches" when empty', async () => {
    (search as any).mockResolvedValue({ results: [] });
    const r = await handleSearch({ query: 'xyz' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/No matches/);
  });

  it('returns error string when search throws', async () => {
    (search as any).mockRejectedValue(new Error('worker not reachable'));
    const r = await handleSearch({ query: 'q' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/Error: .*worker not reachable/);
  });

  it('formatResults omits Files line when filesModified empty/missing', () => {
    const md = formatResults('q', [{ title: 'T', narrative: 'N' }]);
    expect(md).not.toMatch(/Files:/);
  });
});
