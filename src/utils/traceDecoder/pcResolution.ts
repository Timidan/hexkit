/**
 * Single home for the PC-resolution strategy (contract-pcMap precedence +
 * unverified guard + hasMultipleContractMaps guard + filtered/global fallbacks)
 * and the canonical traceIdFromFrame, consumed by both buildAnalysisLocals
 * (analysisHelpers.ts) and phaseInit (decodeTraceInit.ts).
 */

import type { PcInfo, FunctionRange } from './types';
import { fnForLine, fnForLineIfAtStart } from './sourceParser';

/** Extract traceId from a frame_id array; null when absent or non-numeric. */
export const traceIdFromFrame = (frameId: any): number | null => {
  if (!Array.isArray(frameId) || frameId.length < 1) return null;
  const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
  return Number.isNaN(traceId) ? null : traceId;
};

/** Maps/flags read by the PC-resolution family. */
export interface PcResolutionMaps {
  pcMapFull: Map<number, PcInfo> | null;
  pcMapFiltered: Map<number, number> | null;
  pcMapsPerContract: Map<string, Map<number, PcInfo>>;
  pcMapsFilteredPerContract: Map<string, Map<number, number>>;
  traceIdToCodeAddr: Map<number, string>;
  codeAddrToFnRanges: Map<string, FunctionRange[]>;
  fnRangesPerFile: Map<string, FunctionRange[]>;
  modifierRangesPerFile: Map<string, FunctionRange[]>;
  fnRanges: FunctionRange[];
  unverifiedTraceIds: Set<number>;
  hasMultipleContractMaps: boolean;
  /**
   * When a frame's traceId is non-numeric, fall through to the global pcMapFull
   * (decodeTraceInit's original behaviour) instead of returning undefined
   * (analysis's original behaviour). Defaults to false.
   */
  fallBackToGlobalOnInvalidFrame?: boolean;
}

/** The PC-resolution closure family. */
export interface PcResolvers {
  getPcInfoForOpcode: (pc: number, frameId: any) => PcInfo | undefined;
  pcInfoForPc: (pc: number, frameId?: any) => PcInfo | undefined;
  lineForPc: (pc: number, frameId?: any) => number | undefined;
  fnForPc: (pc: number, frameId?: any) => string | null;
  modifierForPc: (pc: number, frameId?: any) => string | null;
  fnForPcIfAtEntry: (pc: number, frameId?: any) => string | null;
  jumpTypeForPc: (pc: number, frameId?: any) => PcInfo['jumpType'] | undefined;
}

/**
 * Build all PC-resolution closures over the given maps/flags. The factory
 * closes over the maps argument, NOT a DecodeTraceContext.
 */
export function createPcResolvers(maps: PcResolutionMaps): PcResolvers {
  const { pcMapFull, pcMapFiltered, pcMapsPerContract, pcMapsFilteredPerContract,
          traceIdToCodeAddr, codeAddrToFnRanges, fnRangesPerFile,
          modifierRangesPerFile, fnRanges, unverifiedTraceIds,
          hasMultipleContractMaps, fallBackToGlobalOnInvalidFrame } = maps;

  const resolveCodeAddrForFrame = (frameId: any): string | undefined => {
    if (!Array.isArray(frameId) || frameId.length < 1) return undefined;
    const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    if (isNaN(traceId)) return undefined;
    return traceIdToCodeAddr.get(traceId);
  };

  const getPcInfoForOpcode = (pc: number, frameId: any): PcInfo | undefined => {
    if (Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (isNaN(traceId)) return fallBackToGlobalOnInvalidFrame ? pcMapFull?.get(pc) : undefined;
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

  const lineForPc = (pc: number, frameId?: any): number | undefined => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (pcInfo?.line !== undefined) return pcInfo.line;
    if (frameId) {
      const codeAddr = resolveCodeAddrForFrame(frameId);
      if (codeAddr) {
        const filtered = pcMapsFilteredPerContract.get(codeAddr);
        if (filtered?.has(pc)) return filtered.get(pc);
        if (hasMultipleContractMaps) return undefined;
      }
    }
    if (pcMapFiltered && pcMapFiltered.has(pc)) return pcMapFiltered.get(pc);
    return undefined;
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
      const contractFnRanges = codeAddrToFnRanges.get(codeAddr);
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
      const contractFnRanges = codeAddrToFnRanges.get(codeAddr);
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

  return {
    getPcInfoForOpcode,
    pcInfoForPc,
    lineForPc,
    fnForPc,
    modifierForPc,
    fnForPcIfAtEntry,
    jumpTypeForPc,
  };
}
