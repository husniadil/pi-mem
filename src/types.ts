export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export interface Config {
  enabled: boolean;
  capture: boolean;
  spawnTimeoutMs: number;
  logLevel: LogLevel;
}

export interface ResolvedPaths {
  workerScript: string;
  bunRunner: string;
  pluginDir: string;
}

export interface SessionState {
  enabled: boolean;
  sessionId: string;
  rootPath: string;
  ctxMarkdown: string;
}

export interface HookResponse {
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
  };
  systemMessage?: string;
}

export interface SearchResult {
  id?: string;
  title?: string;
  narrative?: string;
  filesModified?: string[];
  createdAt?: string;
  [k: string]: unknown;
}

export interface SearchResponse {
  results?: SearchResult[];
  [k: string]: unknown;
}

export type PiHookEvent = 'session_start' | 'before_agent_start' | 'message_end' | 'tool_result' | 'agent_end';
