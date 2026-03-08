/**
 * Phase 1: Initialize decode trace context.
 * Extracts sources, builds PC maps, creates opcode rows, computes gas deltas.
 * Lines ~1400-2362 of original traceDecoder.ts
 */

import { ethers } from "ethers";
import type { RawTrace, DecodedTraceRow, PcInfo, DecodeTraceContext, FunctionRange } from './types';
import { opcodeNames, STATIC_GAS_COSTS, getStaticGasCost } from './opcodes';
import { formatAbiVal } from './formatting';
import { parseFunctions, parseModifiers, parseFunctionSignatures, fnForLine } from './sourceParser';
import { buildFullPcLineMap } from './pcMapper';
import { getCallFrames } from './stackDecoding';

type ArtifactSourceValue = string | { content?: string };
type FunctionSignatureMap = Record<string, unknown>;
type AbiInputLike = { type?: string };
type AbiItemLike = {
  type?: string;
  name?: string;
  inputs?: AbiInputLike[];
};

export function phaseInit(raw: RawTrace): DecodeTraceContext {
  const callFrames = getCallFrames(raw);
  const call = callFrames[0];
  const sources = (raw as any).sources || {};
  const artifacts = (raw as any).artifacts || {};

  const firstSourceKey = Object.keys(sources)[0];
  const firstSource = firstSourceKey ? sources[firstSourceKey] : null;
  const sourceFiles = firstSource?.Source?.sources;

  // Combine sources from ALL artifacts for Diamond proxy patterns
  const allArtifactSources: Record<string, ArtifactSourceValue> = {};

  Object.entries(artifacts).forEach(([artifactAddr, artifact]) => {
    const artSources =
      (artifact as any)?.input?.sources ||
      (artifact as any)?.sources ||
      (typeof (artifact as any)?.meta?.SourceCode === 'object' ? (artifact as any).meta.SourceCode.sources : null);

    if (artSources && typeof artSources === 'object') {
      Object.entries(artSources).forEach(([path, content]) => {
        const contentObj = content as string | { content?: string } | null;
        const newContent = typeof contentObj === 'string' ? contentObj : contentObj?.content;
        const existingContent = allArtifactSources[path] as string | { content?: string } | null;
        const existingContentStr = typeof existingContent === 'string' ? existingContent : existingContent?.content;

        const newLineCount = newContent?.split('\n').length || 0;
        const existingLineCount = existingContentStr?.split('\n').length || 0;

        if (!allArtifactSources[path] || newLineCount > existingLineCount) {
          allArtifactSources[path] = content as ArtifactSourceValue;
        }
      });
    }
  });

  // Use combined sources from all artifacts
  const artifactSources = allArtifactSources;

  const primary =
    (call?.code_address &&
      (sources as Record<string, any>)[call.code_address]) ||
    (call?.target && (sources as Record<string, any>)[call.target]) ||
    undefined;
  const primarySourceObj =
    primary &&
    (primary as Record<string, any>).Source &&
    (primary as Record<string, any>).Source.sources
      ? (primary as Record<string, any>).Source.sources
      : undefined;
  const primarySourcesFallback =
    !primary && Object.values(sources || {}).length
      ? (Object.values(sources)[0] as any)?.Source?.sources
      : undefined;

  // Extract sources from ALL addresses in raw.sources for multi-contract traces
  const allAddressSources: Record<string, string> = {};
  Object.entries(sources as Record<string, any>).forEach(([_addr, sourceData]) => {
    const sourcesObj = sourceData?.Source?.sources;
    if (sourcesObj && typeof sourcesObj === 'object') {
      Object.entries(sourcesObj).forEach(([path, content]) => {
        if (typeof content === 'string' && !allAddressSources[path]) {
          allAddressSources[path] = content;
        }
      });
    }
  });

  // Also check artifact.sources (Standard JSON format)
  const artifactSourcesContent: Record<string, string> = {};
  if (Object.keys(artifactSources).length > 0) {
    Object.entries(artifactSources).forEach(([path, value]) => {
      if (typeof value === 'string') {
        artifactSourcesContent[path] = value;
      } else if (value && typeof value === 'object' && (value as any).content) {
        artifactSourcesContent[path] = (value as any).content;
      }
    });
  }

  const sourceTexts: Record<string, string> = {};
  const usableSources = (Object.keys(artifactSourcesContent).length > 0 ? artifactSourcesContent : undefined)
    || primarySourceObj
    || primarySourcesFallback;
  if (usableSources) {
    Object.entries(usableSources).forEach(([p, v]) => {
      sourceTexts[p] = v as string;
    });
  }

  // Add ALL artifact sources to sourceTexts for multi-contract traces
  Object.entries(allArtifactSources).forEach(([path, content]) => {
    if (!sourceTexts[path]) {
      const sourceContent = typeof content === 'string' ? content : (content as any)?.content || '';
      if (sourceContent) {
        sourceTexts[path] = sourceContent;
      }
    }
  });

  // Also add sources from raw.sources (all addresses) for multi-contract traces
  Object.entries(allAddressSources).forEach(([path, content]) => {
    if (!sourceTexts[path]) {
      sourceTexts[path] = content;
    }
  });

  const primaryContent =
    usableSources && Object.keys(usableSources).length
      ? usableSources[Object.keys(usableSources)[0]]
      : null;
  const sourceLines = (primaryContent || "No source available").split("\n");

  // Parse functions from ALL source files
  let fnRanges: FunctionRange[] = [];
  let fnSignatures: FunctionSignatureMap = {};
  const fnRangesPerFile = new Map<string, FunctionRange[]>();
  const modifierRangesPerFile = new Map<string, FunctionRange[]>();
  const fnSignaturesPerFile = new Map<string, FunctionSignatureMap>();

  const allSourcesForParsing: Record<string, ArtifactSourceValue> = {};
  if (usableSources) {
    Object.entries(usableSources).forEach(([path, content]) => {
      allSourcesForParsing[path] = content as ArtifactSourceValue;
    });
  }
  Object.entries(allArtifactSources).forEach(([path, content]) => {
    if (!allSourcesForParsing[path]) {
      allSourcesForParsing[path] = content;
    }
  });

  Object.entries(allSourcesForParsing).forEach(([path, content]) => {
    const sourceContent = typeof content === 'string' ? content : (content as any)?.content || '';
    if (!sourceContent) return;
    const ranges = parseFunctions(sourceContent);
    const modifierRanges = parseModifiers(sourceContent);
    const signatures = parseFunctionSignatures(sourceContent);

    const fileName = path.split('/').pop() || path;
    fnRangesPerFile.set(fileName, ranges);
    fnRangesPerFile.set(path, ranges);
    modifierRangesPerFile.set(fileName, modifierRanges);
    modifierRangesPerFile.set(path, modifierRanges);
    fnRanges = [...fnRanges, ...ranges];

    fnSignaturesPerFile.set(fileName, signatures);
    fnSignaturesPerFile.set(path, signatures);
    fnSignatures = { ...fnSignatures, ...signatures };
  });

  // Get ABI - combine ALL artifacts' ABIs for Diamond contracts
  let iface: ethers.utils.Interface | null = null;
  const combinedAbi: AbiItemLike[] = [];
  const seenSignatures = new Set<string>();

  const addAbiItems = (abiArray: AbiItemLike[]) => {
    for (const item of abiArray) {
      const sigKey = item.type === 'event' || item.type === 'function'
        ? `${item.type}:${item.name}:${(item.inputs || []).map((i) => i.type).join(',')}`
        : JSON.stringify(item);
      if (!seenSignatures.has(sigKey)) {
        seenSignatures.add(sigKey);
        combinedAbi.push(item);
      }
    }
  };

  if (raw.artifacts) {
    for (const artifactKey of Object.keys(raw.artifacts)) {
      const artifact = (raw.artifacts as any)[artifactKey];
      const directAbi = artifact?.output?.abi || artifact?.meta?.ABI;
      if (directAbi) {
        try {
          const abiArray = typeof directAbi === 'string' ? JSON.parse(directAbi) : directAbi;
          if (Array.isArray(abiArray)) addAbiItems(abiArray as AbiItemLike[]);
        } catch {}
      }
      const contractsObj = artifact?.output?.contracts;
      if (contractsObj && typeof contractsObj === 'object') {
        for (const fileName of Object.keys(contractsObj)) {
          const contractsInFile = contractsObj[fileName];
          if (contractsInFile && typeof contractsInFile === 'object') {
            for (const contractName of Object.keys(contractsInFile)) {
              const contractData = contractsInFile[contractName];
              if (Array.isArray(contractData?.abi)) addAbiItems(contractData.abi as AbiItemLike[]);
            }
          }
        }
      }
    }
  }

  if (combinedAbi.length > 0) {
    try {
      iface = new ethers.utils.Interface(combinedAbi);
    } catch {}
  }

  // Extract snapshots
  let snaps: any[] = [];
  if (Array.isArray((raw as any).snapshots)) {
    snaps = (raw as any).snapshots;
  } else if (Array.isArray((raw as any).trace)) {
    snaps = (raw as any).trace;
  } else if (Array.isArray((raw as any).inner?.snapshots)) {
    snaps = (raw as any).inner.snapshots;
  }
  if (snaps.length === 0 && Array.isArray((raw as any).opcodeTrace)) {
    snaps = (raw as any).opcodeTrace.map((entry: any) => ({
      id: entry.id ?? entry.ID,
      frame_id: entry.frame_id ?? entry.frameId,
      target_address: entry.target_address ?? entry.targetAddress,
      bytecode_address: entry.bytecode_address ?? entry.bytecodeAddress,
      detail: {
        Opcode: {
          id: entry.id ?? entry.ID,
          pc: entry.pc,
          opcode: entry.opcode,
          gas_remaining: entry.gas_remaining ?? entry.gasRemaining,
          gas_used: entry.gas_used ?? entry.gasUsed,
          storage_read: entry.storage_read ?? entry.storageRead,
          storage_write: entry.storage_write ?? entry.storageWrite,
          stack_depth: entry.stack_depth ?? entry.stackDepth,
          stack_top: entry.stack_top ?? entry.stackTop,
        },
      },
    }));
  }

  // Extract trace entries for call depth
  let traceEntries: any[] = [];
  if (Array.isArray((raw as any).inner?.inner)) {
    traceEntries = (raw as any).inner.inner;
  } else if (Array.isArray((raw as any).inner)) {
    traceEntries = (raw as any).inner;
  }

  // Build maps from trace_id to depth and parent_id
  const traceIdToDepth = new Map<number, number>();
  const traceIdToParentId = new Map<number, number | null>();
  traceEntries.forEach((entry: any) => {
    const id = entry.id ?? entry.trace_id;
    const depth = entry.depth ?? entry.call_depth ?? 0;
    const parentId = entry.parent_id ?? null;
    if (id !== undefined) {
      traceIdToDepth.set(id, depth);
      traceIdToParentId.set(id, parentId);
    }
  });

  const childrenByParentId = new Map<number, number[]>();
  traceIdToParentId.forEach((parentId, childId) => {
    if (parentId !== null && parentId !== undefined) {
      const children = childrenByParentId.get(parentId) || [];
      children.push(childId);
      childrenByParentId.set(parentId, children);
    }
  });

  const primaryAddr =
    raw.inner?.inner?.[0]?.code_address ||
    raw.inner?.inner?.[0]?.codeAddress ||
    raw.inner?.inner?.[0]?.target ||
    null;

  // Build trace_id to code_address and target maps
  const traceIdToCodeAddr = new Map<number, string>();
  const traceIdToTarget = new Map<number, string>();
  traceEntries.forEach((entry: any) => {
    const id = entry.id ?? entry.trace_id;
    const traceId = typeof id === 'number' ? id : parseInt(String(id), 10);
    const codeAddr = entry.code_address || entry.codeAddress;
    const target = entry.target;
    if (id !== undefined && !isNaN(traceId)) {
      if (codeAddr) {
        traceIdToCodeAddr.set(traceId, codeAddr.toLowerCase());
      } else if (target) {
        traceIdToCodeAddr.set(traceId, target.toLowerCase());
      }
      if (target) {
        traceIdToTarget.set(traceId, target.toLowerCase());
      }
    }
  });

  // Extract storageDiffs
  const storageDiffsBySlot = new Map<string, { before: string; after: string }>();
  const rawStorageDiffs = (raw as any).storageDiffs || (raw as any).storage_diffs || [];
  if (Array.isArray(rawStorageDiffs)) {
    rawStorageDiffs.forEach((diff: any) => {
      const slot = diff.slot?.toLowerCase();
      if (slot) {
        storageDiffsBySlot.set(slot, {
          before: diff.before || '0x0',
          after: diff.after || '0x0',
        });
      }
    });
  }

  // Build PC maps for all contracts
  const pcMapsPerContract = new Map<string, Map<number, PcInfo>>();
  const pcMapsFilteredPerContract = new Map<string, Map<number, number>>();

  if (raw.opcodeLines && typeof raw.opcodeLines === 'object') {
    Object.entries(raw.opcodeLines).forEach(([key, value]) => {
      if (key.endsWith('_filtered')) return;
      const addr = key.toLowerCase();
      if (Array.isArray(value)) {
        const pcMap = new Map<number, PcInfo>(
          value.map((o: any) => [o.pc, {
            line: o.line,
            file: o.file || undefined,
            jumpType: o.jumpType || ''
          } as PcInfo])
        );
        pcMapsPerContract.set(addr, pcMap);
      }
    });
    Object.entries(raw.opcodeLines).forEach(([key, value]) => {
      if (!key.endsWith('_filtered')) return;
      const addr = key.replace('_filtered', '').toLowerCase();
      if (Array.isArray(value)) {
        const pcMap = new Map<number, number>(
          value.map((o: any) => [o.pc, o.line])
        );
        pcMapsFilteredPerContract.set(addr, pcMap);
      }
    });
  }

  // Fallback to primary address lookup
  const pcLines =
    primaryAddr && raw.opcodeLines && (
      raw.opcodeLines[primaryAddr] ||
      raw.opcodeLines[primaryAddr.toLowerCase()]
    );
  const pcLinesFiltered =
    primaryAddr &&
    raw.opcodeLines &&
    (raw.opcodeLines[`${primaryAddr}_filtered`] ||
      raw.opcodeLines[`${primaryAddr.toLowerCase()}_filtered`]);
  let pcMapFiltered: Map<number, number> | null = null;
  let pcMapFullFromTrace: Map<number, PcInfo> | null = null;
  if (pcLines && Array.isArray(pcLines)) {
    pcMapFullFromTrace = new Map(pcLines.map((o: any) => [o.pc, {
      line: o.line,
      file: o.file || undefined,
      jumpType: o.jumpType || ''
    } as PcInfo]));
  }
  if (pcLinesFiltered && Array.isArray(pcLinesFiltered)) {
    pcMapFiltered = new Map(pcLinesFiltered.map((o: any) => [o.pc, o.line]));
  }
  const pcMapFullFromArtifacts = buildFullPcLineMap(raw, primaryAddr, call?.bytecode);
  let pcMapFull = pcMapFullFromTrace || pcMapFullFromArtifacts;

  // Merge PC maps if trace lacks jump type info but artifacts have it
  if (pcMapFullFromTrace && pcMapFullFromArtifacts) {
    const traceHasJumpTypes = Array.from(pcMapFullFromTrace.values()).some(
      (info) => info.jumpType === 'i' || info.jumpType === 'o' || info.jumpType === '-'
    );
    if (!traceHasJumpTypes) {
      const merged = new Map<number, PcInfo>();
      pcMapFullFromTrace.forEach((info, pc) => {
        const artifactInfo = pcMapFullFromArtifacts.get(pc);
        merged.set(pc, {
          line: info.line,
          file: info.file || artifactInfo?.file,
          jumpType: artifactInfo?.jumpType || info.jumpType,
        });
      });
      pcMapFullFromArtifacts.forEach((info, pc) => {
        if (!merged.has(pc)) {
          merged.set(pc, info);
        }
      });
      pcMapFull = merged;
    }
  }

  // Merge jumpType into per-contract PC maps
  const allArtifactAddrs = Object.keys((raw as any).artifacts || {}).map(a => a.toLowerCase());
  for (const artAddr of allArtifactAddrs) {
    const perContractPcMap = pcMapsPerContract.get(artAddr);
    const artBytecode = (raw as any).artifacts?.[artAddr]?.deployedBytecode?.object ||
                        (raw as any).artifacts?.[artAddr]?.meta?.Bytecode;
    const artifactPcMap = buildFullPcLineMap(raw, artAddr, artBytecode);

    if (!perContractPcMap || perContractPcMap.size === 0) {
      if (artifactPcMap && artifactPcMap.size > 0) {
        pcMapsPerContract.set(artAddr, artifactPcMap);
      }
      continue;
    }

    const hasJumpTypes = Array.from(perContractPcMap.values()).some(
      (info) => info.jumpType === 'i' || info.jumpType === 'o' || info.jumpType === '-'
    );
    if (!hasJumpTypes) {
      if (artifactPcMap && artifactPcMap.size > 0) {
        const merged = new Map<number, PcInfo>();
        perContractPcMap.forEach((info, pc) => {
          const artifactInfo = artifactPcMap.get(pc);
          merged.set(pc, {
            line: info.line,
            file: info.file || artifactInfo?.file,
            jumpType: artifactInfo?.jumpType || info.jumpType,
          });
        });
        artifactPcMap.forEach((info, pc) => {
          if (!merged.has(pc)) {
            merged.set(pc, info);
          }
        });
        pcMapsPerContract.set(artAddr, merged);
      }
    }
  }

  // Identify unverified contracts
  const hasAnyArtifacts = pcMapsPerContract.size > 0;
  const distinctCodeAddrs = new Set<string>(traceIdToCodeAddr.values());
  const hasMultipleContractMaps = distinctCodeAddrs.size > 1 || pcMapsPerContract.size > 1;
  const unverifiedTraceIds = new Set<number>();
  if (hasAnyArtifacts) {
    traceIdToCodeAddr.forEach((codeAddr, traceId) => {
      if (!pcMapsPerContract.has(codeAddr)) {
        unverifiedTraceIds.add(traceId as any);
      }
    });
  }

  const getPcInfoForOpcode = (pc: number, frameId: any): PcInfo | undefined => {
    if (Array.isArray(frameId) && frameId.length >= 1) {
      const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
      if (unverifiedTraceIds.has(traceId)) {
        // Do not borrow lines from the primary contract for unverified frames.
        // Cross-contract fallback attribution is a major source of false src maps.
        return undefined;
      }
      const codeAddr = traceIdToCodeAddr.get(traceId);
      if (codeAddr) {
        const contractPcMap = pcMapsPerContract.get(codeAddr);
        if (contractPcMap?.has(pc)) return contractPcMap.get(pc);
        if (hasMultipleContractMaps) return undefined;
      }
    }
    return pcMapFull?.get(pc);
  };

  const opcodeDetails = snaps.map((s: any) => s.detail?.Opcode).filter(Boolean);

  // Extract gas_remaining from raw text to preserve BigInt precision
  let rawText = (raw as any).__rawText || "";
  let gasMatches: string[] = [];
  if (rawText) {
    const snapshotsMatch = rawText.match(/"snapshots"\s*:\s*\[/);
    if (snapshotsMatch && snapshotsMatch.index !== undefined) {
      const snapshotsText = rawText.slice(snapshotsMatch.index);
      gasMatches = Array.from(
        snapshotsText.matchAll(/"gas_remaining"\s*:\s*(\d+)/g),
        (m: RegExpMatchArray) => m[1]
      );
    }
  }
  if (gasMatches.length === 0 && snaps.length > 0) {
    try {
      const snapshotsText = JSON.stringify(snaps);
      gasMatches = Array.from(
        snapshotsText.matchAll(/"gas_remaining"\s*:\s*(\d+)/g),
        (m: RegExpMatchArray) => m[1]
      );
    } catch {}
  }

  let gasIdx = 0;
  const opRows: DecodedTraceRow[] = opcodeDetails
    .sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0))
    .map((cur: any, _i: number) => {
      const name = (opcodeNames as any)[cur.opcode] || `OP_${cur.opcode}`;
      const gasRaw = gasMatches[gasIdx++] || String(cur.gas_remaining ?? 0);
      const stackValues = Array.isArray(cur.stack) ? cur.stack : undefined;
      const stackDepth = stackValues?.length ?? cur.stack_depth ?? cur.stackDepth ?? undefined;
      const stackTop =
        stackValues && stackValues.length > 0
          ? stackValues[stackValues.length - 1]
          : cur.stack_top ?? cur.stackTop ?? undefined;

      let depth: number | undefined;
      const frameId = cur.frame_id;
      if (Array.isArray(frameId) && frameId.length >= 1) {
        const traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
        if (traceIdToDepth.has(traceId)) depth = traceIdToDepth.get(traceId);
      } else if (frameId && typeof frameId === 'object' && (frameId as any).trace_id !== undefined) {
        const traceId = (frameId as any).trace_id;
        if (traceIdToDepth.has(traceId)) depth = traceIdToDepth.get(traceId);
      }
      if (depth === undefined && cur.depth !== undefined) depth = cur.depth;

      // Extract storage info from stack for SLOAD/SSTORE
      let storageRead = cur.storage_read;
      let storageWrite = cur.storage_write;
      const st = stackValues ?? [];

      if (name === 'SLOAD' && st.length >= 1 && !storageRead) {
        storageRead = { slot: st[st.length - 1], value: undefined };
      }

      if (name === 'SSTORE' && st.length >= 2) {
        const extractedSlot = st[st.length - 1];
        const extractedValue = st[st.length - 2];
        const slotKey = extractedSlot?.toLowerCase();
        const storageDiff = slotKey ? storageDiffsBySlot.get(slotKey) : undefined;
        const correctBefore = storageDiff?.before;
        storageWrite = {
          slot: extractedSlot,
          after: extractedValue,
          before: correctBefore,
        };
      }

      return {
        kind: "opcode" as const,
        id: cur.id,
        name,
        gasUsed: cur.gas_used !== undefined ? String(cur.gas_used) : undefined,
        gasDelta: "0",
        gasRemaining: gasRaw,
        pc: cur.pc,
        stack: stackValues,
        stackDepth,
        stackTop,
        memory: cur.memory,
        storage_read: storageRead,
        storage_write: storageWrite,
        storage_diff: undefined,
        fn: undefined,
        contract: undefined,
        frame_id: cur.frame_id,
        depth,
      };
    });

  // Compute gas deltas
  function toBig(val: any): bigint | null {
    try { return BigInt(val); } catch { return null; }
  }

  const hasGasUsed = opRows.some(r => {
    if (r.gasUsed === undefined) return false;
    const gasVal = typeof r.gasUsed === 'string' ? parseInt(r.gasUsed, 10) : r.gasUsed;
    return gasVal > 0;
  });

  let useStaticGasCosts = false;
  if (!hasGasUsed && opRows.length > 2) {
    const validGasRows = opRows.filter(r => r.gasRemaining !== null && r.gasRemaining !== undefined && r.gasRemaining !== "0");
    if (validGasRows.length >= 3) {
      const firstGas = toBig(validGasRows[0].gasRemaining);
      const secondGas = toBig(validGasRows[1].gasRemaining);
      const thirdGas = toBig(validGasRows[2].gasRemaining);
      if (firstGas !== null && secondGas !== null && thirdGas !== null) {
        if (firstGas === secondGas && secondGas === thirdGas) {
          useStaticGasCosts = true;
        }
      }
    } else {
      useStaticGasCosts = true;
    }
  }

  let gasCum = 0n;
  for (let i = 0; i < opRows.length; i++) {
    const cur = opRows[i];
    const next = opRows[i + 1];

    const gasUsedVal = cur.gasUsed !== undefined
      ? (typeof cur.gasUsed === 'string' ? parseInt(cur.gasUsed, 10) : cur.gasUsed)
      : 0;
    if (gasUsedVal > 0) {
      cur.gasDelta = String(gasUsedVal);
    } else if (useStaticGasCosts) {
      cur.gasDelta = getStaticGasCost(cur.name).toString();
    } else if (!next) {
      cur.gasDelta = "0";
    } else {
      const gCur = toBig(cur.gasRemaining);
      const gNext = toBig(next.gasRemaining);
      if (gCur !== null && gNext !== null) {
        const delta = gCur - gNext;
        const MAX_SINGLE_OPCODE_GAS = 100000n;
        if (delta > MAX_SINGLE_OPCODE_GAS || delta < 0n) {
          const zeroGasOpcodes = ['STOP', 'RETURN', 'REVERT', 'INVALID'];
          const staticCost = zeroGasOpcodes.includes(cur.name) ? 0 : getStaticGasCost(cur.name);
          cur.gasDelta = staticCost.toString();
        } else {
          cur.gasDelta = delta.toString();
        }
      } else {
        cur.gasDelta = "0";
      }
    }

    try {
      gasCum += BigInt(cur.gasDelta || "0");
      cur.gasCum = gasCum.toString();
    } catch {
      cur.gasCum = undefined;
    }
  }

  // Process opRows using per-contract PC maps for accurate function resolution
  opRows.forEach((r) => {
    let isInUnverifiedFrame = false;
    let traceId: number | undefined;
    if (Array.isArray(r.frame_id) && r.frame_id.length >= 1) {
      traceId = typeof r.frame_id[0] === 'number' ? r.frame_id[0] : parseInt(String(r.frame_id[0]), 10);
    } else if (r.frame_id && typeof r.frame_id === 'object' && (r.frame_id as any).trace_id !== undefined) {
      traceId = (r.frame_id as any).trace_id;
    }
    if (traceId !== undefined && unverifiedTraceIds.has(traceId)) {
      isInUnverifiedFrame = true;
      r.hasNoSourceMaps = true;
    }

    const pcInfo = getPcInfoForOpcode(r.pc, r.frame_id);
    if (pcInfo) {
      r.line = pcInfo.line;
      r.sourceFile = pcInfo.file || null;
      if (!isInUnverifiedFrame && r.line !== undefined && pcInfo.file) {
        let fileFnRanges = fnRangesPerFile.get(pcInfo.file);
        if (!fileFnRanges || fileFnRanges.length === 0) {
          const filename = pcInfo.file.split('/').pop() || pcInfo.file;
          fileFnRanges = fnRangesPerFile.get(filename);
        }
        if (fileFnRanges && fileFnRanges.length > 0) {
          r.fn = fnForLine(fileFnRanges, r.line);
        }
      }
    }
    if (!isInUnverifiedFrame && r.line !== undefined && !r.fn && !hasMultipleContractMaps) {
      r.fn = fnForLine(fnRanges, r.line);
    }
    if (!r.contract && r.fn) {
      r.contract = undefined;
    }
  });

  opRows.forEach((r) => {
    if (r.hasNoSourceMaps || r.line !== undefined) return;

    let traceId: number | undefined;
    const frameId = r.frame_id;
    if (Array.isArray(frameId) && frameId.length >= 1) {
      traceId = typeof frameId[0] === 'number' ? frameId[0] : parseInt(String(frameId[0]), 10);
    } else if (frameId && typeof frameId === 'object' && (frameId as any).trace_id !== undefined) {
      traceId = (frameId as any).trace_id;
    }

    let filteredLine: number | undefined;
    if (traceId !== undefined) {
      const codeAddr = traceIdToCodeAddr.get(traceId);
      if (codeAddr) {
        filteredLine = pcMapsFilteredPerContract.get(codeAddr)?.get(r.pc);
      }
    }

    if (filteredLine === undefined && !hasMultipleContractMaps && pcMapFiltered?.has(r.pc)) {
      filteredLine = pcMapFiltered.get(r.pc);
    }

    if (filteredLine !== undefined) {
      r.line = filteredLine;
      if (!hasMultipleContractMaps) {
        r.fn = fnForLine(fnRanges, filteredLine);
      }
      r.contract = null;
    }
  });

  // Parse call input to extract function name and arguments
  let inputParsed: { sig: string; args: any[]; fragment: any } | null = null;
  let decodedInputArgs: { name: string; type: string; value: string }[] | null = null;

  if (iface && call?.input) {
    try {
      const parsed = iface.parseTransaction({ data: call.input });
      if (parsed) {
        const argsArray = Array.from(parsed.args);
        inputParsed = { sig: parsed.signature, args: argsArray, fragment: parsed.functionFragment };
        if (parsed.functionFragment?.inputs) {
          decodedInputArgs = parsed.functionFragment.inputs.map((inp: any, idx: number) => ({
            name: inp.name || `arg${idx}`,
            type: inp.type,
            value: formatAbiVal(inp.type, parsed.args[idx]),
          }));
        }
      }
    } catch {}
  }

  // Get contract name from first artifact metadata
  const mainArtifactKey = raw.artifacts ? Object.keys(raw.artifacts)[0] : null;
  const mainArtifact = mainArtifactKey ? (raw.artifacts as any)[mainArtifactKey] : null;
  const contractName = mainArtifact?.meta?.Name || mainArtifact?.meta?.ContractName || null;

  // Build context
  const ctx: DecodeTraceContext = {
    raw,
    callFrames,
    call,
    snaps,
    traceEntries,
    sourceTexts,
    sourceLines,
    allArtifactSources,
    fnRanges,
    fnSignatures,
    fnRangesPerFile,
    modifierRangesPerFile,
    fnSignaturesPerFile,
    iface,
    combinedAbi,
    pcMapFull,
    pcMapFiltered,
    pcMapsPerContract,
    pcMapsFilteredPerContract,
    traceIdToDepth,
    traceIdToParentId,
    traceIdToCodeAddr,
    traceIdToTarget,
    childrenByParentId,
    storageDiffsBySlot,
    primaryAddr,
    hasAnyArtifacts,
    unverifiedTraceIds,
    codeAddrToContractName: new Map(),
    codeAddrToInterface: new Map(),
    codeAddrToFnRanges: new Map(),
    codeAddrToFnSignatures: new Map(),
    opRows,
    callFrameRows: [],
    rowsWithJumps: [],
    fnCallInfos: [],
    fnCallInfoById: new Map(),
    opIdToInternalParent: new Map(),
    rawEvents: [],
    implementationToProxy: new Map(),
  };

  return ctx;
}
