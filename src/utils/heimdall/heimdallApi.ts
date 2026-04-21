import { z } from "zod";
import { getBridgeHeaders, getSimulatorBridgeUrl } from "@/utils/env";
import {
  heimdallDecompilationSchema,
  heimdallErrorSchema,
  heimdallStorageDumpSchema,
  heimdallVersionSchema,
  type HeimdallDecompilation,
  type HeimdallStorageDump,
  type HeimdallVersion,
} from "./types";

export class HeimdallApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: string;
  constructor(code: string, status: number, message: string, details?: string) {
    super(message);
    this.name = "HeimdallApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function bridgeBase(): string {
  const base = getSimulatorBridgeUrl();
  if (!base) {
    throw new HeimdallApiError("bridge_disabled", 503, "Simulator bridge is disabled");
  }
  return base;
}

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${bridgeBase()}${path}`, {
    method: "POST",
    headers: getBridgeHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new HeimdallApiError("heimdall_invalid_output", res.status, "Non-JSON response", text.slice(0, 500));
  }

  if (!res.ok) {
    const err = heimdallErrorSchema.safeParse(parsed);
    if (err.success) {
      throw new HeimdallApiError(err.data.error, res.status, err.data.message ?? err.data.error, err.data.details);
    }
    throw new HeimdallApiError("heimdall_upstream_error", res.status, `HTTP ${res.status}`);
  }

  const ok = schema.safeParse(parsed);
  if (!ok.success) {
    throw new HeimdallApiError(
      "heimdall_invalid_output",
      res.status,
      `schema error: ${ok.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return ok.data;
}

export function fetchHeimdallVersion(): Promise<HeimdallVersion> {
  return post("/heimdall/version", {}, heimdallVersionSchema);
}

export interface DecompilationRequest {
  bytecode?: string;
  address?: string;
  chainId?: number;
}
export function fetchHeimdallDecompilation(
  req: DecompilationRequest,
): Promise<HeimdallDecompilation> {
  return post("/heimdall/decompile", req, heimdallDecompilationSchema);
}

export interface StorageDumpRequest {
  address: string;
  chainId: number;
  blockNumber?: number;
  blockTag?: string;
}
export function fetchHeimdallStorageDump(
  req: StorageDumpRequest,
): Promise<HeimdallStorageDump> {
  return post("/heimdall/dump", req, heimdallStorageDumpSchema);
}
