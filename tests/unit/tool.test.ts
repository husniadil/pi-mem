// tests/unit/tool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSearch, extractMarkdown, MemSearchParams } from '../../src/tool.ts';
import { createLogger } from '../../src/logger.ts';

vi.mock('../../src/search.ts', () => ({ search: vi.fn() }));
import { search } from '../../src/search.ts';

const log = createLogger('silent');
const env = { HOME: '/home/u' };
const state = { enabled: true, sessionId: 's', rootPath: '/r', ctxMarkdown: '' };

describe('mem_search tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schema declares query string (required) + limit number (optional)', () => {
    const schema = MemSearchParams as any;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('query');
    expect(schema.required).not.toContain('limit');
    expect(schema.properties.query.type).toBe('string');
    expect(schema.properties.limit.type).toBe('number');
  });

  it('returns error string when state.enabled=false', async () => {
    const r = await handleSearch({ query: 'x' }, { state: { ...state, enabled: false }, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/disabled/);
  });

  it('passes through claude-mem pre-formatted markdown on success', async () => {
    const markdown = 'Found 3 result(s) matching "auth"\n\n### May 20\n\n**file.ts**\n| ID | Title |\n|----|-------|\n| #1 | A thing |';
    (search as any).mockResolvedValue({ content: [{ type: 'text', text: markdown }] });
    const r = await handleSearch({ query: 'auth' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe(markdown);
  });

  it('passes through "Found 0" message from claude-mem when no matches', async () => {
    const empty = 'Found 0 result(s) matching "xyz" (0 obs, 0 sessions, 0 prompts)';
    (search as any).mockResolvedValue({ content: [{ type: 'text', text: empty }] });
    const r = await handleSearch({ query: 'xyz' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe(empty);
  });

  it('returns error string when search throws', async () => {
    (search as any).mockRejectedValue(new Error('worker not reachable'));
    const r = await handleSearch({ query: 'q' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/Error: .*worker not reachable/);
  });

  it('forwards limit to search()', async () => {
    (search as any).mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await handleSearch({ query: 'q', limit: 5 }, { state, env, logger: log, timeoutMs: 1000 });
    const callArgs = (search as any).mock.calls[0]!;
    expect(callArgs[1]).toMatchObject({ limit: 5 });
  });

  it('extractMarkdown returns error message on missing/empty content', () => {
    expect(extractMarkdown({})).toMatch(/empty or malformed/);
    expect(extractMarkdown({ content: [] })).toMatch(/empty or malformed/);
    expect(extractMarkdown({ content: [{ type: 'text', text: '' }] })).toMatch(/empty or malformed/);
    expect(extractMarkdown({ content: [{ type: 'image', text: 'irrelevant' } as any] })).toMatch(/empty or malformed/);
  });

  it('extractMarkdown picks the first text-type block (ignores non-text)', () => {
    const res = { content: [
      { type: 'image', text: 'skip' } as any,
      { type: 'text', text: 'the answer' }
    ]};
    expect(extractMarkdown(res)).toBe('the answer');
  });
});
