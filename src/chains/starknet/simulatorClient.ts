import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import { networkConfigManager, type StarknetNetwork } from "@/config/networkConfig";
import type {
  BridgeErrorEnvelope,
  EstimateFeeResponse,
  HealthResponse,
  SimulatePrepareStartResponse,
  SimulatePrepareStatus,
  SimulateRequest,
  SimulateResponse,
  VersionResponse,
} from "./simulatorTypes";

const DEFAULT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 3_000;

/** Header the bridge reads to override its STARKNET_RPC_URL env on a
 *  per-request basis. The frontend resolves the user's preferred RPC
 *  (Alchemy / Infura / Cartridge / custom) via `networkConfigManager`
 *  and forwards the URL — keeps secrets out of the bridge's static env
 *  and keeps mainnet/sepolia separable. */
const RPC_OVERRIDE_HEADER = "X-Starknet-Rpc-Url";

/** Build the per-request RPC override header for a given network. Uses
 *  the user's app-side network config (Alchemy / Cartridge / custom).
 *  Returns an empty object when resolution fails so the bridge falls
 *  back to its env. */
export function rpcOverrideHeaderFor(
  network: StarknetNetwork,
): Record<string, string> {
  try {
    const r = networkConfigManager.resolveStarknetRpc(network);
    if (r?.url) return { [RPC_OVERRIDE_HEADER]: r.url };
  } catch (err) {
    console.warn("[starknet-sim] resolveStarknetRpc failed; falling back to bridge env", err);
  }
  return {};
}

export class StarknetSimulatorBridgeError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "StarknetSimulatorBridgeError";
    this.code = code;
    this.status = status;
  }
}

export class StarknetSimulator {
  private readonly base: string;

  constructor(baseUrl?: string) {
    this.base = (baseUrl ?? getStarknetSimBridgeUrl()).replace(/\/+$/, "");
  }

  /** Whether the bridge is configured (client not in "disabled" mode). */
  get isConfigured(): boolean {
    return this.base.length > 0;
  }

  async health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health", undefined, {
      signal,
      timeoutMs: HEALTH_TIMEOUT_MS,
    });
  }

  async version(signal?: AbortSignal): Promise<VersionResponse> {
    return this.request<VersionResponse>("GET", "/version", undefined, {
      signal,
    });
  }

  async simulate(
    req: SimulateRequest,
    opts: {
      network: StarknetNetwork;
      signal?: AbortSignal;
      timeoutMs?: number;
      traceSteps?: boolean;
    },
  ): Promise<SimulateResponse> {
    const query = opts.traceSteps ? "?trace_steps=1" : "";
    return this.request<SimulateResponse>(
      "POST",
      `/simulate${query}`,
      transformRequestForBridge(req),
      opts,
    );
  }

  async prepareSimulation(
    req: SimulateRequest,
    opts: { network: StarknetNetwork; signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SimulatePrepareStartResponse> {
    return this.request<SimulatePrepareStartResponse>(
      "POST",
      "/simulate/prepare",
      transformRequestForBridge(req),
      opts,
    );
  }

  async getPrepareStatus(
    prepareId: string,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SimulatePrepareStatus> {
    return this.request<SimulatePrepareStatus>(
      "GET",
      `/simulate/prepare/${encodeURIComponent(prepareId)}`,
      undefined,
      opts,
    );
  }

  async getPrepareResult(
    prepareId: string,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SimulateResponse> {
    return this.request<SimulateResponse>(
      "GET",
      `/simulate/prepare/${encodeURIComponent(prepareId)}/result`,
      undefined,
      opts,
    );
  }

  connectPrepareEvents(prepareId: string): EventSource {
    return new EventSource(
      `${this.base}/simulate/prepare/${encodeURIComponent(prepareId)}/events`,
    );
  }

  async trace(
    txHash: string,
    opts: {
      network: StarknetNetwork;
      signal?: AbortSignal;
      timeoutMs?: number;
      traceSteps?: boolean;
    },
  ): Promise<SimulateResponse> {
    // `?trace_steps=1` forces the bridge to skip upstream
    // `starknet_traceTransaction` and run a local blockifier replay
    // instead. Slower (~9 s vs ~600 ms) but the only path that returns
    // `state_diff` for landed txs — RPC v0.10 only emits state_diff
    // from `simulate_transactions`. The default trace path stays fast
    // for first paint; the State tab triggers this branch on demand.
    const query = opts.traceSteps ? "?trace_steps=1" : "";
    return this.request<SimulateResponse>(
      "POST",
      `/trace/${encodeURIComponent(txHash)}${query}`,
      {},
      opts,
    );
  }

  async estimateFee(
    req: SimulateRequest,
    opts: { network: StarknetNetwork; signal?: AbortSignal; timeoutMs?: number },
  ): Promise<EstimateFeeResponse> {
    return this.request<EstimateFeeResponse>(
      "POST",
      "/estimate-fee",
      transformRequestForBridge(req),
      opts,
    );
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    opts?: { signal?: AbortSignal; timeoutMs?: number; network?: StarknetNetwork },
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new StarknetSimulatorBridgeError(
        "BRIDGE_DISABLED",
        "Starknet simulator bridge is disabled",
        0,
      );
    }
    const controller = new AbortController();
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    const url = `${this.base}${path}`;
    try {
      // Inject the user-resolved RPC URL header on calls that the
      // bridge actually consumes it for (simulate / trace / estimate-fee).
      // Other endpoints don't read the header so passing it is harmless.
      const network: StarknetNetwork = opts?.network ?? "mainnet";
      const rpcHeader =
        method === "POST" ? rpcOverrideHeaderFor(network) : {};
      const res = await fetch(url, {
        method,
        headers: getBridgeHeaders(rpcHeader),
        body: body !== undefined && method === "POST" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        credentials: "same-origin",
      });
      const text = await res.text();
      const parsed = tryParseJson(text);
      if (!res.ok) {
        if (isBridgeEnvelope(parsed)) {
          throw new StarknetSimulatorBridgeError(
            parsed.error.code,
            parsed.error.message,
            res.status,
          );
        }
        throw new StarknetSimulatorBridgeError(
          "HTTP_ERROR",
          `HTTP ${res.status}`,
          res.status,
        );
      }
      return normalizeBridgeResponse(parsed) as T;
    } catch (err) {
      if (err instanceof StarknetSimulatorBridgeError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new StarknetSimulatorBridgeError(
          "CLIENT_TIMEOUT",
          `Request to ${path} timed out after ${timeoutMs} ms`,
          0,
        );
      }
      throw new StarknetSimulatorBridgeError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : String(err),
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeBridgeResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  const chainId = typeof root.chainId === "string" ? root.chainId : null;
  const source = typeof root.source === "string" ? root.source : null;
  if (chainId && root.blockContext && typeof root.blockContext === "object") {
    const ctx = root.blockContext as Record<string, unknown>;
    if (!ctx.chainId) ctx.chainId = chainId;
  }
  if (Array.isArray(root.results)) {
    const results = root.results.map(normalizeSimulationResult);
    root.results = results;
    const first = results[0];
    if (first && typeof first === "object") {
      const result = first as Record<string, unknown>;
      if (source && result.stateDiff && !result.stateDiffSource) {
        result.stateDiffSource = source;
      }
      if (result.stateDiffSource && !root.stateDiffSource) {
        root.stateDiffSource = result.stateDiffSource;
      } else if (result.stateDiff && !root.stateDiffSource) {
        root.stateDiffSource = source;
      }
      const hasTraceSteps =
        Array.isArray(result.traceSteps) && result.traceSteps.length > 0;
      const hasFunctionFrames =
        Array.isArray(result.functionFrames) && result.functionFrames.length > 0;
      if (source && (hasTraceSteps || hasFunctionFrames) && !result.traceStepsSource) {
        result.traceStepsSource = source;
      }
      if (result.traceStepsSource && !root.traceStepsSource) {
        root.traceStepsSource = result.traceStepsSource;
      } else if ((hasTraceSteps || hasFunctionFrames) && !root.traceStepsSource) {
        root.traceStepsSource = source;
      }
      if (root.warning && !root.stateDiffWarning) {
        root.stateDiffWarning = root.warning;
      }
      if (root.stateDiffWarning && !result.stateDiffWarning) {
        result.stateDiffWarning = root.stateDiffWarning;
      }
    }
  }
  if (Array.isArray(root.estimates)) {
    root.estimates = root.estimates.map((estimate) => {
      if (!estimate || typeof estimate !== "object") return estimate;
      const out = estimate as Record<string, unknown>;
      out.feeEstimate = normalizeFeeEstimate(
        out.feeEstimate,
        out.executionResources,
      );
      return out;
    });
  }
  return root;
}

function normalizeSimulationResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const result = value as Record<string, unknown>;
  result.feeEstimate = normalizeFeeEstimate(
    result.feeEstimate,
    result.executionResources,
  );
  if (result.executionResources && typeof result.executionResources === "object") {
    const resources = result.executionResources as Record<string, unknown>;
    if (!resources.builtinInstanceCounter) resources.builtinInstanceCounter = {};
  }
  return result;
}

function normalizeFeeEstimate(
  feeValue: unknown,
  resourcesValue: unknown,
): Record<string, unknown> {
  const fee =
    feeValue && typeof feeValue === "object"
      ? { ...(feeValue as Record<string, unknown>) }
      : {};
  const resources =
    resourcesValue && typeof resourcesValue === "object"
      ? (resourcesValue as Record<string, unknown>)
      : {};
  if (!fee.unit && typeof fee.feeUnit === "string") fee.unit = fee.feeUnit;
  if (!fee.unit) fee.unit = "FRI";
  fee.overallFee = normalizeQuantity(fee.overallFee ?? "0x0");
  fee.l1GasConsumed = normalizeQuantity(
    fee.l1GasConsumed ?? resources.l1Gas ?? "0x0",
  );
  fee.l1DataGasConsumed = normalizeQuantity(
    fee.l1DataGasConsumed ?? resources.l1DataGas ?? "0x0",
  );
  fee.l2GasConsumed = normalizeQuantity(
    fee.l2GasConsumed ?? resources.l2Gas ?? "0x0",
  );
  delete fee.feeUnit;
  return fee;
}

function normalizeQuantity(value: unknown): string {
  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "0x0";
      if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
        return `0x${BigInt(trimmed).toString(16)}`;
      }
      return `0x${BigInt(trimmed).toString(16)}`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return `0x${BigInt(Math.trunc(value)).toString(16)}`;
    }
    if (typeof value === "bigint") return `0x${value.toString(16)}`;
  } catch {
    return "0x0";
  }
  return "0x0";
}

/** Converts a SimulateRequest from camelCase TS shape to the snake_case
 *  Starknet RPC v0.10 wire format the bridge's tx_parse expects. The
 *  outer envelope (`blockId`, `simulationFlags`) is renamed by serde
 *  attributes on the bridge's SimulateRequest struct; only the inner
 *  transaction bodies need translation. */
export function transformRequestForBridge(req: SimulateRequest): SimulateRequest {
  return {
    ...req,
    transactions: req.transactions.map((tx) => transformTxForBridge(tx)),
  } as SimulateRequest;
}

function transformTxForBridge(tx: SimulateRequest["transactions"][number]): SimulateRequest["transactions"][number] {
  // Cast through unknown — serialization lives at this boundary so accept
  // the loss of TypeScript shape narrowing for the snake_case object.
  const t = tx as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {
    type: t.type,
    version: t.version,
    sender_address: t.senderAddress,
    calldata: t.calldata,
    signature: t.signature,
    nonce: t.nonce,
    resource_bounds: transformResourceBounds(t.resourceBounds),
    tip: t.tip,
    paymaster_data: t.paymasterData ?? [],
    nonce_data_availability_mode: t.nonceDataAvailabilityMode ?? "L1",
    fee_data_availability_mode: t.feeDataAvailabilityMode ?? "L1",
  };
  return out as unknown as SimulateRequest["transactions"][number];
}

function transformResourceBounds(rb: unknown): unknown {
  type Pair = { maxAmount?: unknown; maxPricePerUnit?: unknown };
  const bounds = rb as
    | { l1Gas?: Pair; l1DataGas?: Pair; l2Gas?: Pair }
    | undefined;
  return {
    l1_gas: {
      max_amount: bounds?.l1Gas?.maxAmount ?? "0x0",
      max_price_per_unit: bounds?.l1Gas?.maxPricePerUnit ?? "0x0",
    },
    l1_data_gas: {
      max_amount: bounds?.l1DataGas?.maxAmount ?? "0x0",
      max_price_per_unit: bounds?.l1DataGas?.maxPricePerUnit ?? "0x0",
    },
    l2_gas: {
      max_amount: bounds?.l2Gas?.maxAmount ?? "0x0",
      max_price_per_unit: bounds?.l2Gas?.maxPricePerUnit ?? "0x0",
    },
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isBridgeEnvelope(value: unknown): value is BridgeErrorEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    "error" in (value as Record<string, unknown>) &&
    typeof (value as { error: unknown }).error === "object"
  );
}
