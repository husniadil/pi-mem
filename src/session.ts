import type { SessionState } from './types.ts';

export function createSessionState(init: Pick<SessionState, 'sessionId' | 'rootPath'>): SessionState {
  return {
    enabled: true,
    sessionId: init.sessionId,
    rootPath: init.rootPath,
    ctxMarkdown: ''
  };
}

export function deriveSessionId(event: unknown): string {
  if (event && typeof event === 'object') {
    const e = event as Record<string, unknown>;
    if (typeof e.id === 'string' && e.id.length > 0) return e.id;
    if (typeof e.sessionId === 'string' && e.sessionId.length > 0) return e.sessionId;
  }
  return 'unknown';
}
