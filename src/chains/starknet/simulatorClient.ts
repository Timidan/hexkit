import { getBridgeHeaders, getStarknetSimBridgeUrl } from "@/utils/env";
import type {
  BridgeErrorEnvelope,
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
    return this.request<SimulateResponse>("POST", "/simulate", req, opts);
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
  ): Promise<SimulateResponse> {
    return this.request<SimulateResponse>("POST", "/estimate-fee", req, opts);
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
