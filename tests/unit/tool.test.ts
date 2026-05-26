// tests/unit/tool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSearch,
  extractMarkdown,
  MemSearchParams,
  handleGetObservations,
  MemGetObservationsParams,
  handleTimeline,
  MemTimelineParams
} from '../../src/tool.ts';
import { createLogger } from '../../src/logger.ts';

vi.mock('../../src/search.ts', () => ({
  search: vi.fn(),
  getObservations: vi.fn(),
  timeline: vi.fn()
}));
import { search, getObservations, timeline } from '../../src/search.ts';

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

describe('mem_get_observations tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schema requires ids (number array), optional orderBy/limit/project', () => {
    const schema = MemGetObservationsParams as any;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('ids');
    expect(schema.required).not.toContain('orderBy');
    expect(schema.required).not.toContain('limit');
    expect(schema.required).not.toContain('project');
    expect(schema.properties.ids.type).toBe('array');
    expect(schema.properties.ids.items.type).toBe('number');
    expect(schema.properties.limit.type).toBe('number');
    expect(schema.properties.project.type).toBe('string');
  });

  it('returns error string when state.enabled=false', async () => {
    const r = await handleGetObservations(
      { ids: [1] },
      { state: { ...state, enabled: false }, env, logger: log, timeoutMs: 1000 }
    );
    expect(r).toMatch(/disabled/);
  });

  it('returns JSON.stringify(records, null, 2) on success', async () => {
    const records = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
    (getObservations as any).mockResolvedValue(records);
    const r = await handleGetObservations({ ids: [1, 2] }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe(JSON.stringify(records, null, 2));
  });

  it('returns "[]" stringified when claude-mem returns empty array', async () => {
    (getObservations as any).mockResolvedValue([]);
    const r = await handleGetObservations({ ids: [9999] }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe('[]');
  });

  it('returns error string when getObservations throws', async () => {
    (getObservations as any).mockRejectedValue(new Error('worker not reachable'));
    const r = await handleGetObservations({ ids: [1] }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/Error: .*worker not reachable/);
  });

  it('forwards orderBy/limit/project to getObservations', async () => {
    (getObservations as any).mockResolvedValue([]);
    await handleGetObservations(
      { ids: [1, 2], orderBy: 'date_desc', limit: 5, project: 'foo' },
      { state, env, logger: log, timeoutMs: 1000 }
    );
    const callArgs = (getObservations as any).mock.calls[0]!;
    expect(callArgs[0]).toEqual({ ids: [1, 2], orderBy: 'date_desc', limit: 5, project: 'foo' });
  });
});

describe('mem_timeline tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schema declares anchor (string|number) OR query, optional depth_before/depth_after/project', () => {
    const schema = MemTimelineParams as any;
    expect(schema.type).toBe('object');
    expect(schema.required ?? []).toEqual([]);
    expect(schema.properties.anchor.anyOf || schema.properties.anchor.oneOf).toBeDefined();
    expect(schema.properties.query.type).toBe('string');
    expect(schema.properties.depth_before.type).toBe('number');
    expect(schema.properties.depth_after.type).toBe('number');
    expect(schema.properties.project.type).toBe('string');
  });

  it('returns error string when state.enabled=false', async () => {
    const r = await handleTimeline(
      { anchor: 1 },
      { state: { ...state, enabled: false }, env, logger: log, timeoutMs: 1000 }
    );
    expect(r).toMatch(/disabled/);
  });

  it('passes through claude-mem markdown on success', async () => {
    const md = '### Timeline\n| ID | Title |\n|----|-------|\n| #1 | A |';
    (timeline as any).mockResolvedValue({ content: [{ type: 'text', text: md }] });
    const r = await handleTimeline({ anchor: 1 }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe(md);
  });

  it('passes through error markdown from claude-mem (XOR violation, anchor not found)', async () => {
    const errMd = 'Error: Cannot provide both "anchor" and "query" parameters. Use one or the other.';
    (timeline as any).mockResolvedValue({ content: [{ type: 'text', text: errMd }], isError: true });
    const r = await handleTimeline({ anchor: 1, query: 'x' }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toBe(errMd);
  });

  it('returns error string when timeline throws', async () => {
    (timeline as any).mockRejectedValue(new Error('worker not reachable'));
    const r = await handleTimeline({ anchor: 1 }, { state, env, logger: log, timeoutMs: 1000 });
    expect(r).toMatch(/Error: .*worker not reachable/);
  });

  it('forwards all params to timeline()', async () => {
    (timeline as any).mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await handleTimeline(
      { anchor: 42, depth_before: 5, depth_after: 3, project: 'pi-mem' },
      { state, env, logger: log, timeoutMs: 1000 }
    );
    const callArgs = (timeline as any).mock.calls[0]!;
    expect(callArgs[0]).toEqual({ anchor: 42, depth_before: 5, depth_after: 3, project: 'pi-mem' });
  });
});
