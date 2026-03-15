import { calculateIntrinsicGas, formatTxType, parseGasSafe } from "./formatters";

export type SimulationResultExtras = {
  simulationId?: string;
  transactionHash?: string;
  debugEnabled?: boolean;
  chainId?: number;
  networkName?: string;
  forkBlockTag?: string | number;
  rawTrace?: { snapshots?: unknown[]; inner?: unknown };
  blockNumber?: string | number;
  gasLimit?: string | number;
  gas?: string | number;
  gasLimitSuggested?: string | number;
};

export type ContractContextExtras = {
  debugEnabled?: boolean;
  networkId?: number;
  networkName?: string;
  blockOverride?: string | number;
  fromAddress?: string;
  address?: string;
  calldata?: string;
  ethValue?: string;
  simulationOrigin?: "manual" | "tx-hash-replay";
  replayTxHash?: string;
};

/**
 * Resolve the function name from simulation result, call tree, and decoded trace.
 */
export function resolveFunctionName(
  result: any,
  rootCall: any,
  decodedTrace: any,
  rawInput: string,
  contractContext?: ContractContextExtras | null,
): string {
  const isJustSelector = (fn: string) => /^0x[a-fA-F0-9]{8}$/.test(fn);
  const isDecodedFunction = (fn: unknown): fn is string =>
    typeof fn === "string" && fn.trim().length > 0 && !isJustSelector(fn.trim());
  const rows = Array.isArray(decodedTrace?.rows) ? decodedTrace.rows : [];
  const getBestDecodedTraceFunction = (
    pickCandidate: (row: any) => unknown,
  ): string | null => {
    let bestMatch: { depth: number; id: number; fn: string } | null = null;
    for (const row of rows as any[]) {
      const candidate = pickCandidate(row);
      if (!isDecodedFunction(candidate)) {
        continue;
      }
      const candidateDepth = Number.isFinite(Number(row?.depth))
        ? Number(row.depth)
        : Number.MAX_SAFE_INTEGER;
      const candidateId = Number.isFinite(Number(row?.id))
        ? Number(row.id)
        : Number.MAX_SAFE_INTEGER;
      if (
        !bestMatch ||
        candidateDepth < bestMatch.depth ||
        (candidateDepth === bestMatch.depth && candidateId < bestMatch.id)
      ) {
        bestMatch = { depth: candidateDepth, id: candidateId, fn: candidate.trim() };
      }
    }
    return bestMatch?.fn ?? null;
  };
  const selector = rawInput && rawInput.length >= 10 ? rawInput.slice(0, 10) : null;
  const isTxReplay =
    contractContext?.simulationOrigin === "tx-hash-replay" ||
    typeof contractContext?.replayTxHash === "string" ||
    typeof result?.transactionHash === "string";
  const traceFn = decodedTrace?.callMeta?.function;
  const firstRow = rows[0] as any;
  const entryFn = firstRow?.entryMeta?.function;
  const decodedEntryFn = getBestDecodedTraceFunction((row) => row?.entryMeta?.function);
  const decodedRowFn = getBestDecodedTraceFunction((row) => row?.fn);

  if (isDecodedFunction(result.functionName)) return result.functionName.trim();

  if (isDecodedFunction(traceFn)) return traceFn.trim();
  if (isDecodedFunction(entryFn)) return entryFn.trim();
  if (decodedEntryFn) return decodedEntryFn;
  if (decodedRowFn) return decodedRowFn;

  if (isDecodedFunction(rootCall?.functionName)) return rootCall.functionName.trim();
  if (isDecodedFunction(rootCall?.label)) return rootCall.label.trim();

  for (const row of rows) {
    const r = row as any;
    if (r?.name === 'DELEGATECALL' && r?.functionName && !isJustSelector(r.functionName)) {
      return r.functionName;
    }
    if (r?.name === 'DELEGATECALL' && r?.entryMeta?.function && !isJustSelector(r.entryMeta.function)) {
      return r.entryMeta.function;
    }
  }

  if (isTxReplay) {
    if (traceFn && isJustSelector(traceFn)) return traceFn;
    if (entryFn && isJustSelector(entryFn)) return entryFn;
    if (selector) return selector;
  }

  if (selector) return selector;
  if (!rawInput || rawInput === "0x" || rawInput.length <= 2) return "transfer";
  return "\u2014";
}

/**
 * Compute gas-related display values from the simulation result and decoded trace.
 */
export function computeGasValues(
  result: any,
  decodedTrace: any,
  rawInput: string,
  contractContext: any
) {
  const edbExecutionGas = decodedTrace?.callMeta?.gas_used ?? decodedTrace?.callMeta?.gasUsed;

  const innerValue = result.rawTrace?.inner;
  const nestedInner = innerValue && typeof innerValue === 'object' && !Array.isArray(innerValue) && 'inner' in innerValue
    ? (innerValue as { inner?: unknown[] }).inner
    : null;
  const rawTraceInner = nestedInner
    ? nestedInner
    : innerValue && typeof innerValue === 'object'
      ? (Array.isArray(innerValue) ? innerValue : Object.values(innerValue))
      : [];
  const edbRootCall = (rawTraceInner as Record<string, unknown>[])[0];
  const edbResult = edbRootCall?.result as Record<string, unknown> | undefined;
  const edbSuccess = edbResult?.Success as Record<string, unknown> | undefined;
  const rawTraceGasUsed = (
    edbRootCall?.gas_used ??
    edbRootCall?.gasUsed ??
    edbSuccess?.gas_used ??
    edbSuccess?.gasUsed
  ) as string | number | null | undefined;

  const getCalculatedGasFromTrace = (): number => {
    const rows = decodedTrace?.rows;
    if (!rows || rows.length === 0) return 0;
    let totalGas = 0;
    const MAX_SINGLE_OPCODE_GAS = 1_000_000;
    for (const row of rows) {
      const r = row as any;
      if (r?.id < 0 || r?.entryJumpdest === true || r?.isInternalCall === true) continue;
      if (r?.gasDelta) {
        const delta = parseInt(r.gasDelta, 10);
        if (Number.isFinite(delta) && delta > 0 && delta < MAX_SINGLE_OPCODE_GAS) totalGas += delta;
      }
    }
    return totalGas;
  };

  const intrinsicGas = calculateIntrinsicGas(rawInput);
  const calculatedFromTrace = getCalculatedGasFromTrace();

  const hasResultGasUsed = result.gasUsed !== null && result.gasUsed !== undefined;
  const executionGas = parseGasSafe(result.gasUsed) || calculatedFromTrace || parseGasSafe(edbExecutionGas) || parseGasSafe(rawTraceGasUsed);

  const totalGasUsed = hasResultGasUsed
    ? executionGas
    : (executionGas > 0 ? intrinsicGas + executionGas : 0);
  const gasUsed = totalGasUsed > 0 ? String(totalGasUsed) : "\u2014";

  const resultWithExtras = result as SimulationResultExtras;
  const edbGasLimit = result.gasLimitSuggested || resultWithExtras.gasLimit || resultWithExtras.gas;
  const gasLimitNum = edbGasLimit ? parseInt(String(edbGasLimit)) : 30_000_000;
  const gasUsedNum = totalGasUsed;
  const gasPercentage = gasLimitNum > 0 && gasUsedNum > 0
    ? ((gasUsedNum / gasLimitNum) * 100).toFixed(2) : "0";
  const gasLimit = `${gasLimitNum.toLocaleString()} (${gasPercentage}%)`;
  const gasPrice = result.effectiveGasPrice || result.gasPrice || "\u2014";
  const nonce = result.nonce !== null && result.nonce !== undefined ? String(result.nonce) : "\u2014";
  const txFee = "0 ETH";
  const txType = formatTxType(result.type);

  return { gasUsed, gasLimit, gasPrice, nonce, txFee, txType };
}

/**
 * Resolve raw return data for the simulation.
 */
export function resolveReturnData(
  decodedTrace: any,
  artifacts: any,
  rootCall: any,
  rawInput: string
): string | null {
  const edbOutput = decodedTrace?.callMeta?.result?.Success?.output || decodedTrace?.callMeta?.output;
  const rawReturn = artifacts?.rawReturnData || rootCall?.output || null;
  const isFunctionSelector = rawReturn && rawInput && rawReturn.toLowerCase() === rawInput.slice(0, 10).toLowerCase();
  return edbOutput || (isFunctionSelector ? null : rawReturn);
}
