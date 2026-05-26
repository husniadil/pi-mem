import type { LogLevel } from './types.ts';

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

function redact(msg: string): string {
  return msg.replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]');
}

export interface Logger {
  error(msg: string): void;
  warn(msg: string): void;
  info(msg: string): void;
  debug(msg: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level];
  const emit = (lvl: LogLevel, msg: string) => {
    if (LEVELS[lvl] > threshold) return;
    console.error(`[pi-mem] ${lvl}: ${redact(msg)}`);
  };
  return {
    error: (m) => emit('error', m),
    warn: (m) => emit('warn', m),
    info: (m) => emit('info', m),
    debug: (m) => emit('debug', m)
  };
}
