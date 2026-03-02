import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSimulatorBridgeUrl, getBridgeHeaders } from "../utils/env";

type BridgeStatus = "checking" | "connected" | "disconnected" | "disabled";

interface HealthResponse {
  status?: string;
  activeSessions?: number;
}

interface EdbBridgeStatusProps {
  className?: string;
}

const HEALTH_POLL_INTERVAL_MS = 12000;
const HEALTH_TIMEOUT_MS = 3000;

const EdbBridgeStatus: React.FC<EdbBridgeStatusProps> = ({ className = "" }) => {
  const bridgeBaseUrl = useMemo(() => {
    const configured = getSimulatorBridgeUrl();
    return configured ? configured.replace(/\/+$/, "") : "";
  }, []);

  const [status, setStatus] = useState<BridgeStatus>(
    bridgeBaseUrl ? "checking" : "disabled",
  );
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    if (!bridgeBaseUrl) {
      setStatus("disabled");
      setActiveSessions(null);
      setLastError(null);
      return;
    }

    setStatus((prev) => (prev === "connected" ? "connected" : "checking"));

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${bridgeBaseUrl}/health`, {
        method: "GET",
        headers: getBridgeHeaders(),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as HealthResponse;
      if (payload.status !== "ok") {
        throw new Error("Unhealthy response");
      }

      setStatus("connected");
      setActiveSessions(
        Number.isFinite(payload.activeSessions) ? Number(payload.activeSessions) : null,
      );
      setLastError(null);
    } catch (error: unknown) {
      const reason =
        error instanceof Error
          ? error.name === "AbortError"
            ? "timeout"
            : error.message
          : "unreachable";
      setStatus("disconnected");
      setActiveSessions(null);
      setLastError(reason);
    } finally {
      window.clearTimeout(timeout);
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
      ? `EDB bridge connected${typeof activeSessions === "number" ? ` · ${activeSessions} active session${activeSessions === 1 ? "" : "s"}` : ""}`
      : status === "disabled"
        ? "EDB bridge disabled via environment"
        : `EDB bridge unreachable${lastError ? ` (${lastError})` : ""}`;

  return (
    <button
      type="button"
      onClick={() => void runHealthCheck()}
      className={`edb-status-indicator ${className}`.trim()}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className={`edb-status-dot is-${status}`} aria-hidden />
      <span className="edb-status-label">EDB</span>
      <span className="edb-status-state">{statusText}</span>
    </button>
  );
};

export default EdbBridgeStatus;
