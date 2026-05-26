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

/**
 * Bare record returned by claude-mem's POST /api/observations/batch.
 * 23 fields confirmed via probe on 2026-05-26. Many fields are nullable
 * depending on observation kind (e.g., session records have no narrative).
 */
export interface ObservationRecord {
  id: number;
  memory_session_id: string;
  project: string;
  text: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  facts: string | null;
  narrative: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  discovery_tokens: number | null;
  created_at: string;
  created_at_epoch: number;
  content_hash: string;
  generated_by_model: string | null;
  relevance_count: number;
  merged_into_project: string | null;
  agent_type: string | null;
  agent_id: string | null;
  metadata: string | null;
}

export interface GetObservationsParams {
  ids: number[];
  orderBy?: 'date_desc' | 'date_asc';
  limit?: number;
  project?: string;
}

export type PiHookEvent = 'session_start' | 'before_agent_start' | 'message_end' | 'tool_result' | 'agent_end';
