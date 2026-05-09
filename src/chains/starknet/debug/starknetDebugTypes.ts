export type StarknetDebugSource = "simulation" | "local_replay" | string;

export interface StarknetDebugStep {
  stepIndex: number;
  pc: number;
  ap: number;
  fp: number;
  callId: number;
  traceCallId: number;
  invocationId: string | null;
  frameId: number | null;
  classHash: string | null;
  contractAddress: string | null;
  entryPointSelector: string | null;
  statementIdx?: number | null;
}

export interface StarknetDebugFrame {
  frameId: number;
  callId: number;
  traceCallId: number;
  invocationId: string | null;
  parentFrameId: number | null;
  fp: number;
  apIn: number;
  apOut: number;
  pcStart: number;
  pcEnd: number;
  stepIndexStart: number;
  stepIndexEnd: number;
}

export interface StarknetDebugInvocation {
  invocationId: string;
  traceCallId: number;
  phase: "validate" | "execute" | "fee_transfer" | string;
  path: number[];
  contractAddress: string | null;
  classHash: string | null;
  entryPointSelector: string | null;
  decodedSelector: string | null;
}

export interface StarknetDebugArtifactMeta {
  classHash: string;
  sourceTiers: Array<"cairo" | "sierra" | string>;
}

export interface StarknetDebugTrace {
  version: 1;
  source: StarknetDebugSource;
  steps: StarknetDebugStep[];
  frames: StarknetDebugFrame[];
  invocations: StarknetDebugInvocation[];
  artifacts: Record<string, StarknetDebugArtifactMeta>;
  replayWitness?: {
    initialReads?: unknown;
  } | null;
  warnings: string[];
  initialStepIndex: number;
  failureStepIndex?: number | null;
}

export interface StarknetDebugReady {
  ready: boolean;
  reason:
    | "ready"
    | "missing_debug_trace"
    | "empty_debug_trace";
}

export function getStarknetDebugReady(
  trace: StarknetDebugTrace | null | undefined,
): StarknetDebugReady {
  if (!trace) return { ready: false, reason: "missing_debug_trace" };
  if ((trace.steps?.length ?? 0) > 0 || (trace.frames?.length ?? 0) > 0) {
    return { ready: true, reason: "ready" };
  }
  return { ready: false, reason: "empty_debug_trace" };
}
