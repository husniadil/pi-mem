// tests/unit/capture.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureUserMessage, captureToolResult, captureAgentEnd, extractTextContent } from '../../src/capture.ts';
import { createSessionState } from '../../src/session.ts';
import { createLogger } from '../../src/logger.ts';

const log = createLogger('silent');
const paths = { workerScript: '/p/w.cjs', bunRunner: '/p/b.js', pluginDir: '/p' };

vi.mock('../../src/worker.ts', () => ({
  runStart: vi.fn(),
  runHook: vi.fn(),
  runHookFireAndForget: vi.fn()
}));

import { runHookFireAndForget } from '../../src/worker.ts';

const captureCtx = (overrides: { enabled?: boolean; capture?: boolean } = {}) => ({
  state: { ...createSessionState({ sessionId: 's', rootPath: '/r' }), enabled: overrides.enabled ?? true },
  config: { enabled: true, capture: overrides.capture ?? true, spawnTimeoutMs: 1000, logLevel: 'silent' as const },
  paths,
  logger: log
});

describe('capture', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captureUserMessage ignores assistant messages', () => {
    captureUserMessage({ message: { role: 'assistant', content: 'hi' } }, captureCtx());
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  it('captureUserMessage sends session-init hook with prompt for user role', () => {
    captureUserMessage({ message: { role: 'user', content: 'do X' } }, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'session-init',
      expect.objectContaining({ sessionId: 's', cwd: '/r', prompt: 'do X' }),
      expect.anything()
    );
  });

  it('captureToolResult sends observation hook with tool fields', () => {
    captureToolResult({ tool: { name: 'Read' }, input: { path: '/x' }, output: 'content' }, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'observation',
      expect.objectContaining({ sessionId: 's', cwd: '/r', toolName: 'Read' }),
      expect.anything()
    );
  });

  it('captureAgentEnd sends summarize hook', () => {
    captureAgentEnd({}, captureCtx());
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'summarize',
      expect.objectContaining({ sessionId: 's', cwd: '/r' }),
      expect.anything()
    );
  });

  it('all capture functions no-op when state.enabled=false', () => {
    const ctx = captureCtx({ enabled: false });
    captureUserMessage({ message: { role: 'user', content: 'x' } }, ctx);
    captureToolResult({ tool: { name: 'Read' } }, ctx);
    captureAgentEnd({}, ctx);
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  it('all capture functions no-op when config.capture=false', () => {
    const ctx = captureCtx({ capture: false });
    captureUserMessage({ message: { role: 'user', content: 'x' } }, ctx);
    captureToolResult({ tool: { name: 'Read' } }, ctx);
    captureAgentEnd({}, ctx);
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  // --- content-block extraction (pi 0.74+ message shape) ---

  it('captureUserMessage extracts text from content-block array', () => {
    captureUserMessage(
      {
        message: { role: 'user', content: [{ type: 'text', text: 'hari ini saya ngapain aja?' }] }
      },
      captureCtx()
    );
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'session-init',
      expect.objectContaining({ prompt: 'hari ini saya ngapain aja?' }),
      expect.anything()
    );
  });

  it('captureUserMessage joins multiple text blocks with newline', () => {
    captureUserMessage(
      {
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'line 1' },
            { type: 'text', text: 'line 2' }
          ]
        }
      },
      captureCtx()
    );
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'session-init',
      expect.objectContaining({ prompt: 'line 1\nline 2' }),
      expect.anything()
    );
  });

  it('captureUserMessage drops non-text blocks (image, resource)', () => {
    captureUserMessage(
      {
        message: {
          role: 'user',
          content: [{ type: 'image', source: '...' } as any, { type: 'text', text: 'actual prompt' }]
        }
      },
      captureCtx()
    );
    expect(runHookFireAndForget).toHaveBeenCalledWith(
      paths,
      'pi',
      'session-init',
      expect.objectContaining({ prompt: 'actual prompt' }),
      expect.anything()
    );
  });

  it('captureUserMessage no-ops when content has no text (e.g., image-only)', () => {
    captureUserMessage(
      {
        message: { role: 'user', content: [{ type: 'image', source: '...' } as any] }
      },
      captureCtx()
    );
    expect(runHookFireAndForget).not.toHaveBeenCalled();
  });

  it('captureToolResult normalizes content-block array output to plain text', () => {
    captureToolResult(
      {
        tool: { name: 'mem_search' },
        input: { query: 'WBR' },
        output: [{ type: 'text', text: 'Found 3 results' }]
      },
      captureCtx()
    );
    const payload = (runHookFireAndForget as any).mock.calls[0][3];
    expect(payload.toolResponse).toBe('Found 3 results');
  });

  it('captureToolResult passes through string output unchanged', () => {
    captureToolResult(
      {
        tool: { name: 'Read' },
        input: { path: '/x' },
        output: 'raw content'
      },
      captureCtx()
    );
    const payload = (runHookFireAndForget as any).mock.calls[0][3];
    expect(payload.toolResponse).toBe('raw content');
  });

  it('extractTextContent: empty/missing/non-array → empty string', () => {
    expect(extractTextContent(undefined)).toBe('');
    expect(extractTextContent(null)).toBe('');
    expect(extractTextContent({})).toBe('');
    expect(extractTextContent(123)).toBe('');
  });

  it('extractTextContent: string passes through', () => {
    expect(extractTextContent('plain string')).toBe('plain string');
  });
});
