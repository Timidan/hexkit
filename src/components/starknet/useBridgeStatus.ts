// Page-level hook that polls the starknet-sim bridge's /health + /version
// endpoints and returns a unified status object for the
// StarknetBridgeBanner. The footer-level StarknetSimBridgeStatus already
// runs its own health-check loop; we keep this hook independent so a
// page-level retry doesn't fight with the global indicator.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StarknetSimulator,
  StarknetSimulatorBridgeError,
} from "@/chains/starknet/simulatorClient";
import type {
  HealthResponse,
  VersionResponse,
} from "@/chains/starknet/simulatorTypes";

export type BridgeStatus = "disabled" | "checking" | "healthy" | "degraded" | "down";

export interface BridgeStatusSnapshot {
  status: BridgeStatus;
  health: HealthResponse | null;
  version: VersionResponse | null;
  error: string | null;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useBridgeStatus(): BridgeStatusSnapshot {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [status, setStatus] = useState<BridgeStatus>(
    simulator.isConfigured ? "checking" : "disabled",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!simulator.isConfigured) {
      setStatus("disabled");
      return;
    }
    setStatus((prev) => (prev === "healthy" ? "healthy" : "checking"));
    let h: HealthResponse | null = null;
    try {
      h = await simulator.health();
      setHealth(h);
      // /health is the source of truth for "is the bridge alive"; /version
      // is best-effort metadata. Don't fail the whole banner if it errors.
      const isDegraded =
        h.rpc_configured === false ||
        Boolean(h.rpc_error) ||
        h.chain_id == null ||
        h.fork_head == null;
      setStatus(isDegraded ? "degraded" : "healthy");
      setError(null);
    } catch (err) {
      setStatus("down");
      setError(formatErr(err));
      return;
    }
    try {
      const v = await simulator.version();
      setVersion(v);
    } catch (err) {
      // Keep the healthy/degraded status from /health — version is metadata.
      setVersion(null);
      // Surface the version error in the banner footer line, not as a
      // blocking failure.
      setError((prev) => prev ?? formatErr(err));
    }
  }, [simulator]);

  useEffect(() => {
    void refresh();
    if (!simulator.isConfigured) return;
    const handle = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [refresh, simulator.isConfigured]);

  return { status, health, version, error, refresh };
}

function formatErr(err: unknown): string {
  if (err instanceof StarknetSimulatorBridgeError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
