import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  StarknetSimulator,
  StarknetSimulatorBridgeError,
} from "@/chains/starknet/simulatorClient";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import { StarknetSimulationResults } from "@/components/starknet-simulation-results";

const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;

interface Props {
  /** Pre-populate the hash input from the URL (?txHash=…) and auto-trace
   *  once on mount. */
  initialTxHash?: string | null;
  /** Sync the active tx hash to the URL after a successful trace, or
   *  clear it when the input goes empty. */
  onTxHashCommit?: (hash: string | null) => void;
}

const TxTraceView: React.FC<Props> = ({ initialTxHash, onTxHashCommit }) => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [hash, setHash] = useState(initialTxHash ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SimulateResponse | null>(null);
  const hasAutoTracedRef = useRef(false);

  const valid = FELT_HEX.test(hash.trim());

  const runTrace = useCallback(
    async (nextHash?: string) => {
      const target = (nextHash ?? hash).trim();
      setError(null);
      setResponse(null);
      if (!FELT_HEX.test(target)) {
        setError("Transaction hash must be 0x-prefixed hex, ≤ 64 nibbles.");
        return;
      }
      setPending(true);
      try {
        const res = await simulator.trace(target);
        setResponse(res);
        onTxHashCommit?.(target);
      } catch (err) {
        if (err instanceof StarknetSimulatorBridgeError) {
          setError(`${err.code}: ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setPending(false);
      }
    },
    [simulator, hash, onTxHashCommit],
  );

  // Auto-trace once if the URL handed us a valid tx hash. Guarded by ref
  // so an HMR / route re-render doesn't fire duplicate bridge calls.
  useEffect(() => {
    if (hasAutoTracedRef.current) return;
    if (!initialTxHash) return;
    if (!FELT_HEX.test(initialTxHash)) return;
    hasAutoTracedRef.current = true;
    void runTrace(initialTxHash);
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
              placeholder="0x... transaction hash"
              spellCheck={false}
              className="font-mono text-xs"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !pending) void runTrace();
              }}
            />
            <Button
              variant="outline"
              onClick={() => void runTrace()}
              disabled={!valid}
              loading={pending}
            >
              Trace
            </Button>
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
            <Alert variant="destructive">
              <AlertTitle>Trace failed</AlertTitle>
              <AlertDescription className="font-mono text-[11px]">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {response && (
        <StarknetSimulationResults
          response={response}
          source="trace endpoint"
          txHash={hash.trim()}
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

export default TxTraceView;
