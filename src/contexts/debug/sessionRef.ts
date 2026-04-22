export const TRACE_SESSION_PREFIX = 'trace-';

export function isTraceSessionId(id: string): boolean {
  return id.startsWith(TRACE_SESSION_PREFIX);
}

export type DebugSessionRef =
  | { kind: 'trace'; id: string }
  | { kind: 'live'; id: string };

export function parseDebugSessionId(id: string): DebugSessionRef {
  return isTraceSessionId(id) ? { kind: 'trace', id } : { kind: 'live', id };
}
