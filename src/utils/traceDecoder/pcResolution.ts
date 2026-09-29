import { fnForLine, fnForLineIfAtStart } from './sourceParser';
import type { FunctionRange, PcInfo } from './types';

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
}

export function traceIdFromFrame(frameId: unknown): number | null {
  if (!Array.isArray(frameId) || frameId.length === 0) return null;
  const traceId = typeof frameId[0] === 'number'
    ? frameId[0]
    : Number.parseInt(String(frameId[0]), 10);
  return Number.isNaN(traceId) ? null : traceId;
}

function rangesForFile(
  rangesByFile: Map<string, FunctionRange[]>,
  file: string,
): FunctionRange[] | undefined {
  const exact = rangesByFile.get(file);
  if (exact?.length) return exact;
  return rangesByFile.get(file.split('/').pop() || file);
}

export function createPcResolvers(maps: PcResolutionMaps) {
  const resolveCodeAddrForFrame = (frameId: unknown): string | undefined => {
    const traceId = traceIdFromFrame(frameId);
    return traceId === null ? undefined : maps.traceIdToCodeAddr.get(traceId);
  };

  const getPcInfoForOpcode = (
    pc: number,
    frameId?: unknown,
  ): PcInfo | undefined => {
    const traceId = traceIdFromFrame(frameId);
    if (Array.isArray(frameId) && frameId.length > 0 && traceId === null) {
      return undefined;
    }
    if (traceId !== null) {
      if (maps.unverifiedTraceIds.has(traceId)) return undefined;
      const codeAddr = maps.traceIdToCodeAddr.get(traceId);
      if (codeAddr) {
        const contractPcMap = maps.pcMapsPerContract.get(codeAddr);
        if (contractPcMap?.has(pc)) return contractPcMap.get(pc);
        if (maps.hasMultipleContractMaps) return undefined;
      }
    }
    return maps.pcMapFull?.get(pc);
  };

  const pcInfoForPc = (pc: number, frameId?: unknown): PcInfo | undefined =>
    getPcInfoForOpcode(pc, frameId);

  const lineForPc = (pc: number, frameId?: unknown): number | undefined => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (pcInfo?.line !== undefined) return pcInfo.line;

    const traceId = traceIdFromFrame(frameId);
    if (traceId !== null) {
      if (maps.unverifiedTraceIds.has(traceId)) return undefined;
      const codeAddr = maps.traceIdToCodeAddr.get(traceId);
      if (codeAddr) {
        const filtered = maps.pcMapsFilteredPerContract.get(codeAddr);
        if (filtered?.has(pc)) return filtered.get(pc);
        if (maps.hasMultipleContractMaps) return undefined;
      }
    }
    return maps.pcMapFiltered?.get(pc);
  };

  const fnForPc = (pc: number, frameId?: unknown): string | null => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (pcInfo?.line === undefined) return null;

    if (pcInfo.file) {
      const ranges = rangesForFile(maps.fnRangesPerFile, pcInfo.file);
      return ranges?.length ? fnForLine(ranges, pcInfo.line) : null;
    }

    const codeAddr = resolveCodeAddrForFrame(frameId);
    if (codeAddr) {
      const ranges = maps.codeAddrToFnRanges.get(codeAddr);
      if (ranges?.length) {
        const name = fnForLine(ranges, pcInfo.line);
        if (name) return name;
      }
      if (maps.hasMultipleContractMaps) return null;
    }
    return maps.hasMultipleContractMaps ? null : fnForLine(maps.fnRanges, pcInfo.line);
  };

  const modifierForPc = (pc: number, frameId?: unknown): string | null => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (pcInfo?.line === undefined || !pcInfo.file) return null;
    const ranges = rangesForFile(maps.modifierRangesPerFile, pcInfo.file);
    return ranges?.length ? fnForLine(ranges, pcInfo.line) : null;
  };

  const fnForPcIfAtEntry = (pc: number, frameId?: unknown): string | null => {
    const pcInfo = pcInfoForPc(pc, frameId);
    if (pcInfo?.line === undefined) return null;

    if (pcInfo.file) {
      const ranges = rangesForFile(maps.fnRangesPerFile, pcInfo.file);
      return ranges?.length
        ? fnForLineIfAtStart(ranges, pcInfo.line, 15)
        : null;
    }

    const codeAddr = resolveCodeAddrForFrame(frameId);
    if (codeAddr) {
      const ranges = maps.codeAddrToFnRanges.get(codeAddr);
      if (ranges?.length) {
        return fnForLineIfAtStart(ranges, pcInfo.line, 15);
      }
      if (maps.hasMultipleContractMaps) return null;
    }
    return maps.hasMultipleContractMaps
      ? null
      : fnForLineIfAtStart(maps.fnRanges, pcInfo.line, 15);
  };

  const jumpTypeForPc = (
    pc: number,
    frameId?: unknown,
  ): PcInfo['jumpType'] | undefined => pcInfoForPc(pc, frameId)?.jumpType;

  return {
    resolveCodeAddrForFrame,
    getPcInfoForOpcode,
    pcInfoForPc,
    lineForPc,
    fnForPc,
    modifierForPc,
    fnForPcIfAtEntry,
    jumpTypeForPc,
  };
}
