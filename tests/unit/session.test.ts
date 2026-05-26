// tests/unit/session.test.ts
import { describe, it, expect } from 'vitest';
import { createSessionState, deriveSessionId } from '../../src/session.ts';

describe('session state', () => {
  it('initializes with enabled=true, empty ctxMarkdown', () => {
    const s = createSessionState({ sessionId: 'pi-abc', rootPath: '/repo' });
    expect(s.enabled).toBe(true);
    expect(s.sessionId).toBe('pi-abc');
    expect(s.rootPath).toBe('/repo');
    expect(s.ctxMarkdown).toBe('');
  });

  it('deriveSessionId from pi session id (passthrough if string-y)', () => {
    expect(deriveSessionId({ id: 'abc-123' })).toBe('abc-123');
    expect(deriveSessionId({ sessionId: 'xyz' })).toBe('xyz');
  });

  it('deriveSessionId falls back to unknown when nothing usable', () => {
    expect(deriveSessionId({})).toBe('unknown');
    expect(deriveSessionId(null)).toBe('unknown');
    expect(deriveSessionId(undefined)).toBe('unknown');
  });
});
