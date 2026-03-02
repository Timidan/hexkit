/**
 * Phase 2b: Jump detection, reachability filtering, source-line rescue,
 * deduplication, and return value decoding.
 *
 * Extracted from decodeTraceAnalysis.ts to keep files under 800 lines.
 */

import type { DecodedTraceRow, DecodeTraceContext, FunctionRange } from './types';
import { formatDisplayVal } from './formatting';
import { fnForLine, validateSourceLineContainsFunctionCall, findCorrectCallLine } from './sourceParser';
import { decodeArgsFromStack } from './stackDecoding';
import type { AnalysisLocals } from './analysisHelpers';

// ── Jump row building ──────────────────────────────────────────────────

/**
 * Build the initial set of jump rows from all JUMP/JUMPI opcodes,
 * apply reachability filtering, source-line rescue, dedup, and
 * return-value decoding.
 *
 * Returns the final deduplicated, enriched jump rows.
 */
export function buildJumpRows(
  ctx: DecodeTraceContext,
  locals: AnalysisLocals
): DecodedTraceRow[] {
  const { opRows, fnRanges, fnSignatures, fnRangesPerFile, fnSignaturesPerFile,
          iface, sourceTexts, traceIdToCodeAddr } = ctx;
  const { callFrameRows, pcInfoForPc, fnForPc, modifierForPc, fnForPcIfAtEntry,
          jumpTypeForPc, getSourceContent, findSingleCalledFunctionOnLine,
          traceIdFromFrame, opRowIndexByIdForJump, nextRowInFrame,
          jumpDestPcFromRow, getFnVisibility } = locals;

  const getTraceIdFromFrame = (frameId: any): number | null => {
    if (!Array.isArray(frameId) || frameId.length < 1) return null;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    return isNaN(traceId) ? null : traceId;
  };

  // ── Build raw jump rows ──────────────────────────────────────────────

  const jumpRows = locals.allJumps
    .map((r) => {
      const st = Array.isArray(r.stack) ? r.stack : [];
      const destPc = jumpDestPcFromRow(r);
      const callerFn = fnForPc(r.pc, r.frame_id) || r.fn;
      const callerContext = callerFn || modifierForPc(r.pc, r.frame_id);

      let destFn: string | null = null;
      if (destPc !== null) {
        const destPcInfo = pcInfoForPc(destPc, r.frame_id);
        const destFile = destPcInfo?.file || '';

        const isExternalLibrary =
          destFile.includes('@openzeppelin/') ||
          destFile.includes('openzeppelin-contracts/') ||
          destFile.includes('solmate/') ||
          destFile.includes('solady/') ||
          destFile.includes('forge-std/') ||
          destFile.includes('node_modules/');

        const tempDestFn = fnForPc(destPc, r.frame_id);
        const srcJt = jumpTypeForPc(r.pc, r.frame_id);

        if (!isExternalLibrary) {
          destFn = tempDestFn;
        } else if (srcJt === 'i' && tempDestFn) {
          destFn = tempDestFn;
        } else {
          destFn = null;
        }
      }
      const srcJumpType = jumpTypeForPc(r.pc, r.frame_id);

      const srcPcInfo = pcInfoForPc(r.pc, r.frame_id);
      const srcFile = srcPcInfo?.file;
      const srcLine = srcPcInfo?.line;

      const destFnAtEntry = destPc !== null ? fnForPcIfAtEntry(destPc, r.frame_id) : null;
      const destIsAtFunctionEntry = destFnAtEntry !== null;
      const validatedDestFn = destFnAtEntry ?? destFn;
      const destFileForVisibility = destPc !== null ? pcInfoForPc(destPc, r.frame_id)?.file : undefined;

      let correctedSrcLineInCaller: number | null = null;
      if (srcFile && callerFn && srcLine !== undefined) {
        const correctedSrcLine = findCorrectCallLine(sourceTexts, srcFile, srcLine, validatedDestFn);
        const fileRanges =
          fnRangesPerFile.get(srcFile) ||
          fnRangesPerFile.get(srcFile.split('/').pop() || '');
        if (correctedSrcLine !== null && fileRanges && fileRanges.length > 0) {
          const fnAtCorrectedLine = fnForLine(fileRanges, correctedSrcLine);
          if (fnAtCorrectedLine === callerFn) {
            correctedSrcLineInCaller = correctedSrcLine;
          }
        }
      }
      const srcLineForValidation = correctedSrcLineInCaller ?? srcLine;
      let resolvedDestFn = validatedDestFn;
      const hintedDestFn = findSingleCalledFunctionOnLine(srcFile, srcLineForValidation, r.frame_id);
      if (hintedDestFn && hintedDestFn !== callerFn) {
        const hintedDestMatchesSource = validateSourceLineContainsFunctionCall(
          sourceTexts, srcFile, srcLineForValidation, hintedDestFn
        );
        const resolvedDestMatchesSource = validateSourceLineContainsFunctionCall(
          sourceTexts, srcFile, srcLineForValidation, resolvedDestFn
        );
        if (
          hintedDestMatchesSource &&
          (!resolvedDestFn || resolvedDestFn === callerFn) &&
          !resolvedDestMatchesSource
        ) {
          resolvedDestFn = hintedDestFn;
        }
      }

      const hasSourceLocation = !!srcFile && srcLineForValidation !== undefined && srcLineForValidation !== null;
      const sourceContainsCall = hasSourceLocation
        ? validateSourceLineContainsFunctionCall(sourceTexts, srcFile, srcLineForValidation, resolvedDestFn)
        : false;

      let hasExecutionProof = false;
      if (destPc !== null && r.id !== undefined) {
        const currentIdx = opRowIndexByIdForJump.get(r.id);
        if (currentIdx !== undefined) {
          const nextIdx = nextRowInFrame[currentIdx];
          if (nextIdx >= 0) {
            hasExecutionProof = opRows[nextIdx].pc === destPc;
          }
        }
      }
      const hintedSupportsResolvedDest =
        !!hintedDestFn && !!resolvedDestFn && hintedDestFn === resolvedDestFn;
      const allowRuntimeOverride =
        !hasSourceLocation || !hintedDestFn || hintedSupportsResolvedDest;

      const hasCallEvidence =
        sourceContainsCall || (hasExecutionProof && allowRuntimeOverride);

      const destVisibility = getFnVisibility(resolvedDestFn, destFileForVisibility, r.frame_id);
      const isPublicLikeDest = destVisibility === 'public' || destVisibility === 'external';

      const isSelfJump = callerContext && resolvedDestFn && callerContext === resolvedDestFn;
      const isCrossFunctionJump = resolvedDestFn && callerContext && resolvedDestFn !== callerContext;
      const hasConcreteSourceText = !!getSourceContent(srcFile);

      const isJumpIntoStrict =
        srcJumpType === "i" &&
        !!callerContext &&
        !!resolvedDestFn &&
        !isSelfJump &&
        !!isCrossFunctionJump &&
        destIsAtFunctionEntry &&
        hasCallEvidence;

      const isJumpIntoWithoutCallerContext =
        srcJumpType === "i" &&
        !callerContext &&
        !!resolvedDestFn &&
        destIsAtFunctionEntry &&
        hasExecutionProof &&
        hasConcreteSourceText &&
        sourceContainsCall;

      const isJumpInto = isJumpIntoStrict || isJumpIntoWithoutCallerContext;

      const isFallbackFunctionCall =
        srcJumpType === '-' &&
        resolvedDestFn &&
        destIsAtFunctionEntry &&
        isCrossFunctionJump &&
        (sourceContainsCall || hintedSupportsResolvedDest) &&
        (hasSourceLocation || hasExecutionProof);

      if (isPublicLikeDest && !hasCallEvidence && srcJumpType !== 'i') return null;
      if (!isJumpInto && !isFallbackFunctionCall) return null;

      const exclude = r.name === "JUMPI" ? 2 : 1;
      const destPcInfo = pcInfoForPc(destPc!, r.frame_id);
      const destFile = destPcInfo?.file || null;

      const decodedArgs = resolvedDestFn ? decodeArgsFromStack(
        iface, resolvedDestFn, fnSignatures, fnSignaturesPerFile,
        st, exclude, r.memory, destFile
      ) : null;

      return {
        ...r,
        fn: callerFn || r.fn,
        jumpMarker: true,
        destPc,
        destFn: resolvedDestFn,
        destSourceFile: destFile,
        destLine: destPcInfo?.line ?? null,
        srcSourceFile: srcFile ?? null,
        srcLine: srcLineForValidation ?? null,
        line: correctedSrcLineInCaller ?? r.line,
        jumpArgs: [],
        jumpArgsDecoded: decodedArgs?.args || null,
        jumpArgsOrigin: decodedArgs?.origin || null,
        jumpArgsTruncated: decodedArgs?.truncated || false,
        entryJumpdest: true,
        isConfirmedCall: isJumpInto,
      };
    })
    .filter(Boolean) as DecodedTraceRow[];

  // ── Reachability infrastructure ──────────────────────────────────────

  const functionCallsByFn = new Map<string, Set<string>>();
  const knownFunctionNames = new Set<string>(Object.keys(fnSignatures));
  const excludedCallTokens = new Set([
    'if', 'for', 'while', 'require', 'assert', 'revert', 'return', 'emit',
    'new', 'function', 'assembly', 'unchecked'
  ]);
  const callTokenRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  const selectCanonicalRanges = (
    ranges: Array<{ name: string; start: number; end: number }>
  ): Array<{ name: string; start: number; end: number }> => {
    const byName = new Map<string, { name: string; start: number; end: number }>();
    for (const range of ranges) {
      const existing = byName.get(range.name);
      if (!existing || range.start > existing.start) {
        byName.set(range.name, range);
      }
    }
    return Array.from(byName.values());
  };

  Object.entries(sourceTexts).forEach(([filePath, source]) => {
    if (!source) return;
    const fileRanges =
      fnRangesPerFile.get(filePath) ||
      fnRangesPerFile.get(filePath.split('/').pop() || '');
    if (!fileRanges || fileRanges.length === 0) return;
    const ranges = selectCanonicalRanges(fileRanges);
    if (ranges.length === 0) return;
    const lines = source.split('\n');

    for (const range of ranges) {
      const calls = functionCallsByFn.get(range.name) || new Set<string>();
      const endLine = Math.min(range.end, lines.length);
      let inBlockComment = false;
      for (let ln = range.start; ln <= endLine; ln++) {
        const rawLineText = lines[ln - 1] || '';
        let lineText = rawLineText;

        if (inBlockComment) {
          const blockEnd = lineText.indexOf('*/');
          if (blockEnd < 0) continue;
          lineText = lineText.slice(blockEnd + 2);
          inBlockComment = false;
        }

        while (true) {
          const blockStart = lineText.indexOf('/*');
          if (blockStart < 0) break;
          const blockEnd = lineText.indexOf('*/', blockStart + 2);
          if (blockEnd < 0) {
            lineText = lineText.slice(0, blockStart);
            inBlockComment = true;
            break;
          }
          lineText = lineText.slice(0, blockStart) + lineText.slice(blockEnd + 2);
        }

        lineText = lineText.replace(/\/\/.*$/, '');
        if (!lineText.trim()) continue;

        for (const match of lineText.matchAll(callTokenRegex)) {
          const token = match[1];
          if (excludedCallTokens.has(token)) continue;
          if (!knownFunctionNames.has(token)) continue;
          if (token === range.name) continue;
          calls.add(token);
        }
      }
      if (calls.size > 0) {
        functionCallsByFn.set(range.name, calls);
      }
    }
  });

  // ── Frame entry function tracking ────────────────────────────────────

  const frameEntryFnByTrace = new Map<number, string>();
  const frameEntrySourceByTrace = new Map<number, { file: string; line: number }>();

  for (const entryRow of callFrameRows) {
    const traceId = getTraceIdFromFrame(entryRow.frame_id);
    if (traceId === null) continue;

    const rawFn = entryRow.entryMeta?.function || entryRow.fn;
    if (!rawFn) continue;
    const withoutContractPrefix = rawFn.includes('.') ? rawFn.split('.').pop() || rawFn : rawFn;
    const cleanFn = withoutContractPrefix.includes('(')
      ? withoutContractPrefix.split('(')[0]
      : withoutContractPrefix;
    if (!cleanFn) continue;

    frameEntryFnByTrace.set(traceId, cleanFn);

    const firstEntryOp = opRows.find((row) => {
      const rowTraceId = getTraceIdFromFrame(row.frame_id);
      return rowTraceId === traceId &&
        row.fn === cleanFn &&
        !!row.sourceFile &&
        row.line !== undefined;
    });
    if (firstEntryOp?.sourceFile && firstEntryOp.line !== undefined) {
      frameEntrySourceByTrace.set(traceId, { file: firstEntryOp.sourceFile, line: firstEntryOp.line });
    }
  }

  // ── Build reachable function sets ────────────────────────────────────

  const reachableFnsByTrace = new Map<number, Set<string>>();
  for (const [traceId, entryFn] of frameEntryFnByTrace) {
    const visited = new Set<string>([entryFn]);
    const queue = [entryFn];
    while (queue.length > 0) {
      const currentFn = queue.shift()!;
      const callees = functionCallsByFn.get(currentFn);
      if (!callees || callees.size === 0) continue;
      for (const callee of callees) {
        if (visited.has(callee)) continue;
        visited.add(callee);
        queue.push(callee);
      }
    }
    reachableFnsByTrace.set(traceId, visited);
  }

  const isRowStaticallyReachableFromEntry = (row: DecodedTraceRow): boolean => {
    const traceId = getTraceIdFromFrame(row.frame_id);
    if (traceId === null || !row.fn || !row.destFn) return true;
    const reachableFns = reachableFnsByTrace.get(traceId);
    if (!reachableFns || reachableFns.size === 0) return true;
    return reachableFns.has(row.fn) && reachableFns.has(row.destFn);
  };

  const filterReachableJumpRows = (rows: DecodedTraceRow[]): DecodedTraceRow[] => {
    const runtimeReachedFnsByTrace = new Map<number, Set<string>>();

    const getRuntimeSet = (traceId: number): Set<string> => {
      const existing = runtimeReachedFnsByTrace.get(traceId);
      if (existing) return existing;
      const seeded = new Set<string>();
      const entryFn = frameEntryFnByTrace.get(traceId);
      if (entryFn) seeded.add(entryFn);
      runtimeReachedFnsByTrace.set(traceId, seeded);
      return seeded;
    };

    return rows
      .slice()
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .filter((row) => {
        const traceId = getTraceIdFromFrame(row.frame_id);
        if (traceId === null) return true;

        const callerFn = row.fn || null;
        const calleeFn = row.destFn || null;
        const isStaticallyReachable = isRowStaticallyReachableFromEntry(row);
        if (isStaticallyReachable) {
          const runtimeSet = getRuntimeSet(traceId);
          if (callerFn) runtimeSet.add(callerFn);
          if (calleeFn) runtimeSet.add(calleeFn);
          return true;
        }

        const runtimeSet = getRuntimeSet(traceId);
        const callerReachedAtRuntime = !callerFn || runtimeSet.has(callerFn);
        const isRuntimeReachableConfirmedCall =
          row.isConfirmedCall === true &&
          !!calleeFn &&
          callerReachedAtRuntime;

        if (!isRuntimeReachableConfirmedCall) return false;

        if (callerFn) runtimeSet.add(callerFn);
        runtimeSet.add(calleeFn);
        return true;
      });
  };

  let allJumpRows = filterReachableJumpRows(jumpRows);

  // ── Fallback inference for sparse traces ─────────────────────────────

  const findFunctionDefinition = (fnName: string): { file: string; line: number } | null => {
    let bestMatch: { file: string; line: number } | null = null;
    for (const [file, ranges] of fnRangesPerFile.entries()) {
      for (const range of ranges) {
        if (range.name !== fnName) continue;
        const preferThisFile = !bestMatch ||
          range.start > bestMatch.line ||
          (range.start === bestMatch.line &&
            bestMatch.file.includes('/') &&
            !file.includes('/'));
        if (preferThisFile) {
          bestMatch = { file, line: range.start };
        }
      }
    }
    return bestMatch;
  };

  const confirmedJumpCount = allJumpRows.filter((row) => !!row.destFn && row.isConfirmedCall).length;

  if (confirmedJumpCount <= 1) {
    const importantRunOpcodes = new Set([
      "SLOAD", "SSTORE",
      "LOG0", "LOG1", "LOG2", "LOG3", "LOG4",
      "REVERT",
    ]);

    const rowsByTraceId = new Map<number, DecodedTraceRow[]>();
    for (const row of opRows) {
      const traceId = traceIdFromFrame(row.frame_id);
      if (traceId === null) continue;
      const arr = rowsByTraceId.get(traceId) || [];
      arr.push(row);
      rowsByTraceId.set(traceId, arr);
    }

    const existingDestFnsByTrace = new Map<number, Set<string>>();
    for (const row of allJumpRows) {
      const traceId = traceIdFromFrame(row.frame_id);
      if (traceId === null || !row.destFn) continue;
      const set = existingDestFnsByTrace.get(traceId) || new Set<string>();
      set.add(row.destFn);
      existingDestFnsByTrace.set(traceId, set);
    }

    const inferredKeys = new Set<string>();

    for (const [traceId, traceRows] of rowsByTraceId.entries()) {
      if (traceRows.length === 0) continue;
      const entryFn = frameEntryFnByTrace.get(traceId) || null;
      const existingDestFns = existingDestFnsByTrace.get(traceId) || new Set<string>();

      const sortedTraceRows = traceRows.slice().sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      let runStart = 0;
      while (runStart < sortedTraceRows.length) {
        const runFn = sortedTraceRows[runStart].fn || null;
        let runEnd = runStart;
        while (
          runEnd + 1 < sortedTraceRows.length &&
          (sortedTraceRows[runEnd + 1].fn || null) === runFn
        ) {
          runEnd++;
        }

        if (runFn && (!entryFn || runFn !== entryFn) && !existingDestFns.has(runFn)) {
          const runRows = sortedTraceRows.slice(runStart, runEnd + 1);
          const hasMeaningfulOpcode = runRows.some((r) => importantRunOpcodes.has(r.name));
          if (hasMeaningfulOpcode) {
            let callerFn: string | null = null;
            let callerRow: DecodedTraceRow | null = null;

            for (let i = runStart - 1; i >= 0; i--) {
              const candidate = sortedTraceRows[i];
              const candidateFn = candidate.fn || null;
              if (!candidateFn || candidateFn === runFn) continue;
              if (functionCallsByFn.get(candidateFn)?.has(runFn)) {
                callerFn = candidateFn;
                callerRow = candidate;
                break;
              }
            }

            if (!callerFn && entryFn && functionCallsByFn.get(entryFn)?.has(runFn)) {
              callerFn = entryFn;
              callerRow = sortedTraceRows
                .slice(0, runStart)
                .reverse()
                .find((r) => r.fn === entryFn) || null;
            }

            if (callerFn && callerRow?.sourceFile && callerRow.line !== undefined) {
              const correctedCallLine = findCorrectCallLine(
                sourceTexts, callerRow.sourceFile, callerRow.line, runFn
              );
              if (correctedCallLine !== null) {
                const calleeDef = findFunctionDefinition(runFn);
                const runStartRow = sortedTraceRows[runStart];
                const inferredKey =
                  `${traceId}|${callerFn}|${runFn}|${callerRow.sourceFile}|${correctedCallLine}`;
                if (!inferredKeys.has(inferredKey)) {
                  inferredKeys.add(inferredKey);
                  existingDestFns.add(runFn);

                  allJumpRows.push({
                    ...runStartRow,
                    name: "JUMP",
                    fn: callerFn,
                    jumpMarker: true,
                    entryJumpdest: true,
                    destPc: runStartRow.pc,
                    destFn: runFn,
                    srcSourceFile: callerRow.sourceFile,
                    srcLine: correctedCallLine,
                    line: correctedCallLine,
                    destSourceFile: calleeDef?.file ?? runStartRow.sourceFile ?? null,
                    destLine: calleeDef?.line ?? runStartRow.line ?? null,
                    jumpArgs: [],
                    jumpArgsDecoded: null,
                    jumpArgsOrigin: null,
                    jumpArgsTruncated: false,
                    isConfirmedCall: true,
                  });
                }
              }
            }
          }
        }

        runStart = runEnd + 1;
      }

      existingDestFnsByTrace.set(traceId, existingDestFns);
    }
  }

  // ── Promote entry function edges ─────────────────────────────────────

  for (const [traceId, entryFn] of frameEntryFnByTrace) {
    const directCallees = functionCallsByFn.get(entryFn);
    if (!directCallees || directCallees.size === 0) continue;

    for (const calleeFn of directCallees) {
      const hasDirectEdge = allJumpRows.some((row) => {
        const rowTraceId = getTraceIdFromFrame(row.frame_id);
        return rowTraceId === traceId && row.fn === entryFn && row.destFn === calleeFn;
      });
      if (hasDirectEdge) continue;

      const candidateIndex = allJumpRows.findIndex((row) => {
        const rowTraceId = getTraceIdFromFrame(row.frame_id);
        return rowTraceId === traceId && row.fn === calleeFn;
      });
      if (candidateIndex < 0) continue;

      const candidate = allJumpRows[candidateIndex];
      const entrySource = frameEntrySourceByTrace.get(traceId);
      let promotedSrcFile = entrySource?.file || candidate.srcSourceFile || null;
      let promotedSrcLine = entrySource?.line ?? candidate.srcLine ?? null;

      if (promotedSrcFile && promotedSrcLine !== null) {
        const corrected = findCorrectCallLine(sourceTexts, promotedSrcFile, promotedSrcLine, calleeFn);
        if (corrected !== null) promotedSrcLine = corrected;
      }

      const calleeDef = findFunctionDefinition(calleeFn);
      allJumpRows[candidateIndex] = {
        ...candidate,
        fn: entryFn,
        destFn: calleeFn,
        sourceFile: promotedSrcFile,
        srcSourceFile: promotedSrcFile,
        srcLine: promotedSrcLine,
        line: promotedSrcLine ?? candidate.line,
        destSourceFile: calleeDef?.file ?? candidate.destSourceFile ?? null,
        destLine: calleeDef?.line ?? candidate.destLine ?? null,
        isConfirmedCall: true,
      };
    }
  }

  // ── Source-line rescue ───────────────────────────────────────────────

  const hasEdge = (traceId: number, callerFn: string, calleeFn: string): boolean =>
    allJumpRows.some((row) => {
      const rowTraceId = getTraceIdFromFrame(row.frame_id);
      return rowTraceId === traceId && row.fn === callerFn && row.destFn === calleeFn;
    });

  const synthesizedFromSource: DecodedTraceRow[] = [];
  for (const row of allJumpRows) {
    const traceId = getTraceIdFromFrame(row.frame_id);
    if (traceId === null) continue;
    if (!row.srcSourceFile || row.srcLine === null || row.srcLine === undefined) continue;

    const lineCalleeFn = findSingleCalledFunctionOnLine(
      row.srcSourceFile, row.srcLine, row.frame_id
    );
    if (!lineCalleeFn) continue;

    const fileRanges =
      fnRangesPerFile.get(row.srcSourceFile) ||
      fnRangesPerFile.get(row.srcSourceFile.split('/').pop() || '');
    if (!fileRanges || fileRanges.length === 0) continue;

    const callerFromSourceLine = fnForLine(fileRanges, row.srcLine);
    if (!callerFromSourceLine || callerFromSourceLine === lineCalleeFn) continue;
    if (hasEdge(traceId, callerFromSourceLine, lineCalleeFn)) continue;

    const hasCalleeOps = opRows.some((op) => {
      const opTraceId = getTraceIdFromFrame(op.frame_id);
      return opTraceId === traceId && op.fn === lineCalleeFn;
    });
    if (!hasCalleeOps) continue;

    const calleeDef = findFunctionDefinition(lineCalleeFn);
    synthesizedFromSource.push({
      ...row,
      fn: callerFromSourceLine,
      destFn: lineCalleeFn,
      destSourceFile: calleeDef?.file ?? row.destSourceFile ?? null,
      destLine: calleeDef?.line ?? row.destLine ?? null,
      isConfirmedCall: true,
    });
  }
  if (synthesizedFromSource.length > 0) {
    allJumpRows.push(...synthesizedFromSource);
  }

  // Re-apply reachability guard
  allJumpRows = filterReachableJumpRows(allJumpRows);

  // ── Dedup ────────────────────────────────────────────────────────────

  const dedupeKey = (row: DecodedTraceRow): string => {
    const traceId = getTraceIdFromFrame(row.frame_id);
    return `${traceId ?? -1}|${row.fn ?? ''}|${row.destFn ?? ''}|${row.srcSourceFile ?? ''}|${row.srcLine ?? ''}`;
  };

  const firstSeen = new Set<string>();
  allJumpRows = allJumpRows
    .slice()
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .filter((row) => {
      if (!row.fn || !row.destFn) return true;
      const key = dedupeKey(row);
      if (firstSeen.has(key)) return false;
      firstSeen.add(key);
      return true;
    });

  // ── Backfill dest definitions ────────────────────────────────────────

  allJumpRows = allJumpRows.map((row) => {
    if (row.destLine !== null && row.destLine !== undefined && row.destSourceFile) {
      return row;
    }
    if (!row.destFn) return row;
    const def = findFunctionDefinition(row.destFn);
    if (!def) return row;
    return {
      ...row,
      destSourceFile: def.file,
      destLine: def.line,
    };
  });

  // ── Return value decoding ────────────────────────────────────────────

  const jumpOpcodes = new Set(["JUMP", "JUMPI"]);

  const fnHasOutputs = (fnName: string | null | undefined): boolean => {
    if (!fnName) return false;
    if (iface) {
      try {
        const fn = iface.getFunction(fnName);
        if (fn?.outputs && fn.outputs.length > 0) return true;
        if (fn) return false;
      } catch {}
    }
    if (fnSignatures[fnName]?.outputs?.length > 0) return true;
    return false;
  };

  const decodeReturnValue = (
    fnName: string | null | undefined,
    rawValue: any
  ): { value: string; type: string; source: string } => {
    const defaultResult = { value: formatDisplayVal(rawValue), type: "unknown", source: "raw" };
    if (!fnName || rawValue === undefined) return defaultResult;

    if (iface) {
      try {
        const fn = iface.getFunction(fnName);
        if (fn?.outputs && fn.outputs.length > 0) {
          const outputType = fn.outputs[0].type;
          if (outputType === 'address') {
            const hex = typeof rawValue === 'string' ? rawValue :
              '0x' + BigInt(rawValue).toString(16).padStart(40, '0');
            return { value: hex, type: outputType, source: "abi" };
          }
          if (outputType === 'bool') {
            const boolVal = BigInt(rawValue) !== 0n;
            return { value: String(boolVal), type: outputType, source: "abi" };
          }
          if (outputType === 'bytes32') {
            const hex = typeof rawValue === 'string' ? rawValue :
              '0x' + BigInt(rawValue).toString(16).padStart(64, '0');
            return { value: hex, type: outputType, source: "abi" };
          }
          return { value: formatDisplayVal(rawValue), type: outputType, source: "abi" };
        }
      } catch {}
    }

    if (fnSignatures[fnName]?.outputs?.length > 0) {
      const outputType = fnSignatures[fnName].outputs[0].type;
      if (outputType === 'address') {
        const hex = typeof rawValue === 'string' ? rawValue :
          '0x' + BigInt(rawValue).toString(16).padStart(40, '0');
        return { value: hex, type: outputType, source: "source" };
      }
      if (outputType === 'bool') {
        const boolVal = BigInt(rawValue) !== 0n;
        return { value: String(boolVal), type: outputType, source: "source" };
      }
      if (outputType === 'bytes32') {
        const hex = typeof rawValue === 'string' ? rawValue :
          '0x' + BigInt(rawValue).toString(16).padStart(64, '0');
        return { value: hex, type: outputType, source: "source" };
      }
      return { value: formatDisplayVal(rawValue), type: outputType, source: "source" };
    }

    if (rawValue) {
      try {
        const bigVal = BigInt(rawValue);
        if (bigVal > 0n && bigVal <= BigInt('0xffffffffffffffffffffffffffffffffffffffff')) {
          const hex = '0x' + bigVal.toString(16).padStart(40, '0');
          if (bigVal > BigInt('0xffffffffffff')) {
            return { value: hex, type: "address?", source: "heuristic" };
          }
        }
      } catch {}
    }

    return defaultResult;
  };

  allJumpRows.forEach((jr) => {
    const callerFn = jr.fn;
    const destFn = jr.destFn;
    if (!fnHasOutputs(destFn)) {
      jr.jumpResult = undefined;
      return;
    }
    let enteredDest = false;
    for (const o of opRows) {
      if (o.id <= jr.id) continue;
      if (!enteredDest && o.fn === destFn) { enteredDest = true; continue; }
      if (enteredDest && o.fn === callerFn) {
        if (Array.isArray(o.stack) && o.stack.length > 0) {
          const decoded = decodeReturnValue(destFn, o.stack[o.stack.length - 1]);
          jr.jumpResult = decoded.value;
          jr.jumpResultSource = `fn-return (${decoded.type})`;
        }
        break;
      }
    }
    if (jr.jumpResult === undefined) {
      const nextInCaller = opRows.find(
        (o) => o.id > jr.id && o.fn === callerFn && !jumpOpcodes.has(o.name) &&
          Array.isArray(o.stack) && o.stack.length > 0
      );
      if (nextInCaller) {
        const decoded = decodeReturnValue(destFn, nextInCaller.stack![nextInCaller.stack!.length - 1]);
        jr.jumpResult = decoded.value;
        jr.jumpResultSource = `fallback-next (${decoded.type})`;
      }
    }
  });

  return allJumpRows;
}
