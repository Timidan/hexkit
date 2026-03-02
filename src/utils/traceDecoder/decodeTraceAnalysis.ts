/**
 * Phase 2: Trace analysis - multi-contract maps, call frame processing,
 * jump detection, internal call hierarchy.
 *
 * This is the orchestrator that delegates to:
 *   - analysisHelpers.ts  (multi-contract maps, call frames, PC closures)
 *   - jumpAnalysis.ts     (jump row building, reachability, dedup, return values)
 *   - callHierarchy.ts    (row assembly, LOG decoding, internal call hierarchy, frame anchoring)
 */

import type { DecodeTraceContext } from './types';
import { buildMultiContractMaps, assignContractNamesToOpRows,
         buildCallFrameRows, buildAnalysisLocals } from './analysisHelpers';
import { buildJumpRows } from './jumpAnalysis';
import { assembleRowsWithJumps, buildCallHierarchy } from './callHierarchy';

export function phaseAnalysis(ctx: DecodeTraceContext): void {
  // Phase 2a: Build per-contract maps from raw artifacts
  buildMultiContractMaps(ctx);

  // Assign contract names and function names to opcode rows based on frame_id
  assignContractNamesToOpRows(ctx);

  // Build external call frame rows from raw call entries
  const callFrameRows = buildCallFrameRows(ctx);
  ctx.callFrameRows = callFrameRows;

  // Build all PC-resolution closures and shared helpers
  const locals = buildAnalysisLocals(ctx, callFrameRows);

  // Phase 2b: Jump detection, reachability, dedup, return value decoding
  const allJumpRows = buildJumpRows(ctx, locals);

  // Assemble final row list (call frames + jumps + important opcodes) and decode LOGs
  const rowsWithJumps = assembleRowsWithJumps(ctx, locals, allJumpRows);
  ctx.rowsWithJumps = rowsWithJumps;

  // Phase 2c: Build internal call hierarchy and anchor call frames to source
  buildCallHierarchy(ctx, locals, rowsWithJumps);
}
