// Starknet → EDB EVM-trace shape adapter.
//
// Converts a Starknet `SimulationResult` into the `TraceRow[]` shape
// EDB's `<ExecutionStackTrace>` consumes so we can mount the literal
// EDB trace component on the Starknet sim panel (same pattern as
// `<ResultsHeader>` / `<TransactionSummary>`).
//
// Strategy (Option A: call-only):
//   - Walk `validate → execute → fee_transfer` and every nested
//     `frame.calls[]` recursively.
//   - Emit one `TraceRow` per frame with `type: "call"` only. Starknet
//     has no SLOAD / SSTORE / JUMP equivalents at this layer, so the
//     EDB renderer's opcode/storage branches are simply never hit.
//   - `from` / `to` / `functionName` / `callType` / `depth` map directly
//     onto the EDB renderer's call-row layout. Top-level frames whose
//     caller is the system (`0x0`) keep that literal address in `from`
//     so EDB renders it with its own zero-padding rules — we don't
//     inject any "system" string at this layer.
//   - Gas is approximated by taking each frame's share of the subtree
//     and scaling by the result's total VM steps. EDB shows this as
//     the per-row gas chip; Starknet doesn't have per-call gas in the
//     trace so we use steps as the closest equivalent.
//
// Events are also extracted into a flat `traceEvents` list shaped like
// EVM logs so EDB's TokenMovementsPanel can run its detector. Starknet
// event keys don't match the keccak Transfer topic, so the detector
// finds zero matches and the accordion stays hidden — that's fine.

import type {
  AbiTypeDef,
  FunctionFrame,
  FunctionInvocation,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import type { TraceRow } from "@/components/simulation-results/types";
import { frameLabel, selectorName, shortHex } from "./decoders";
import {
  buildDecodedArgs,
  buildDecodedSignature,
  buildRawFeltSummary,
} from "./decodeFunctionSig";

export interface StarknetTraceAdapterResult {
  /** Flat call-row sequence consumed by `<ExecutionStackTrace>` */
  traceRows: TraceRow[];
  /** Map from `FunctionInvocation` → `TraceRow.id` so the right-rail
   *  `FrameDetailPane` can highlight the same row the user picked. */
  frameToRowId: Map<FunctionInvocation, string>;
  /** Inverse lookup so the trace list selection can drive the right-
   *  rail FrameDetailPane. */
  rowIdToFrame: Map<string, FunctionInvocation>;
  /** Raw event log shaped like EVM logs for EDB's token-movement
   *  detector. Starknet keys won't match the keccak Transfer topic
   *  so the detector returns zero matches — the accordion stays
   *  hidden. */
  traceEvents: Array<{ address: string; topics: string[]; data: string }>;
}

/** Adapter options. By default we mirror Voyager's `internalCalls` view:
 *  ONLY the `__execute__` invocation + its descendants. Toggle
 *  `includeProtocolFrames` on to re-show `__validate__` and
 *  `__fee_transfer__` (account-contract signature check + sequencer
 *  fee payment — protocol plumbing the user usually doesn't care
 *  about). */
export interface StarknetTraceAdapterOptions {
  includeProtocolFrames?: boolean;
  /** Cairo struct/enum registry from the bridge response (`response.types`).
   *  Required for full param decoding when the type isn't a primitive — without
   *  it we still render the function name + raw-felt summary, but custom
   *  structs (e.g. `OracleUpdateParams`) collapse to a felt count. */
  types?: Record<string, AbiTypeDef>;
  /** Optional per-frame Cairo source resolver. When supplied, each row
   *  gets `sourceFile` + `line` set so EDB's `<TraceRowRenderer>` can
   *  call its existing `<ColorizedSnippet>` path on expand. Returning
   *  `null` for a frame leaves the row source-less (the renderer just
   *  skips the snippet). */
  resolveCairoSource?: (
    frame: FunctionInvocation,
  ) => { file: string; line: number } | null;
  /** Best-effort failure-line hint resolver. Output is rendered as a
   *  separate callout under the snippet — distinct from
   *  `sourceFile`/`line`. The Starknet simulation page only supplies
   *  this when bridge-backed Sierra→Cairo mapping failed and the row is
   *  already on the verified-source fallback path. */
  resolveFailureHint?: (
    frame: FunctionInvocation,
  ) => {
    line: number;
    tag: string;
    source: "panic-string" | "identifier-shape";
  } | null;
  /** Intra-contract function frames from the bridge (only present when
   *  the simulation was requested with `?trace_steps=1`). When supplied,
   *  each call row gets collapsed tier-2 "Function" child rows showing
   *  the internal Cairo call tree within that contract execution.
   *  Tier-2 rows use `type: "function"` and are collapsed by default. */
  functionFrames?: FunctionFrame[];
  /** Maps each `FunctionInvocation` to its bridge-assigned `callId`
   *  so tier-2 function frames can be matched to their parent call row.
   *  Built by `StarknetSimulationResults` from `frame.traceCallId` +
   *  postorder-assignment fallback. */
  frameCallIds?: Map<FunctionInvocation, number>;
}

/** Approximate per-frame gas from the result's total VM steps,
 *  weighted by the subtree size of each frame. Starknet doesn't expose
 *  per-call gas in the trace, but the user wants a number in the gas
 *  chip — using steps proportional to subtree size is a reasonable
 *  visual proxy that lines up with the resource-heavy frames. */
function buildGasApproximator(
  result: SimulationResult,
  frames: FunctionInvocation[],
): (frame: FunctionInvocation) => string | undefined {
  const totalSteps = result.executionResources?.steps;
  if (!totalSteps || totalSteps <= 0) {
    return () => undefined;
  }
  const subtreeSize = new Map<FunctionInvocation, number>();
  function size(n: FunctionInvocation): number {
    const cached = subtreeSize.get(n);
    if (cached !== undefined) return cached;
    let c = 1;
    for (const k of n.calls || []) c += size(k);
    subtreeSize.set(n, c);
    return c;
  }
  // Total subtree-size across every top-level invocation. We use this
  // as the denominator so the per-frame share sums to ~totalSteps.
  let denom = 0;
  for (const top of [
    result.validateInvocation,
    result.executeInvocation,
    result.feeTransferInvocation,
  ]) {
    if (top) denom += size(top);
  }
  if (denom <= 0) {
    // Fallback: split steps evenly across frames.
    if (frames.length === 0) return () => undefined;
    const each = Math.floor(totalSteps / frames.length);
    return () => String(each);
  }
  return (frame: FunctionInvocation): string | undefined => {
    const share = size(frame) / denom;
    const approx = Math.max(0, Math.round(share * totalSteps));
    return String(approx);
  };
}

function feltToHex(felt: string | undefined): string {
  if (!felt) return "0x0";
  const trimmed = felt.trim();
  if (trimmed.startsWith("0x")) return trimmed;
  // numeric felt → hex
  try {
    return "0x" + BigInt(trimmed).toString(16);
  } catch {
    return trimmed;
  }
}

function formatFrameReturnData(
  frame: FunctionInvocation,
  types: Record<string, AbiTypeDef> | undefined,
): string | undefined {
  const ret = frame.result || [];
  if (ret.length === 0) return undefined;

  const outputs = frame.decodedFunctionAbi?.outputs ?? [];
  if (outputs.length === 0) {
    if (ret.length === 1) return ret[0];
    return `[${ret.join(", ")}]`;
  }

  const decoded = buildDecodedArgs(outputs, ret, types);
  if (decoded.length === 0) return undefined;
  if (decoded.length === 1 && !outputs[0]?.name) {
    return decoded[0].value;
  }

  return decoded
    .map((item, idx) => {
      const label = outputs[idx]?.name || `return${idx}`;
      return `${label}: ${item.value}`;
    })
    .join(", ");
}

export function adaptStarknetForEvmTrace(
  result: SimulationResult,
  frames: FunctionInvocation[],
  options: StarknetTraceAdapterOptions = {},
): StarknetTraceAdapterResult {
  const {
    includeProtocolFrames = false,
    types,
    resolveCairoSource,
    resolveFailureHint,
    functionFrames,
    frameCallIds,
  } = options;
  const traceRows: TraceRow[] = [];
  const frameToRowId = new Map<FunctionInvocation, string>();
  const rowIdToFrame = new Map<string, FunctionInvocation>();
  const traceEvents: Array<{ address: string; topics: string[]; data: string }> = [];

  const gasFor = buildGasApproximator(result, frames);

  // Build callId → FunctionFrame[] index once, used when emitting tier-2 rows.
  const fnFramesByCallId = new Map<number, FunctionFrame[]>();
  if (functionFrames && functionFrames.length > 0) {
    for (const ff of functionFrames) {
      const list = fnFramesByCallId.get(ff.callId);
      if (list) list.push(ff);
      else fnFramesByCallId.set(ff.callId, [ff]);
    }
  }

  let frameIdx = 0;
  let fnFrameIdx = 0;

  function emitFrame(
    frame: FunctionInvocation,
    depth: number,
    parentId: string | null,
  ): void {
    const id = `frame-${frameIdx++}`;
    frameToRowId.set(frame, id);
    rowIdToFrame.set(id, frame);

    // Function-name resolution chain:
    //   1. `selectorName(frame)` → bridge-resolved ABI name (e.g.
    //      `update_oracle`, `__execute__`).
    //   2. `unknown(<short-selector>)` fallback when nothing matched.
    // The bare name is used as a label seed; the full call-site signature
    // (with decoded args) is built below by `buildDecodedSignature` /
    // `buildRawFeltSummary` so the EDB row displays the equivalent of
    // `update_oracle(pool_id: felt252 = 0x1, params: OracleUpdateParams = {…})`.
    const baseName =
      selectorName(frame) ||
      `unknown(${shortHex(frame.entryPointSelector, 6, 4)})`;
    // When we have the typed ABI from the bridge, walk the calldata
    // through the shared Cairo decoder to get a fully-typed signature.
    // Otherwise emit a raw-felt summary so the row is never an opaque
    // bare name.
    const calldataFelts = frame.calldata || [];
    const fnName = frame.decodedFunctionAbi?.inputs?.length
      ? buildDecodedSignature(
          baseName,
          frame.decodedFunctionAbi.inputs,
          calldataFelts,
          types,
        )
      : buildRawFeltSummary(baseName, calldataFelts);
    const callTypeUpper =
      frame.entryPointType?.toUpperCase() === "CONSTRUCTOR"
        ? "CONSTRUCTOR"
        : (frame.callType || "Call").toUpperCase();
    // frameLabel uses the same resolution chain the rest of the
    // Starknet panel uses for friendly contract labels (known
    // address → known class hash → account-shape heuristic). This is
    // what Voyager shows in its leftmost column ("Ready Account
    // v0.4.0", "STRK", …). Plain `contractLabel` here would only
    // match the address registry and miss class-hash brands.
    const contractFriendly = frameLabel(frame) || undefined;

    const cairoSrc = resolveCairoSource ? resolveCairoSource(frame) : null;
    const cairoHint = resolveFailureHint ? resolveFailureHint(frame) : null;
    const returnData = formatFrameReturnData(frame, types);
    const row: TraceRow = {
      id,
      type: "call",
      from: frame.callerAddress,
      to: frame.contractAddress,
      functionName: fnName,
      callType: callTypeUpper,
      depth,
      visualDepth: depth,
      hasChildren: (frame.calls?.length || 0) > 0,
      gasUsed: gasFor(frame),
      // Cairo source line — feeds EDB's existing inline-snippet path
      // (`<TraceRowRenderer>::renderSnippet` → `<ColorizedSnippet>`).
      // The TraceRow shape is EVM-shaped, but `sourceFile` + `line`
      // are language-agnostic — they only need to pair with a
      // matching `sourceTexts[sourceFile]` entry on
      // `<ExecutionStackTrace>`.
      ...(cairoSrc
        ? { sourceFile: cairoSrc.file, line: cairoSrc.line }
        : {}),
      ...(cairoHint ? { failureHint: cairoHint } : {}),
      // EDB's row renderer falls back to `row.input` / `row.output`
      // when its EVM ABI coder can't decode the call (always the
      // case for Cairo). Leaving the raw felt-concat hex in produces
      // noisy bracketed tails like `(0x0120d2431…) → (0x0100)` next
      // to our already-decoded signature, so we explicitly omit
      // both. The decoded signature lives in `functionName`; the
      // full payload is one click away in the per-frame modal.
      input: undefined,
      output: undefined,
      returnData,
      chainFamily: "starknet",
      contractName: contractFriendly,
      contract: contractFriendly,
      frameKey: id,
      parentId: parentId ?? undefined,
      isLeafCall: !(frame.calls && frame.calls.length > 0),
      // EDB's frame-hierarchy / row-visibility code treats rows as
      // "meaningful" only when they're an entry (has both `entry` and
      // `entryMeta`) or carry an EVM opcode/jumpDest. Starknet has no
      // EVM opcodes — every call frame is a fresh entry. Setting
      // `entry: true` flags it as meaningful so the default
      // `filters.full = true` path doesn't hide every row.
      entry: true,
      entryMeta: {
        caller: frame.callerAddress,
        target: frame.contractAddress,
        callType: callTypeUpper,
        function: fnName,
        selector: frame.entryPointSelector,
        targetContractName: contractFriendly,
      },
    };
    traceRows.push(row);

    // Tier-2: emit intra-contract function frame rows as collapsed children
    // of this call row. Only when functionFrames were provided (trace_steps=1).
    // Rows are typed "function" and kept separate from cross-contract child
    // calls — they represent Cairo fn boundaries within this single execution
    // scope, not new contract entry points.
    if (frameCallIds) {
      const callId = frameCallIds.get(frame);
      if (callId !== undefined) {
        const ffs = fnFramesByCallId.get(callId);
        if (ffs && ffs.length > 0) {
          // Sort by step order so the tree reads top-to-bottom.
          const sorted = ffs.slice().sort((a, b) => a.stepIndexStart - b.stepIndexStart);
          // Build parentFrameId → children index for intra-frame tree.
          const fnChildren = new Map<number | null, FunctionFrame[]>();
          for (const ff of sorted) {
            const key = ff.parentFrameId ?? null;
            const list = fnChildren.get(key);
            if (list) list.push(ff);
            else fnChildren.set(key, [ff]);
          }
          function emitFnFrame(ff: FunctionFrame, fnDepth: number, fnParentId: string): void {
            const fnId = `fn-${fnFrameIdx++}`;
            traceRows.push({
              id: fnId,
              type: "function",
              depth: depth + 1 + fnDepth,
              visualDepth: depth + 1 + fnDepth,
              hasChildren: (fnChildren.get(ff.frameId) ?? []).length > 0,
              parentId: fnParentId,
              chainFamily: "starknet",
              frameId: ff.frameId,
              pcStart: ff.pcStart,
              pcEnd: ff.pcEnd,
              stepIndexStart: ff.stepIndexStart,
              stepIndexEnd: ff.stepIndexEnd,
              entry: true,
              entryMeta: { caller: frame.contractAddress, target: frame.contractAddress, callType: "FUNCTION" },
              functionName: `fn @ pc:0x${ff.pcStart.toString(16)}`,
            });
            for (const child of fnChildren.get(ff.frameId) ?? []) {
              emitFnFrame(child, fnDepth + 1, fnId);
            }
          }
          for (const root of fnChildren.get(null) ?? []) {
            emitFnFrame(root, 0, id);
          }
        }
      }
    }

    // Flatten this frame's events into the EVM-shape log list. The
    // adapter passes them through to EDB's TokenMovementsPanel; the
    // panel filters by keccak Transfer topic so non-matching Starknet
    // event keys are silently dropped.
    for (const ev of frame.events || []) {
      const topics = (ev.keys || []).map(feltToHex);
      const dataConcat = (ev.data || [])
        .map((d) => {
          const h = feltToHex(d);
          return h.startsWith("0x") ? h.slice(2) : h;
        })
        .join("");
      traceEvents.push({
        address: feltToHex(ev.fromAddress),
        topics,
        data: dataConcat ? "0x" + dataConcat : "0x",
      });
    }

    for (const child of frame.calls || []) {
      emitFrame(child, depth + 1, id);
    }

    for (const [index, msg] of (frame.messages || []).entries()) {
      traceRows.push({
        id: `${id}-msg-${index}`,
        type: "message",
        from: feltToHex(msg.fromAddress),
        to: msg.toAddress,
        messagePayload: msg.payload.slice(),
        depth,
        visualDepth: depth,
        hasChildren: false,
        parentId: id,
        entry: true,
        entryMeta: {
          caller: feltToHex(msg.fromAddress),
          target: msg.toAddress,
          callType: "L2_TO_L1",
        },
        chainFamily: "starknet",
      });
    }
  }

  // Top-level invocations live at depth 0. Walking in this order
  // mirrors `walkInvocations()` so frame IDs stay deterministic.
  //
  // Voyager's `internalCalls` view shows ONLY the user-intent path
  // (execute + descendants), hiding the account-contract signature
  // check (`__validate__`) and the sequencer fee transfer
  // (`__fee_transfer__`). We mirror that as the default and let the
  // caller flip `includeProtocolFrames` to opt back in.
  const tops = includeProtocolFrames
    ? [
        result.validateInvocation,
        result.executeInvocation,
        result.feeTransferInvocation,
      ]
    : [result.executeInvocation];
  for (const top of tops) {
    if (top) emitFrame(top, 0, null);
  }

  return {
    traceRows,
    frameToRowId,
    rowIdToFrame,
    traceEvents,
  };
}
