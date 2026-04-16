/**
 * EDB trace-to-artifact conversion helpers. */

import { ethers } from "ethers";
import { ensureArray } from "./simulationArtifactTypes";
import type {
  SimulationCallNode,
  SimulationEventEntry,
  SimulationAssetChangeEntry,
  LightweightOpcodeEntry,
} from "./simulationArtifactTypes";

// ---- internal helpers -------------------------------------------------

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

export const normalizeAssetChangeEntry = (
  entry: any,
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

// ---- opcode trace builders -------------------------------------------

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toOpcodeValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      const parsedHex = Number.parseInt(trimmed, 16);
      return Number.isFinite(parsedHex) ? parsedHex : undefined;
    }
    const parsedDec = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsedDec) ? parsedDec : undefined;
  }
  return undefined;
};

export const buildOpcodeTraceFromTraceLiteRows = (
  traceLiteRows: unknown,
): LightweightOpcodeEntry[] => {
  const rows = ensureArray<any>(traceLiteRows);
  if (rows.length === 0) {
    return [];
  }

  const opcodeTrace: LightweightOpcodeEntry[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      return;
    }
    if (row.rowType && row.rowType !== "opcode") {
      return;
    }

    const pc = toNumberOrUndefined(row.pc);
    const opcode = toOpcodeValue(row.opcodeValue ?? row.opcode);
    if (pc === undefined || opcode === undefined) {
      return;
    }

    const entry = row.entry ?? {};
    const targetAddress =
      typeof entry.target === "string"
        ? entry.target
        : typeof row.contract === "string"
          ? row.contract
          : undefined;
    const bytecodeAddress =
      typeof entry.codeAddress === "string" ? entry.codeAddress : undefined;

    const storageRead =
      row.storage?.read && typeof row.storage.read === "object"
        ? row.storage.read
        : null;
    const storageWrite =
      row.storage?.write && typeof row.storage.write === "object"
        ? row.storage.write
        : null;

    opcodeTrace.push({
      id: toNumberOrUndefined(row.id) ?? index,
      frame_id:
        row.frameId && typeof row.frameId === "object"
          ? row.frameId
          : undefined,
      pc,
      opcode,
      gas_remaining: toNumberOrUndefined(row.gasRemaining),
      gas_used: toNumberOrUndefined(row.gasDelta),
      target_address: targetAddress,
      bytecode_address: bytecodeAddress,
      storage_read: storageRead,
      storage_write: storageWrite,
    });
  });

  return opcodeTrace;
};

// ---- EDB trace  ->  artifacts -----------------------------------------

export const convertEdbTraceToArtifacts = (
  traceEntries: any[],
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
    counterparty?: string,
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
      entryRaw.target ?? entryRaw.to ?? entryRaw.address,
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
        result.Success?.gas_used ??
        result.Success?.gasUsed ??
        result.Revert?.gas_used ??
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
      entryRaw.events ?? entryRaw.logs ?? entryRaw.event_logs,
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
