/**
 * Main decodeTrace function - orchestrates all trace decoding phases.
 *
 * This file is the entry point for trace decoding. It delegates to phase modules:
 * - Phase 1 (decodeTraceInit): Source extraction, PC map building, opcode row creation
 * - Phase 2 (decodeTraceAnalysis): Jump detection, call frames, hierarchy analysis
 * - Phase 3 (decodeTraceFinalize): Gas calculation, events, filtering, final assembly
 */

import type { RawTrace, DecodedTraceRow, CallMeta, RawEventLog, DecodeTraceContext } from './types';
import { phaseInit } from './decodeTraceInit';
import { phaseAnalysis } from './decodeTraceAnalysis';
import { phaseFinalize } from './decodeTraceFinalize';

export function decodeTrace(raw: RawTrace): {
  rows: DecodedTraceRow[];
  sourceLines: string[];
  sourceTexts: Record<string, string>;
  callMeta?: CallMeta;
  rawEvents?: RawEventLog[];
  implementationToProxy?: Map<string, string>;
} {
  // Phase 1: Initialize context - extract sources, build PC maps, create opcode rows
  const ctx = phaseInit(raw);

  // Phase 2: Analyze - jump detection, call frame processing, hierarchy analysis
  phaseAnalysis(ctx);

  // Phase 3: Finalize - gas calculation, events, filtering, assembly
  return phaseFinalize(ctx);
}
