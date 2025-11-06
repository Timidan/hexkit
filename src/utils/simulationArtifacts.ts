import { ethers } from "ethers";
import type { SimulationResult } from "../types/transaction";

export type SimulationCallNode = {
  frameKey: string;
  type?: string;
  from?: string;
  to?: string;
  functionName?: string;
  label?: string;
  gasUsed?: string | number;
  value?: string | number;
  input?: string;
  output?: string;
  depth?: number;
  error?: string | null;
  children?: SimulationCallNode[];
};

export type SimulationEventEntry = {
  name?: string;
  signature?: string;
  address?: string;
  decoded?: unknown;
  data?: unknown;
};

export type SimulationStorageDiffEntry = {
  address?: string;
  slot?: string;
  key?: string;
  before?: string;
  after?: string;
  value?: string;
};

export type SimulationAssetChangeEntry = {
  address?: string;
  symbol?: string;
  amount?: string;
  rawAmount?: string;
  direction?: "in" | "out";
  counterparty?: string;
  name?: string;
};

export type SimulationSnapshotEntry = {
  id?: number;
  frameId?: number;
  type: "opcode" | "hook";
  targetAddress?: string;
  bytecodeAddress?: string;
  pc?: number;
  opcode?: number;
  stackTop?: string | null;
  stackDepth?: number;
  calldata?: string | null;
  sourcePath?: string | null;
  sourceOffset?: number | null;
  sourceLength?: number | null;
  locals?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
};

export interface SimulationArtifacts {
  callTree: SimulationCallNode[];
  events: SimulationEventEntry[];
  assetChanges: SimulationAssetChangeEntry[];
  storageDiffs: SimulationStorageDiffEntry[];
  snapshots: SimulationSnapshotEntry[];
  rawReturnData: string | null;
  rawPayload: string | null;
}

export const ensureArray = <T,>(value: unknown, mapFn?: (item: any) => T): T[] => {
  if (Array.isArray(value)) {
    return mapFn ? value.map(mapFn) : (value as T[]);
  }
  if (value && typeof value === "object") {
    return mapFn ? [mapFn(value)] : [value as T];
  }
  return [];
};

export const normalizeHex = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return value.startsWith("0x") ? value : `0x${value}`;
};

const normalizeTraceAddress = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return ethers.utils.getAddress(value);
  } catch {
    return value;
  }
};

const parseTraceValue = (value: unknown): ethers.BigNumber | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (ethers.BigNumber.isBigNumber(value)) {
    return ethers.BigNumber.from(value);
  }

  if (typeof value === "object") {
    const maybeHex =
      (value as any)?._hex ??
      (value as any)?.hex ??
      (value as any)?.value ??
      (value as any)?.raw;
    if (typeof maybeHex === "string") {
      try {
        return ethers.BigNumber.from(maybeHex);
      } catch {
        return null;
      }
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
        return ethers.BigNumber.from(trimmed);
      }
      return ethers.BigNumber.from(trimmed);
    } catch {
      return null;
    }
  }

  try {
    return ethers.BigNumber.from(value as any);
  } catch {
    return null;
  }
};

const normalizeAssetChangeEntry = (
  entry: any
): SimulationAssetChangeEntry | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const directionRaw = entry.direction ?? entry.flow ?? entry.type;
  const direction =
    directionRaw === "in" ||
    directionRaw === "out" ||
    directionRaw === "incoming" ||
    directionRaw === "outgoing"
      ? (directionRaw.startsWith("in") ? "in" : "out")
      : undefined;

  return {
    address: entry.address ?? entry.account ?? entry.owner ?? undefined,
    symbol:
      entry.symbol ??
      entry.token_symbol ??
      entry.tokenSymbol ??
      entry.asset ??
      undefined,
    amount: entry.amount ?? entry.display ?? entry.formatted ?? undefined,
    rawAmount:
      entry.rawAmount ??
      entry.raw_amount ??
      entry.raw ??
      entry.value ??
      entry.amount_raw ??
      undefined,
    direction,
    counterparty:
      entry.counterparty ??
      entry.counterParty ??
      entry.peer ??
      entry.from ??
      entry.to ??
      undefined,
    name:
      entry.name ?? entry.label ?? entry.description ?? entry.asset ?? undefined,
  };
};

const convertEdbTraceToArtifacts = (
  traceEntries: any[]
): {
  callTree: SimulationCallNode[];
  events: SimulationEventEntry[];
  assetChanges: SimulationAssetChangeEntry[];
} => {
  type InternalNode = SimulationCallNode & {
    __internalId: number;
    __children?: InternalNode[];
  };

  const nodes = new Map<number, InternalNode>();
  const childrenBucket = new Map<number, InternalNode[]>();
  const events: SimulationEventEntry[] = [];
  const assetChanges: SimulationAssetChangeEntry[] = [];

  const recordEthTransfer = (
    address: string | undefined,
    value: ethers.BigNumber,
    direction: "in" | "out",
    counterparty?: string
  ) => {
    if (!address || value.isZero()) {
      return;
    }
    const formatted = ethers.utils.formatEther(value);
    const prefix = direction === "in" ? "+" : "-";
    assetChanges.push({
      address,
      symbol: "ETH",
      name: "Ether",
      amount: `${prefix}${formatted}`,
      rawAmount: value.toString(),
      direction,
      counterparty,
    });
  };

  traceEntries.forEach((entryRaw: any) => {
    if (!entryRaw || typeof entryRaw !== "object") {
      return;
    }

    const id = Number(entryRaw.id ?? entryRaw.trace_id ?? entryRaw.index);
    if (!Number.isFinite(id)) {
      return;
    }

    const callType =
      entryRaw.call_type ??
      entryRaw.type ??
      entryRaw.kind ??
      (entryRaw.callType?.Call ?? entryRaw.callType);

    const fromAddress = normalizeTraceAddress(entryRaw.caller ?? entryRaw.from);
    const toAddress = normalizeTraceAddress(
      entryRaw.target ?? entryRaw.to ?? entryRaw.address
    );

    const result = entryRaw.result ?? {};
    const depthValue = Number(entryRaw.depth ?? 0);
    const errorValue =
      result?.Revert?.reason ||
      result?.Error?.reason ||
      result?.Revert?.output ||
      result?.Error?.output ||
      null;
    const node: InternalNode = {
      __internalId: id,
      frameKey: entryRaw.frame_key ?? `${id}:${depthValue}`,
      type:
        typeof callType === "string"
          ? callType
          : typeof callType === "object"
          ? Object.keys(callType)[0]
          : undefined,
      from: fromAddress,
      to: toAddress,
      functionName:
        entryRaw.target_label ??
        entryRaw.function_name ??
        entryRaw.functionName ??
        undefined,
      label:
        entryRaw.target_label ??
        entryRaw.label ??
        entryRaw.display ??
        undefined,
      depth: depthValue,
      error: typeof errorValue === "string" ? errorValue : null,
      gasUsed:
        result.gas_used ??
        result.gasUsed ??
        entryRaw.gas_used ??
        entryRaw.gasUsed,
      value: entryRaw.value,
      input: entryRaw.input,
      output:
        result.Success?.output ??
        result.success?.output ??
        result.output ??
        result.return_data ??
        result.returnData ??
        entryRaw.output,
      children: undefined,
    };

    nodes.set(id, node);

    const entryEvents = ensureArray(
      entryRaw.events ?? entryRaw.logs ?? entryRaw.event_logs
    );
    entryEvents.forEach((evt: any) => {
      events.push({
        name: evt?.name ?? evt?.event,
        signature: evt?.signature,
        address: evt?.address ?? node.to,
        decoded: evt?.args ?? evt?.decoded,
        data: evt,
      });
    });

    const transferValue =
      entryRaw.value ?? entryRaw.transfer_value ?? entryRaw.amount;
    const valueBigNumber = parseTraceValue(transferValue);
    if (valueBigNumber && !valueBigNumber.isZero()) {
      recordEthTransfer(fromAddress, valueBigNumber, "out", toAddress);
      recordEthTransfer(toAddress, valueBigNumber, "in", fromAddress);
    }
  });

  traceEntries.forEach((entryRaw: any) => {
    if (!entryRaw || typeof entryRaw !== "object") {
      return;
    }
    const id = Number(entryRaw.id ?? entryRaw.trace_id ?? entryRaw.index);
    const node = nodes.get(id);
    if (!node) {
      return;
    }
    const parentIdRaw =
      entryRaw.parent_id ??
      entryRaw.parentId ??
      entryRaw.parent_index ??
      entryRaw.parent;
    if (parentIdRaw === null || parentIdRaw === undefined) {
      return;
    }
    const parentId = Number(parentIdRaw);
    if (!Number.isFinite(parentId)) {
      return;
    }
    const bucket = childrenBucket.get(parentId) ?? ([] as InternalNode[]);
    bucket.push(node);
    childrenBucket.set(parentId, bucket);
  });

  const descendantIds = new Set<number>();
  childrenBucket.forEach((children, parentId) => {
    const parentNode = nodes.get(parentId);
    if (parentNode) {
      parentNode.__children = children;
    }
    children.forEach((child) => descendantIds.add(child.__internalId));
  });

  const stripInternalNode = (node: InternalNode): SimulationCallNode => {
    const {
      __internalId: _internal,
      __children = [],
      children: _ignoredChildren,
      ...rest
    } = node;
    const normalizedChildren = __children.map((child) => stripInternalNode(child));
    return {
      ...rest,
      children: normalizedChildren.length ? normalizedChildren : undefined,
    };
  };

  const roots: SimulationCallNode[] = [];
  nodes.forEach((node) => {
    if (!descendantIds.has(node.__internalId)) {
      roots.push(stripInternalNode(node));
    }
  });

  return { callTree: roots, events, assetChanges };
};

export const flattenCallTreeEntries = (
  nodes: SimulationCallNode[]
): SimulationCallNode[] => {
  const list: SimulationCallNode[] = [];
  const walk = (arr: SimulationCallNode[]) => {
    arr.forEach((node) => {
      list.push(node);
      if (node.children && node.children.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return list;
};

export const getCallNodeError = (node?: SimulationCallNode | null) =>
  node?.error ?? null;

export const extractSimulationArtifacts = (
  result: SimulationResult
): SimulationArtifacts => {
  const artifacts: SimulationArtifacts = {
    callTree: [],
    events: [],
    assetChanges: [],
    storageDiffs: [],
    snapshots: [],
    rawReturnData: null,
    rawPayload: null,
  };

  const rawTrace = result.rawTrace;
  if (rawTrace === null || rawTrace === undefined) {
    return artifacts;
  }

  if (typeof rawTrace === "string") {
    artifacts.rawPayload = rawTrace;
    artifacts.rawReturnData = normalizeHex(rawTrace);
    return artifacts;
  }

  if (Array.isArray(rawTrace)) {
    try {
      artifacts.rawPayload = JSON.stringify(rawTrace, null, 2);
    } catch {
      artifacts.rawPayload = null;
    }
    const converted = convertEdbTraceToArtifacts(rawTrace);
    artifacts.callTree = converted.callTree;
    artifacts.events = converted.events;
    artifacts.assetChanges = converted.assetChanges;
    return artifacts;
  }

  if (typeof rawTrace !== "object") {
    return artifacts;
  }

  const traceObj = rawTrace as Record<string, any>;
  try {
    artifacts.rawPayload = JSON.stringify(traceObj, null, 2);
  } catch {
    artifacts.rawPayload = null;
  }

  // Handle nested inner structure (EDB can have inner.inner)
  let innerTraceEntries = ensureArray(traceObj.inner);
  if (innerTraceEntries.length > 0) {
    // Check if there's another level of nesting (inner.inner)
    const firstInner = innerTraceEntries[0];
    if (firstInner && typeof firstInner === 'object' && firstInner.inner) {
      innerTraceEntries = ensureArray(firstInner.inner);
    }

    const converted = convertEdbTraceToArtifacts(innerTraceEntries);
    artifacts.callTree = converted.callTree;
    artifacts.events = converted.events;
    artifacts.assetChanges = converted.assetChanges;
  }

  if (artifacts.callTree.length === 0) {
    const treeCandidates = [
      traceObj.callTree,
      traceObj.trace,
      traceObj.calls,
      traceObj.callPath,
    ];
    for (const candidate of treeCandidates) {
      const nodes = ensureArray<SimulationCallNode>(candidate);
      if (nodes.length > 0) {
        artifacts.callTree = nodes;
        break;
      }
    }
  }

  if (artifacts.events.length === 0) {
    const eventCandidates = ensureArray(traceObj.events)
      .concat(ensureArray(traceObj.logs))
      .concat(ensureArray(traceObj.decodedLogs))
      .concat(ensureArray(traceObj.eventLogs));
    artifacts.events = eventCandidates.map((event: any) => ({
      name: event?.name || event?.event,
      signature: event?.signature,
      address: event?.address,
      decoded: event?.args ?? event?.decoded,
      data: event,
    }));
  }

  const serverAssetChanges = ensureArray(traceObj.assetChanges)
    .map((entry) => normalizeAssetChangeEntry(entry))
    .filter(Boolean) as SimulationAssetChangeEntry[];
  if (serverAssetChanges.length > 0) {
    artifacts.assetChanges = [...serverAssetChanges, ...artifacts.assetChanges];
  }

  const snapshotEntries = ensureArray(traceObj.snapshots);
  if (snapshotEntries.length > 0) {
    artifacts.snapshots = snapshotEntries
      .map((entry: any) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const detail = entry.detail ?? entry.Detail ?? entry;
        const opcodeDetail = detail?.Opcode ?? detail?.opcode;
        const hookDetail = detail?.Hook ?? detail?.hook;
        if (opcodeDetail) {
          const stackArray = ensureArray(opcodeDetail.stack).map((item) =>
            typeof item === "string" ? item : JSON.stringify(item)
          );
          return {
            id: entry.id ?? opcodeDetail.id,
            frameId: entry.frame_id ?? opcodeDetail.frame_id,
            type: "opcode" as const,
            targetAddress:
              entry.target_address ??
              opcodeDetail.target_address ??
              opcodeDetail.targetAddress,
            bytecodeAddress:
              entry.bytecode_address ??
              opcodeDetail.bytecode_address ??
              opcodeDetail.bytecodeAddress,
            pc: opcodeDetail.pc,
            opcode: opcodeDetail.opcode,
            stackTop: stackArray.length ? stackArray[stackArray.length - 1] : null,
            stackDepth: stackArray.length,
            calldata:
              opcodeDetail.calldata ??
              opcodeDetail.call_data ??
              opcodeDetail.callData ??
              null,
          };
        }
        if (hookDetail) {
          return {
            id: entry.id ?? hookDetail.id,
            frameId: entry.frame_id ?? hookDetail.frame_id,
            type: "hook" as const,
            targetAddress:
              entry.target_address ??
              hookDetail.target_address ??
              hookDetail.targetAddress,
            bytecodeAddress:
              entry.bytecode_address ??
              hookDetail.bytecode_address ??
              hookDetail.bytecodeAddress,
            sourcePath: hookDetail.path ?? null,
            sourceOffset: hookDetail.offset ?? null,
            sourceLength: hookDetail.length ?? null,
            locals: hookDetail.locals ?? null,
            state:
              hookDetail.state_variables ??
              hookDetail.stateVariables ??
              null,
          };
        }
        return null;
      })
      .filter(Boolean) as SimulationSnapshotEntry[];
  }

  const storageCandidates = ensureArray(traceObj.storageDiffs)
    .concat(ensureArray(traceObj.stateDiffs))
    .concat(ensureArray(traceObj.storageChanges));
  artifacts.storageDiffs = storageCandidates.map((entry: any) => ({
    address: entry?.address,
    slot: entry?.slot ?? entry?.key,
    key: entry?.key,
    before: entry?.before ?? entry?.previous,
    after: entry?.after ?? entry?.current ?? entry?.value,
    value: entry?.value,
  }));

  artifacts.rawReturnData =
    normalizeHex(traceObj.returnData) ??
    normalizeHex(traceObj.output) ??
    normalizeHex(traceObj.return_value) ??
    null;

  return artifacts;
};
