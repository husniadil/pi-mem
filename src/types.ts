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

/**
 * MCP-style content block returned by claude-mem's /api/search.
 * Markdown is pre-formatted by claude-mem — pi-mem passes it through to the LLM as-is.
 */
export interface SearchContentBlock {
  type: string;
  text: string;
}

export interface SearchResponse {
  content?: SearchContentBlock[];
  [k: string]: unknown;
}

export type PiHookEvent = 'session_start' | 'before_agent_start' | 'message_end' | 'tool_result' | 'agent_end';
