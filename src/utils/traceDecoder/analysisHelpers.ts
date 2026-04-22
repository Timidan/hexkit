/**
 * Phase 2 helpers: multi-contract map building, call frame processing,
 * and PC-resolution closure factories.
 *
 * Extracted from decodeTraceAnalysis.ts to keep files under 800 lines.
 */

import { ethers } from "ethers";
import type { DecodedTraceRow, PcInfo, DecodeTraceContext, FunctionRange } from './types';
import { formatAbiVal } from './formatting';
import { fnForLine, fnForLineIfAtStart, parseFunctions, parseFunctionSignatures,
         buildSourceTextResolver } from './sourceParser';
import { getCallFrames,
         getERC20FunctionsInterface, getERC721FunctionsInterface } from './stackDecoding';

// ── Shared helper state passed between analysis sub-phases ─────────────

export interface AnalysisLocals {
  /** Is there more than one contract with PC maps? */
  hasMultipleContractMaps: boolean;
  /** All generated call frame rows */
  callFrameRows: DecodedTraceRow[];
  /** Resolve code address from a frame_id array */
  resolveCodeAddrForFrame: (frameId: any) => string | undefined;
  /** Full PcInfo for a given (pc, frameId) */
  pcInfoForPc: (pc: number, frameId?: any) => PcInfo | undefined;
  /** Function name at a given pc */
  fnForPc: (pc: number, frameId?: any) => string | null;
  /** Modifier name at a given pc */
  modifierForPc: (pc: number, frameId?: any) => string | null;
  /** Function name at pc if pc is at the entry point of the function */
  fnForPcIfAtEntry: (pc: number, frameId?: any) => string | null;
  /** Jump type at a given pc */
  jumpTypeForPc: (pc: number, frameId?: any) => PcInfo['jumpType'] | undefined;
  /** Cached source-text resolver */
  getSourceContent: (fileKey: string | null | undefined) => string | null;
  /** Find a single called function name on a source line */
  findSingleCalledFunctionOnLine: (
    filePath: string | null | undefined,
    line: number | null | undefined,
    frameId?: any
  ) => string | null;
  /** All JUMP/JUMPI opcode rows */
  allJumps: DecodedTraceRow[];
  /** Extract traceId from frame_id */
  traceIdFromFrame: (frameId: any) => number | null;
  /** opRow index by id (for jump processing) */
  opRowIndexByIdForJump: Map<number, number>;
  /** Precomputed next-row-in-same-frame index */
  nextRowInFrame: Int32Array;
  /** Parse a potential PC value from stack */
  parsePcCandidate: (value: unknown) => number | null;
  /** Extract jump destination PC from a row */
  jumpDestPcFromRow: (row: DecodedTraceRow) => number | null;
  /** getFnVisibility closure */
  getFnVisibility: (
    fnName: string | null | undefined,
    filePath: string | null | undefined,
    frameId?: any
  ) => string | undefined;
}

// ── Multi-contract artifact setup ──────────────────────────────────────

/**
 * Populate per-contract maps from raw artifacts: contract names, interfaces,
 * function ranges, and function signatures.
 */
export function buildMultiContractMaps(ctx: DecodeTraceContext): void {
  const allArtifacts = (ctx.raw as any).artifacts || {};

  Object.entries(allArtifacts).forEach(([addr, artifactData]: [string, any]) => {
    const normalizedAddr = addr.toLowerCase();

    let name = artifactData?.meta?.Name || artifactData?.meta?.ContractName;
    if (!name) {
      const compilationTarget = artifactData?.input?.settings?.compilationTarget;
      if (compilationTarget && typeof compilationTarget === 'object') {
        const values = Object.values(compilationTarget);
        if (values.length > 0 && typeof values[0] === 'string') {
          name = values[0];
        }
      }
    }

    if (name) {
      ctx.codeAddrToContractName.set(normalizedAddr, name);
    }

    const abiData = artifactData?.output?.abi || artifactData?.meta?.ABI;
    if (abiData) {
      try {
        const abiArray = typeof abiData === 'string' ? JSON.parse(abiData) : abiData;
        if (Array.isArray(abiArray) && abiArray.length > 0) {
          ctx.codeAddrToInterface.set(normalizedAddr, new ethers.utils.Interface(abiArray));
        }
      } catch {}
    }

    // Extract per-contract function ranges from sources
    const artifactSources = artifactData?.input?.sources || artifactData?.sources || {};
    let contractFnRanges: FunctionRange[] = [];
    let contractFnSignatures: Record<string, any> = {};

    if (Object.keys(artifactSources).length > 0) {
      Object.entries(artifactSources).forEach(([_path, value]: [string, any]) => {
        let sourceContent: string | null = null;
        if (typeof value === 'string') {
          sourceContent = value;
        } else if (value && typeof value === 'object' && value.content) {
          sourceContent = value.content;
        }
        if (sourceContent) {
          const ranges = parseFunctions(sourceContent);
          const signatures = parseFunctionSignatures(sourceContent);
          contractFnRanges = [...contractFnRanges, ...ranges];
          contractFnSignatures = { ...contractFnSignatures, ...signatures };
        }
      });
    }

    if (contractFnRanges.length > 0) {
      ctx.codeAddrToFnRanges.set(normalizedAddr, contractFnRanges);
      ctx.codeAddrToFnSignatures.set(normalizedAddr, contractFnSignatures);
    }
  });
}

// ── Assign contract names / fn names to opcode rows ────────────────────

export function assignContractNamesToOpRows(ctx: DecodeTraceContext): void {
  const { opRows, fnRangesPerFile, traceIdToCodeAddr } = ctx;

  opRows.forEach((r) => {
    const frameId = r.frame_id;
    if (!Array.isArray(frameId) || frameId.length < 1) return;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    if (isNaN(traceId)) return;
    const codeAddr = traceIdToCodeAddr.get(traceId);
    if (!codeAddr) return;

    if (!r.contract) {
      const name = ctx.codeAddrToContractName.get(codeAddr);
      if (name) {
        r.contract = name;
      } else if (codeAddr) {
        r.contract = codeAddr;
      }
    }

    // Only use contract-wide line fallback when file attribution is unavailable.
    if (r.line !== undefined && !r.fn && !r.sourceFile) {
      const contractFnRanges = ctx.codeAddrToFnRanges.get(codeAddr);
      if (contractFnRanges && contractFnRanges.length > 0) {
        const correctFn = fnForLine(contractFnRanges, r.line);
        if (correctFn) r.fn = correctFn;
      }
    }
  });
}

// ── Build call frame rows ──────────────────────────────────────────────

export function buildCallFrameRows(ctx: DecodeTraceContext): DecodedTraceRow[] {
  const { raw, opRows, iface, traceIdToDepth, traceIdToCodeAddr,
          pcMapsPerContract, hasAnyArtifacts } = ctx;

  const allCalls = getCallFrames(raw);
  const callFrameRows: DecodedTraceRow[] = [];

  allCalls.forEach((callEntry: any, idx: number) => {
    if (!callEntry) return;

    const callTypeObj = callEntry.call_type || callEntry.callType || {};
    let callTypeValue: string;
    if (typeof callTypeObj === 'object') {
      const values = Object.values(callTypeObj);
      callTypeValue = typeof values[0] === 'string' ? values[0] : 'Call';
    } else {
      callTypeValue = String(callTypeObj);
    }
    const callOpcode = callTypeValue.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
    const normalizedOpcode = callOpcode.replace(/_/g, '');

    const codeAddress = (callEntry.code_address || callEntry.codeAddress || "").toLowerCase();
    const targetAddress = (callEntry.target || callEntry.code_address || "").toLowerCase();

    let callContractName = ctx.codeAddrToContractName.get(codeAddress);
    const hasNoSourceMaps = hasAnyArtifacts && !pcMapsPerContract.has(codeAddress) && !pcMapsPerContract.has(targetAddress);

    if (!callContractName) {
      if (codeAddress) {
        callContractName = codeAddress;
      } else if (targetAddress) {
        callContractName = targetAddress;
      }
    }

    const hasSpecificInterface = ctx.codeAddrToInterface.has(codeAddress) || ctx.codeAddrToInterface.has(targetAddress);
    const specificInterface = ctx.codeAddrToInterface.get(codeAddress) || ctx.codeAddrToInterface.get(targetAddress);

    let parsedFunction: string | undefined;
    let parsedArgs: { name: string; value: string }[] | undefined;
    let parsedOutputs: any[] | undefined;
    const serializeAbiParam = (param: any): any => ({
      name: param?.name || "",
      type: param?.type || "",
      internalType: param?.internalType,
      components: Array.isArray(param?.components)
        ? param.components.map((component: any) => serializeAbiParam(component))
        : undefined,
    });

    if (callEntry.input && callEntry.input.length >= 10) {
      const interfacesToTry: ethers.utils.Interface[] = [];
      if (specificInterface) interfacesToTry.push(specificInterface);
      if (!hasSpecificInterface) {
        interfacesToTry.push(getERC20FunctionsInterface());
        interfacesToTry.push(getERC721FunctionsInterface());
      }
      if (iface) interfacesToTry.push(iface);

      for (const tryIface of interfacesToTry) {
        try {
          const parsed = tryIface.parseTransaction({ data: callEntry.input });
          if (parsed) {
            parsedFunction = parsed?.signature || parsed?.name;
            if (parsed?.args) {
              parsedArgs = parsed.functionFragment.inputs.map((inp, i) => ({
                name: inp.name || `arg${i}`,
                value: formatAbiVal(inp.type, parsed.args[i]),
              }));
            }
            if (parsed?.functionFragment?.outputs) {
              parsedOutputs = parsed.functionFragment.outputs.map((out, i) => {
                const serialized = serializeAbiParam(out);
                return {
                  ...serialized,
                  name: serialized.name || `output${i}`,
                };
              });
            }
            break;
          }
        } catch {}
      }

      if (!parsedFunction) {
        parsedFunction = callEntry.input.slice(0, 10);
      }
    }

    const traceId = callEntry.id ?? idx;
    const frameId = -(traceId + 1);
    const callDepth = callEntry.depth ?? traceIdToDepth.get(traceId) ?? 0;
    const callResult = callEntry.result;
    const callOutput =
      callEntry.output ??
      callEntry.returnData ??
      callResult?.output ??
      callResult?.Success?.output ??
      callResult?.Success?.return_data ??
      callResult?.Success?.returnData ??
      callResult?.Revert?.output ??
      callResult?.Revert?.return_data ??
      callResult?.Revert?.returnData;
    const initialGas =
      callResult?.Success?.gas_used ?? callResult?.Success?.gasUsed ??
      callResult?.Revert?.gas_used ?? callResult?.gas_used ??
      callResult?.gasUsed ?? callEntry.gas_used ?? callEntry.gasUsed ?? "0";
    const firstSnapshotId = callEntry.first_snapshot_id ?? callEntry.firstSnapshotId;
    const externalParentId = callEntry.parent_id ?? callEntry.parentId;

    const callFrameRow: DecodedTraceRow = {
      id: frameId,
      traceId,
      kind: "opcode" as const,
      name: normalizedOpcode,
      pc: 0,
      input: callEntry.input,
      output: typeof callOutput === "string" ? callOutput : undefined,
      gasDelta: String(initialGas),
      gasUsed: String(initialGas),
      gasRemaining: callEntry.gas_limit ?? callEntry.gasLimit ?? "0",
      frame_id: callEntry.frame_id || [traceId],
      depth: callDepth,
      firstSnapshotId,
      externalParentTraceId: externalParentId,
      entryJumpdest: true,
      entryMeta: {
        caller: callEntry.caller,
        target: callEntry.target || callEntry.code_address,
        codeAddress: codeAddress,
        codeContractName: callContractName,
        targetContractName: ctx.codeAddrToContractName.get(targetAddress) || undefined,
        callType: normalizedOpcode,
        selector: callEntry.input?.slice(0, 10),
        function: parsedFunction || (callEntry.input?.slice(0, 10) ?? undefined),
        args: parsedArgs,
        outputs: parsedOutputs,
        value: callEntry.value,
      },
      contract: callContractName,
      hasNoSourceMaps: hasNoSourceMaps,
    };

    callFrameRows.push(callFrameRow);
  });

  return callFrameRows;
}

// ── PC resolution closures ─────────────────────────────────────────────

/**
 * Build all PC-resolution closures and helper utilities that are shared
 * between the jump analysis and call hierarchy phases.
 */
export function buildAnalysisLocals(ctx: DecodeTraceContext, callFrameRows: DecodedTraceRow[]): AnalysisLocals {
  const { opRows, fnRanges, fnSignatures, fnRangesPerFile, fnSignaturesPerFile,
          modifierRangesPerFile, sourceTexts, traceIdToCodeAddr,
          pcMapsPerContract, pcMapsFilteredPerContract,
          pcMapFull, pcMapFiltered, unverifiedTraceIds } = ctx;

  const hasMultipleContractMaps = traceIdToCodeAddr.size > 1 || pcMapsPerContract.size > 1;

  const resolveCodeAddrForFrame = (frameId: any): string | undefined => {
    if (!Array.isArray(frameId) || frameId.length < 1) return undefined;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    if (isNaN(traceId)) return undefined;
    return traceIdToCodeAddr.get(traceId);
  };

  const getPcInfoForOpcode = (pc: number, frameId: any): PcInfo | undefined => {
    if (Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (isNaN(traceId)) return undefined;
      if (unverifiedTraceIds.has(traceId)) return undefined;
      const codeAddr = traceIdToCodeAddr.get(traceId);
      if (codeAddr) {
        const contractPcMap = pcMapsPerContract.get(codeAddr);
        if (contractPcMap?.has(pc)) return contractPcMap.get(pc);
        if (hasMultipleContractMaps) return undefined;
      }
    }
    return pcMapFull?.get(pc);
  };

  const pcInfoForPc = (pc: number, frameId?: any): PcInfo | undefined => {
    if (frameId) {
      const info = getPcInfoForOpcode(pc, frameId);
      if (info) return info;
    }
    return pcMapFull ? pcMapFull.get(pc) : undefined;
  };

  const fnForPc = (pc: number, frameId?: any) => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (!pcInfo) return null;
    if (pcInfo.line === undefined) return null;
    const { line, file } = pcInfo;
    if (file) {
      let fileFnRanges = fnRangesPerFile.get(file);
      if (!fileFnRanges || fileFnRanges.length === 0) {
        const filename = file.split('/').pop() || file;
        fileFnRanges = fnRangesPerFile.get(filename);
      }
      if (fileFnRanges && fileFnRanges.length > 0) {
        const fn = fnForLine(fileFnRanges, line);
        if (fn) return fn;
      }
      return null;
    }
    const codeAddr = resolveCodeAddrForFrame(frameId);
    if (codeAddr) {
      const contractFnRanges = ctx.codeAddrToFnRanges.get(codeAddr);
      if (contractFnRanges && contractFnRanges.length > 0) {
        const fn = fnForLine(contractFnRanges, line);
        if (fn) return fn;
      }
      if (hasMultipleContractMaps) return null;
    }
    return hasMultipleContractMaps ? null : fnForLine(fnRanges, line);
  };

  const modifierForPc = (pc: number, frameId?: any): string | null => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (!pcInfo || pcInfo.line === undefined) return null;
    const { line, file } = pcInfo;
    if (!file) return null;

    let fileModifierRanges = modifierRangesPerFile.get(file);
    if (!fileModifierRanges || fileModifierRanges.length === 0) {
      const filename = file.split('/').pop() || file;
      fileModifierRanges = modifierRangesPerFile.get(filename);
    }
    if (!fileModifierRanges || fileModifierRanges.length === 0) return null;

    return fnForLine(fileModifierRanges, line);
  };

  const fnForPcIfAtEntry = (pc: number, frameId?: any): string | null => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (!pcInfo || pcInfo.line === undefined) return null;
    const { line, file } = pcInfo;
    if (file) {
      let fileFnRanges = fnRangesPerFile.get(file);
      if (!fileFnRanges || fileFnRanges.length === 0) {
        const filename = file.split('/').pop() || file;
        fileFnRanges = fnRangesPerFile.get(filename);
      }
      if (fileFnRanges && fileFnRanges.length > 0) {
        return fnForLineIfAtStart(fileFnRanges, line, 15);
      }
      return null;
    }
    const codeAddr = resolveCodeAddrForFrame(frameId);
    if (codeAddr) {
      const contractFnRanges = ctx.codeAddrToFnRanges.get(codeAddr);
      if (contractFnRanges && contractFnRanges.length > 0) {
        return fnForLineIfAtStart(contractFnRanges, line, 15);
      }
      if (hasMultipleContractMaps) return null;
    }
    return hasMultipleContractMaps ? null : fnForLineIfAtStart(fnRanges, line, 15);
  };

  const jumpTypeForPc = (pc: number, frameId?: any): PcInfo['jumpType'] | undefined => {
    return pcInfoForPc(pc, frameId)?.jumpType;
  };

  // Use cached resolver
  const getSourceContent = buildSourceTextResolver(sourceTexts);

  const findSingleCalledFunctionOnLine = (
    filePath: string | null | undefined,
    line: number | null | undefined,
    frameId?: any
  ): string | null => {
    if (!filePath || !line || line < 1) return null;
    const content = getSourceContent(filePath);
    if (!content) return null;
    const lines = content.split('\n');
    if (line > lines.length) return null;
    const text = lines[line - 1];

    const keywords = new Set([
      'if', 'for', 'while', 'require', 'assert', 'revert', 'return', 'emit',
      'new', 'function', 'assembly', 'unchecked'
    ]);

    const knownFns = new Set<string>(Object.keys(fnSignatures));
    if (frameId && Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (!isNaN(traceId)) {
        const codeAddr = traceIdToCodeAddr.get(traceId);
        if (codeAddr) {
          const contractSigs = ctx.codeAddrToFnSignatures.get(codeAddr);
          if (contractSigs) {
            Object.keys(contractSigs).forEach((fn) => knownFns.add(fn));
          }
        }
      }
    }

    const fnRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    const matches = new Set<string>();
    for (const match of text.matchAll(fnRegex)) {
      const fnName = match[1];
      if (keywords.has(fnName)) continue;
      if (knownFns.has(fnName)) matches.add(fnName);
    }

    if (matches.size !== 1) return null;
    return Array.from(matches)[0];
  };

  const jumpOpcodes = new Set(["JUMP", "JUMPI"]);

  const allJumps = opRows.filter((r) => jumpOpcodes.has(r.name));

  const traceIdFromFrame = (frameId: any): number | null => {
    if (!Array.isArray(frameId) || frameId.length < 1) return null;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    return Number.isNaN(traceId) ? null : traceId;
  };

  const opRowIndexByIdForJump = new Map<number, number>();
  opRows.forEach((row, idx) => {
    if (row.id !== undefined) opRowIndexByIdForJump.set(row.id, idx);
  });

  // Precompute next-row-in-same-frame index for O(1) execution proof lookups.
  const nextRowInFrame = new Int32Array(opRows.length).fill(-1);
  {
    const lastSeenInFrame = new Map<number, number>();
    for (let i = opRows.length - 1; i >= 0; i--) {
      const tid = traceIdFromFrame(opRows[i].frame_id);
      if (tid === null) continue;
      const next = lastSeenInFrame.get(tid);
      if (next !== undefined) nextRowInFrame[i] = next;
      lastSeenInFrame.set(tid, i);
    }
  }

  const parsePcCandidate = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    try {
      const asBigInt =
        typeof value === "bigint"
          ? value
          : typeof value === "number"
          ? BigInt(value)
          : BigInt(String(value));
      const asNumber = Number(asBigInt);
      return Number.isFinite(asNumber) ? asNumber : null;
    } catch {
      return null;
    }
  };

  const jumpDestPcFromRow = (row: DecodedTraceRow): number | null => {
    const stackWords = Array.isArray(row.stack) ? row.stack : [];

    if (row.name === "JUMP" && stackWords.length >= 1) {
      return parsePcCandidate(stackWords[stackWords.length - 1]);
    }
    if (row.name === "JUMPI") {
      if (stackWords.length >= 2) {
        return parsePcCandidate(stackWords[stackWords.length - 2]);
      }
      if (stackWords.length >= 1) {
        return parsePcCandidate(stackWords[stackWords.length - 1]);
      }
    }

    return parsePcCandidate(row.stackTop);
  };

  const getFnVisibility = (
    fnName: string | null | undefined,
    filePath: string | null | undefined,
    frameId?: any
  ): string | undefined => {
    if (!fnName) return undefined;
    if (filePath) {
      const fileSigs =
        fnSignaturesPerFile.get(filePath) ||
        fnSignaturesPerFile.get(filePath.split('/').pop() || '');
      const fileSig = fileSigs?.[fnName];
      if (fileSig?.visibility) return fileSig.visibility;
    }
    if (frameId && Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (!isNaN(traceId)) {
        const codeAddr = traceIdToCodeAddr.get(traceId);
        const contractSigs = codeAddr ? ctx.codeAddrToFnSignatures.get(codeAddr) : undefined;
        const contractSig = contractSigs?.[fnName];
        if (contractSig?.visibility) return contractSig.visibility;
      }
    }
    return fnSignatures[fnName]?.visibility;
  };

  return {
    hasMultipleContractMaps,
    callFrameRows,
    resolveCodeAddrForFrame,
    pcInfoForPc,
    fnForPc,
    modifierForPc,
    fnForPcIfAtEntry,
    jumpTypeForPc,
    getSourceContent,
    findSingleCalledFunctionOnLine,
    allJumps,
    traceIdFromFrame,
    opRowIndexByIdForJump,
    nextRowInFrame,
    parsePcCandidate,
    jumpDestPcFromRow,
    getFnVisibility,
  };
}
