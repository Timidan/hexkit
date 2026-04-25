// Compact health/version banner shown above the simulations tabs. Surfaces
// the bridge's git SHA, RPC spec version, fork-head block, and latency so
// users can immediately tell whether the simulator is talking to a fresh
// fork-head or a stale / disconnected one. Uses theme tokens; the dot
// color indicates status (success / warning / destructive / muted).

import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useBridgeStatus, type BridgeStatus } from "./useBridgeStatus";

export const StarknetBridgeBanner: React.FC = () => {
  const { status, health, version, error, refresh } = useBridgeStatus();
  const dotColor = statusDotColor(status);
  const label = statusLabel(status);
  const fork = health?.fork_head;

  return (
    <Card className="px-3 py-2 gap-1">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-foreground font-medium">{label}</span>
          {version && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                bridge {version.bridge_version}
                {version.bridge_git_sha && (
                  <> @ {version.bridge_git_sha.slice(0, 7)}</>
                )}
              </span>
            </>
          )}
          {health?.spec_version && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                rpc v{health.spec_version}
              </span>
            </>
          )}
          {fork && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                fork-head block {fork.block_number.toLocaleString()}
              </span>
            </>
          )}
          {typeof health?.rpc_latency_ms === "number" && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                rpc {health.rpc_latency_ms} ms
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowsClockwise size={14} />}
          onClick={() => void refresh()}
          disabled={status === "checking" || status === "disabled"}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <div className="text-[10px] text-muted-foreground font-mono truncate">
          {error}
        </div>
      )}
      {health?.rpc_error && status !== "down" && (
        <div className="text-[10px] text-warning font-mono truncate">
          rpc: {health.rpc_error}
        </div>
      )}
    </Card>
  );
};

function statusDotColor(s: BridgeStatus): string {
  switch (s) {
    case "healthy":
      return "bg-success";
    case "degraded":
      return "bg-warning";
    case "down":
      return "bg-destructive";
    case "checking":
      return "bg-muted-foreground/70 animate-pulse";
    case "disabled":
      return "bg-muted-foreground/40";
  }
}

function statusLabel(s: BridgeStatus): string {
  switch (s) {
    case "healthy":
      return "Bridge live";
    case "degraded":
      return "Bridge online (degraded)";
    case "down":
      return "Bridge unreachable";
    case "checking":
      return "Checking bridge…";
    case "disabled":
      return "Bridge disabled";
  }
}

export default StarknetBridgeBanner;
