import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getStarknetSimBridgeUrl, getBridgeHeaders } from "../utils/env";

type BridgeStatus = "checking" | "connected" | "disconnected" | "disabled";

interface HealthPayload {
  status?: string;
  bridge_version?: string;
  git_sha?: string;
}

interface Props {
  className?: string;
}

const HEALTH_POLL_INTERVAL_MS = 12_000;
const HEALTH_TIMEOUT_MS = 3_000;

const StarknetSimBridgeStatus: React.FC<Props> = ({ className = "" }) => {
  const bridgeBaseUrl = useMemo(() => {
    const configured = getStarknetSimBridgeUrl();
    return configured ? configured.replace(/\/+$/, "") : "";
  }, []);

  const [status, setStatus] = useState<BridgeStatus>(
    bridgeBaseUrl ? "checking" : "disabled",
  );
  const [gitSha, setGitSha] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    if (!bridgeBaseUrl) {
      setStatus("disabled");
      setGitSha(null);
      setLastError(null);
      return;
    }

    setStatus((prev) => (prev === "connected" ? "connected" : "checking"));

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${bridgeBaseUrl}/health`, {
        method: "GET",
        headers: getBridgeHeaders(),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as HealthPayload;
      if (payload.status !== "ok") throw new Error("unhealthy response");

      setStatus("connected");
      setGitSha(payload.git_sha ?? null);
      setLastError(null);
    } catch (error: unknown) {
      const reason =
        error instanceof Error
          ? error.name === "AbortError"
            ? "timeout"
            : error.message
          : "unreachable";
      setStatus("disconnected");
      setGitSha(null);
      setLastError(reason);
    } finally {
      window.clearTimeout(timer);
    }
  }, [bridgeBaseUrl]);

  useEffect(() => {
    void runHealthCheck();
    if (!bridgeBaseUrl) return;
    const interval = window.setInterval(() => {
      void runHealthCheck();
    }, HEALTH_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [bridgeBaseUrl, runHealthCheck]);

  const statusText =
    status === "connected"
      ? "Live"
      : status === "disconnected"
        ? "Down"
        : status === "disabled"
          ? "Off"
          : "Check";

  const tooltip =
    status === "connected"
      ? `Starknet sim bridge connected${gitSha ? ` · ${gitSha}` : ""}`
      : status === "disabled"
        ? "Starknet sim bridge disabled via environment"
        : `Starknet sim bridge unreachable${lastError ? ` (${lastError})` : ""}`;

  return (
    <button
      type="button"
      onClick={() => void runHealthCheck()}
      className={`edb-status-indicator ${className}`.trim()}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className={`edb-status-dot is-${status}`} aria-hidden />
      <span className="edb-status-label">SN-SIM</span>
      <span className="edb-status-state">{statusText}</span>
    </button>
  );
};

export default StarknetSimBridgeStatus;
