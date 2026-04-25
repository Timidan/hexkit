import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import type {
  BridgeErrorEnvelope,
  EstimateFeeResponse,
  HealthResponse,
  SimulateRequest,
  SimulateResponse,
  VersionResponse,
} from "./simulatorTypes";

const DEFAULT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 3_000;

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
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SimulateResponse> {
    return this.request<SimulateResponse>(
      "POST",
      "/simulate",
      transformRequestForBridge(req),
      opts,
    );
  }

  async trace(
    txHash: string,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SimulateResponse> {
    return this.request<SimulateResponse>(
      "POST",
      `/trace/${encodeURIComponent(txHash)}`,
      {},
      opts,
    );
  }

  async estimateFee(
    req: SimulateRequest,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
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
    opts?: { signal?: AbortSignal; timeoutMs?: number },
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
      const res = await fetch(url, {
        method,
        headers: getBridgeHeaders(),
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
      return parsed as T;
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
