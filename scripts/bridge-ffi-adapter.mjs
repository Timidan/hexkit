// =============================================================================
// FFI shape pin — Adapter between the Rust simulator stdout and the bridge
// =============================================================================
// Single entry point for turning simulator output into a normalized shape:
//   - parseSimulatorOutput(stdoutString) parses + validates + normalizes
//   - extractDebugSession(result) consolidates camelCase/snake_case coalescing
//
// Before this adapter, call sites did ad-hoc `result && typeof result ===
// "object"` guards and manually coalesced `debugSession`/`debug_session`,
// `rpcPort`/`rpc_port`. That pattern is replaced by these helpers.
// =============================================================================

import { extractJsonFromOutputInternal } from "./simulation-runner.mjs";
import { validateFfiResult } from "./bridge-ffi-schema.mjs";

/**
 * Parse the simulator's stdout (raw string or already-parsed JSON) and run it
 * through the FFI schema. Validation issues are logged as warnings but do NOT
 * reject — the schema is `.passthrough()` everywhere so real output should
 * always pass; this is defense against unexpected shape drift.
 *
 * @param {string | object} raw - stdout string or pre-parsed object
 * @param {{ label?: string, silentFailures?: boolean }} [options]
 * @returns {Record<string, any>}
 */
export function parseSimulatorOutput(raw, options = {}) {
  const label = options.label ?? "simulator";
  let obj;
  if (typeof raw === "string") {
    const jsonStr = extractJsonFromOutputInternal(raw, {
      silentFailures: options.silentFailures === true,
    });
    try {
      obj = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error(
        `[${label}] failed to parse JSON from stdout: ${err?.message ?? String(err)}`,
      );
    }
  } else if (raw && typeof raw === "object") {
    obj = raw;
  } else {
    throw new Error(`[${label}] unsupported response type: ${typeof raw}`);
  }

  const result = validateFfiResult(obj);
  if (!result.ok) {
    console.warn(
      `[${label}] FFI result schema mismatch (proceeding with raw output):`,
      JSON.stringify(result.issues).slice(0, 400),
    );
    return obj;
  }
  return result.data;
}

/**
 * Normalize a debug-session payload from the simulator output. Returns null
 * when the session isn't fully specified.
 *
 * @param {Record<string, any> | null | undefined} result
 * @returns {{ sessionId: string | null, rpcUrl: string, rpcPort: number, snapshotCount: number } | null}
 */
export function extractDebugSession(result) {
  if (!result || typeof result !== "object") return null;

  const session =
    (result.debugSession && typeof result.debugSession === "object" && result.debugSession) ||
    (result.debug_session && typeof result.debug_session === "object" && result.debug_session) ||
    null;
  if (!session) return null;

  const rpcUrl =
    typeof session.rpcUrl === "string"
      ? session.rpcUrl
      : typeof session.rpc_url === "string"
        ? session.rpc_url
        : "";
  const rpcPortRaw = session.rpcPort ?? session.rpc_port;
  const snapshotCountRaw = session.snapshotCount ?? session.snapshot_count ?? 0;
  const sessionId =
    typeof session.sessionId === "string"
      ? session.sessionId
      : typeof session.session_id === "string"
        ? session.session_id
        : null;

  const rpcPort = Number(rpcPortRaw);
  const snapshotCount = Number(snapshotCountRaw);

  if (!Number.isInteger(rpcPort) || rpcPort <= 0) return null;
  if (!rpcUrl) return null;

  return {
    sessionId,
    rpcUrl,
    rpcPort,
    snapshotCount: Number.isFinite(snapshotCount) ? snapshotCount : 0,
  };
}

/**
 * Return the renderedTrace subtree if present and well-formed, otherwise null.
 * @param {Record<string, any> | null | undefined} result
 */
export function getRenderedTrace(result) {
  if (!result || typeof result !== "object") return null;
  const rt = result.renderedTrace ?? result.rendered_trace;
  if (!rt || typeof rt !== "object") return null;
  if (!Array.isArray(rt.rows) || rt.rows.length === 0) return null;
  return rt;
}

/**
 * Return the rawTrace subtree if present, otherwise null.
 * @param {Record<string, any> | null | undefined} result
 */
export function getRawTrace(result) {
  if (!result || typeof result !== "object") return null;
  const rawTrace = result.rawTrace ?? result.raw_trace;
  if (!rawTrace || typeof rawTrace !== "object") return null;
  return rawTrace;
}
