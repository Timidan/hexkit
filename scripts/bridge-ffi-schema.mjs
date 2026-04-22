// =============================================================================
// FFI shape pin — Zod schema for Rust simulator stdout JSON
// =============================================================================
// The simulator binary (edb-simulator) writes a JSON object to stdout. Fields
// are optional because different invocation paths (simulate / keep-alive /
// lite-trace) emit different subsets. The schema is intentionally lenient —
// `.passthrough()` on every object lets unknown fields flow through; strict
// validation would risk rejecting real output when the Rust side evolves.
//
// Consumers should use the adapter in `bridge-ffi-adapter.mjs`, not call
// Zod directly — that's where camelCase/snake_case coalescing and typed
// accessors live.
// =============================================================================

import { z } from "zod";

const LooseObject = z.object({}).passthrough();

const NumericLike = z.union([z.number(), z.string()]);

export const DebugSessionFfiSchema = z
  .object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    rpcUrl: z.string().optional(),
    rpc_url: z.string().optional(),
    rpcPort: NumericLike.optional(),
    rpc_port: NumericLike.optional(),
    snapshotCount: NumericLike.optional(),
    snapshot_count: NumericLike.optional(),
  })
  .passthrough();

export const RenderedTraceFfiSchema = z
  .object({
    rows: z.array(LooseObject).optional(),
    sourceTexts: z.record(z.unknown()).optional(),
    schemaVersion: NumericLike.optional(),
  })
  .passthrough();

export const RawTraceFfiSchema = z
  .object({
    inner: LooseObject.optional(),
    artifacts: z.record(LooseObject).optional(),
    snapshots: z.array(z.unknown()).optional(),
    sources: z.record(z.unknown()).optional(),
    opcodeTrace: z.array(LooseObject).optional(),
    opcodeLines: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const SimulatorFfiResultSchema = z
  .object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    errorMessage: z.string().optional(),
    renderedTrace: RenderedTraceFfiSchema.optional(),
    rawTrace: RawTraceFfiSchema.optional(),
    traceSchemaVersion: NumericLike.optional(),
    traceLite: LooseObject.optional(),
    traceMeta: LooseObject.optional(),
    traceQuality: LooseObject.optional(),
    debugSession: DebugSessionFfiSchema.optional(),
    debug_session: DebugSessionFfiSchema.optional(),
  })
  .passthrough();

/**
 * Validate raw JSON against the FFI result schema.
 * @param {unknown} raw
 * @returns {{ ok: true, data: any } | { ok: false, issues: unknown[] }}
 */
export function validateFfiResult(raw) {
  const parsed = SimulatorFfiResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues };
  }
  return { ok: true, data: parsed.data };
}
