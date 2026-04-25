import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StarknetSimulator } from "@/chains/starknet/simulatorClient";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import { StarknetSimulationResults } from "@/components/starknet-simulation-results";
import BridgeErrorAlert from "./BridgeErrorAlert";
import CopyCurlButton from "./CopyCurlButton";
import { extractTxHash } from "./txHashParse";

interface Props {
  /** Pre-populate the hash input from the URL (?txHash=…) and auto-trace
   *  once on mount. */
  initialTxHash?: string | null;
  /** Sync the active tx hash to the URL after a successful trace, or
   *  clear it when the input goes empty. */
  onTxHashCommit?: (hash: string | null) => void;
  /** Push to the page-level "Recent simulations" sidebar after each
   *  successful trace. */
  onTraceSucceeded?: (txHash: string) => void;
}

const TxTraceView: React.FC<Props> = ({
  initialTxHash,
  onTxHashCommit,
  onTraceSucceeded,
}) => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [hash, setHash] = useState(initialTxHash ?? "");
  const [pending, setPending] = useState(false);
  // Either a validation message (string — local input parsing) or the
  // raw error thrown by the bridge client (Error — handed to the alert
  // mapper). Two shapes lets the validation flow stay synchronous and
  // BridgeErrorAlert do its remapping pass on async failures.
  const [error, setError] = useState<string | Error | null>(null);
  const [response, setResponse] = useState<SimulateResponse | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const hasAutoTracedRef = useRef(false);

  // One-shot /health fetch on mount — chain_id is needed to build
  // network-correct Voyager / Starkscan deep-links on the result card.
  // The page-level banner already polls /health on its own schedule;
  // this read is just enough to learn the bridge's network.
  useEffect(() => {
    if (!simulator.isConfigured) return;
    let cancelled = false;
    simulator
      .health()
      .then((h) => {
        if (!cancelled) setChainId(h.chain_id ?? null);
      })
      .catch(() => {
        // Banner already surfaces bridge health to the user; silently
        // fall back to mainnet links here.
      });
    return () => {
      cancelled = true;
    };
  }, [simulator]);

  const parsed = extractTxHash(hash);
  const valid = parsed !== null;

  const runTrace = useCallback(
    async (nextHash?: string) => {
      const target = extractTxHash(nextHash ?? hash);
      setError(null);
      setResponse(null);
      if (!target) {
        setError(
          "Paste a 0x-prefixed hash or a Voyager / Starkscan transaction URL.",
        );
        return;
      }
      // Canonicalize — if the user pasted a URL, snap the input back to
      // the bare hash so the field, the URL bar, and the trace request
      // all agree.
      if (target !== hash.trim()) setHash(target);
      setPending(true);
      try {
        const res = await simulator.trace(target);
        setResponse(res);
        onTxHashCommit?.(target);
        onTraceSucceeded?.(target);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPending(false);
      }
    },
    [simulator, hash, onTxHashCommit, onTraceSucceeded],
  );

  // Auto-trace once if the URL handed us a valid tx hash. Guarded by ref
  // so an HMR / route re-render doesn't fire duplicate bridge calls.
  useEffect(() => {
    if (hasAutoTracedRef.current) return;
    const canonical = extractTxHash(initialTxHash);
    if (!canonical) return;
    hasAutoTracedRef.current = true;
    void runTrace(canonical);
  }, [initialTxHash, runTrace]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Trace a landed transaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={hash}
              onChange={(e) => {
                const next = e.target.value;
                setHash(next);
                if (next.trim() === "") onTxHashCommit?.(null);
              }}
              placeholder="0x… hash or Voyager / Starkscan tx URL"
              spellCheck={false}
              className="font-mono text-xs"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !pending) void runTrace();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="default"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  const canonical = extractTxHash(text);
                  if (canonical) {
                    setHash(canonical);
                    if (!pending) void runTrace(canonical);
                  } else {
                    setError(
                      "Clipboard didn't contain a tx hash or Voyager / Starkscan URL.",
                    );
                  }
                } catch {
                  setError(
                    "Browser blocked clipboard read. Paste manually with Ctrl+V.",
                  );
                }
              }}
              disabled={pending}
              data-testid="paste-from-clipboard"
            >
              Paste
            </Button>
            <Button
              variant="outline"
              onClick={() => void runTrace()}
              disabled={!valid}
              loading={pending}
            >
              Trace
            </Button>
          </div>
          <div className="flex justify-between items-center gap-2">
            {pending ? <PendingElapsed /> : <span />}
            <CopyCurlButton
              method="POST"
              path={`/trace/${parsed ?? ""}`}
              body={{}}
              disabled={!valid}
            />
          </div>
          {!simulator.isConfigured && (
            <Alert>
              <AlertTitle className="text-warning">Bridge disabled</AlertTitle>
              <AlertDescription>
                Set <span className="font-mono">VITE_STARKNET_SIM_BRIDGE_URL</span> in{" "}
                <span className="font-mono">.env</span> to enable tracing.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            typeof error === "string" ? (
              <Alert variant="destructive">
                <AlertTitle>Check the input</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : (
              <BridgeErrorAlert error={error} context="Trace" />
            )
          )}
        </CardContent>
      </Card>

      {response && (
        <StarknetSimulationResults
          response={response}
          source="trace endpoint"
          txHash={hash.trim()}
          chainId={chainId}
          isResimulating={pending}
          onResimulate={() => void runTrace()}
          onExplainTransaction={() =>
            alert(
              "LLM whole-tx summary affordance — wire to your endpoint when /explain lands.",
            )
          }
          onExplainFrame={(f) =>
            alert(
              `LLM per-frame explainer for ${f.contractAddress} → ${f.entryPointSelector}`,
            )
          }
        />
      )}
    </div>
  );
};

/** Tiny "Tracing… 8s" pill for in-flight traces. The bridge can take
 *  30s+ replaying a busy block; without the elapsed counter it's
 *  unclear whether the request is alive or hung. */
function PendingElapsed() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const handle = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => window.clearInterval(handle);
  }, []);
  return (
    <span
      className="text-[10px] text-muted-foreground font-mono"
      data-testid="trace-elapsed"
    >
      Tracing… {elapsed}s elapsed
    </span>
  );
}

export default TxTraceView;
