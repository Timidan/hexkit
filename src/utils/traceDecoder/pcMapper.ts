/**
 * PC (Program Counter) to source line mapping utilities
 */

import type { RawTrace, PcInfo } from './types';

export function buildFullPcLineMap(
  raw: RawTrace,
  primaryAddr: string | null,
  callBytecode?: string | null
): Map<number, PcInfo> | null {
  const artifacts = (raw as any).artifacts || {};
  const art =
    (primaryAddr &&
      (artifacts as Record<string, any>)[
        primaryAddr.toLowerCase?.() || primaryAddr
      ]) ||
    (primaryAddr && (artifacts as Record<string, any>)[primaryAddr]) ||
    (Object.values(artifacts)[0] as any);
  if (!art) {
    return null;
  }
  const contracts = (art as any).output?.contracts;
  if (!contracts) {
    return null;
  }
  const normalizeHex = (value?: string | null): string =>
    typeof value === "string" ? value.replace(/^0x/, "").toLowerCase() : "";
  const callBytecodeNorm = normalizeHex(callBytecode);

  let chosen: { obj: string; sm: string } | null = null;
  let chosenScore = -1;
  let chosenObjLen = -1;
  let chosenSmLen = -1;

  const commonPrefixLen = (a: string, b: string): number => {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a[i] === b[i]) i++;
    return i;
  };
  for (const c of Object.values(contracts)) {
    if (!c || typeof c !== "object") continue;
    for (const contract of Object.values(c as any)) {
      const evm = (contract as any)?.evm;
      if (!evm) continue;
      const db = evm.deployedBytecode || {};
      const obj = db.object || "";
      const sm =
        evm.deployedSourceMap ||
        evm.deployed_source_map ||
        db.sourceMap ||
        db.source_map ||
        "";
      if (!obj || !sm) continue;

      const objNorm = normalizeHex(obj);
      let score = 0;
      if (callBytecodeNorm && objNorm) {
        score = commonPrefixLen(callBytecodeNorm, objNorm);
        if (callBytecodeNorm.length === objNorm.length) score += 2;
      }
      const objLen = objNorm.length;
      const smLen = sm.length;

      const betterMatch =
        (callBytecodeNorm && score > chosenScore) ||
        (callBytecodeNorm && score === chosenScore && objLen > chosenObjLen) ||
        (callBytecodeNorm &&
          score === chosenScore &&
          objLen === chosenObjLen &&
          smLen > chosenSmLen) ||
        (!callBytecodeNorm && objLen > chosenObjLen) ||
        (!callBytecodeNorm && objLen === chosenObjLen && smLen > chosenSmLen);

      if (betterMatch) {
        chosen = { obj, sm };
        chosenScore = score;
        chosenObjLen = objLen;
        chosenSmLen = smLen;
      }
    }
  }
  if (!chosen) {
    return null;
  }
  const bytecodeHex = chosen.obj.replace(/^0x/, "");
  if (!bytecodeHex) return null;
  const srcMap = chosen.sm.split(";");

  // CRITICAL: Build sourceVec using output.sources for correct file ID ordering
  // The source map file indices correspond to the 'id' field in output.sources
  // NOT the arbitrary iteration order of sources from input or other locations
  const outputSources = (art as any).output?.sources;
  let sourceVec: [string, string][] = [];

  if (outputSources && typeof outputSources === 'object') {
    // Build an ID-indexed source vector from output.sources.id.
    // NOTE: keep sparse IDs to avoid shifting source map file indices.
    const sourcesWithIds: { path: string; id: number }[] = [];
    for (const [path, info] of Object.entries(outputSources)) {
      const id = (info as any)?.id;
      if (typeof id === 'number') {
        sourcesWithIds.push({ path, id });
      }
    }
    sourcesWithIds.sort((a, b) => a.id - b.id);

    if (sourcesWithIds.length > 0) {
      const rawSources = (raw as any).sources || {};
      const inputSources = (art as any).input?.sources || (art as any).sources || {};
      const sourcesFromRaw =
        (primaryAddr && (rawSources as any)[primaryAddr]?.Source?.sources) ||
        (Object.values(rawSources)[0] as any)?.Source?.sources ||
        {};

      const maxId = sourcesWithIds.reduce((max, entry) => Math.max(max, entry.id), 0);
      const indexedSources: [string, string][] = Array.from(
        { length: maxId + 1 },
        (_, id) => [`__unknown_source_${id}__`, ""]
      );

      for (const { path, id } of sourcesWithIds) {
        let content: string | null = null;
        const inputEntry = inputSources[path];
        if (typeof inputEntry === 'string') {
          content = inputEntry;
        } else if (inputEntry && typeof inputEntry === 'object' && (inputEntry as any).content) {
          content = (inputEntry as any).content;
        }

        if (!content && sourcesFromRaw[path]) {
          content = sourcesFromRaw[path];
        }

        if (!content) {
          const fileName = path.split('/').pop() || path;
          for (const [srcPath, srcContent] of Object.entries(inputSources)) {
            if (srcPath.endsWith(fileName)) {
              if (typeof srcContent === 'string') {
                content = srcContent;
              } else if (srcContent && typeof srcContent === 'object' && (srcContent as any).content) {
                content = (srcContent as any).content;
              }
              if (content) break;
            }
          }
        }

        indexedSources[id] = [path, content || ''];
      }

      sourceVec = indexedSources;
    }
  }

  // Fallback to old behavior if output.sources doesn't have IDs
  if (sourceVec.length === 0) {
    const rawSources = (raw as any).sources || {};
    let srcObj =
      (primaryAddr && (rawSources as any)[primaryAddr]?.Source?.sources) ||
      (Object.values(rawSources)[0] as any)?.Source?.sources ||
      {};

    // Fallback: Check artifact.sources (Standard JSON format)
    if (Object.keys(srcObj).length === 0 && art?.sources) {
      const artifactSrcObj: Record<string, string> = {};
      Object.entries(art.sources).forEach(([path, value]) => {
        if (typeof value === 'string') {
          artifactSrcObj[path] = value;
        } else if (value && typeof value === 'object' && (value as any).content) {
          artifactSrcObj[path] = (value as any).content;
        }
      });
      if (Object.keys(artifactSrcObj).length > 0) {
        srcObj = artifactSrcObj;
      }
    }

    sourceVec = Object.entries(srcObj as Record<string, string>);
  }

  if (!sourceVec.length) {
    return null;
  }
  const bytes: number[] = [];
  for (let i = 0; i < bytecodeHex.length; i += 2) {
    bytes.push(parseInt(bytecodeHex.slice(i, i + 2), 16));
  }
  let pc = 0;
  const opList: { idx: number; pc: number; op: number }[] = [];
  let idx = 0;
  while (pc < bytes.length) {
    const op = bytes[pc];
    opList.push({ idx, pc, op });
    const pushLen = op >= 0x60 && op <= 0x7f ? op - 0x5f : 0;
    pc += 1 + pushLen;
    idx++;
  }
  let last = ["0", "0", "-1", ""];
  const pcMapFull = new Map<number, PcInfo>();
  for (const { idx: opIdx, pc } of opList) {
    const seg = srcMap[opIdx] || "";
    if (seg) {
      const parts = seg.split(":");
      if (parts[0] !== "") last[0] = parts[0];
      if (parts[1] !== "") last[1] = parts[1];
      if (parts[2] !== "") last[2] = parts[2];
      if (parts[3] !== undefined) last[3] = parts[3]; // Jump type can be empty string
    }

    // Extract jump type FIRST - we always want this for internal function call detection
    // Even when file index is invalid (compiler-generated code), jumpType='i' tells us it's a function call
    const jumpType = (last[3] === 'i' || last[3] === 'o' || last[3] === '-') ? last[3] : '';

    const fileIdx = parseInt(last[2], 10);
    if (Number.isNaN(fileIdx) || fileIdx < 0 || fileIdx >= sourceVec.length) {
      // File index invalid - store just the jumpType (important for detecting internal calls)
      // This happens for compiler-generated code, library calls, etc.
      if (jumpType) {
        pcMapFull.set(pc, { jumpType: jumpType as PcInfo['jumpType'] });
      }
      continue;
    }

    const offset = parseInt(last[0], 10) || 0;
    const [filePath, content] = sourceVec[fileIdx];
    // Extract just the filename from the full path (e.g., 'contracts/Uni.sol' -> 'Uni.sol')
    const fileName = filePath.split('/').pop() || filePath;
    let acc = 0;
    let line = 1;
    const parts = (content as string).split("\n");
    for (let i = 0; i < parts.length; i++) {
      acc += parts[i].length + 1;
      if (acc > offset) {
        line = i + 1;
        break;
      }
      line = i + 1;
    }
    pcMapFull.set(pc, { line, file: fileName, jumpType: jumpType as PcInfo['jumpType'] });
  }
  return pcMapFull;
}
