import React, { useCallback, useMemo, useState } from "react";
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

const TxTraceView: React.FC = () => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [hash, setHash] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SimulateResponse | null>(null);

  const valid = FELT_HEX.test(hash.trim());

  const runTrace = useCallback(async () => {
    setError(null);
    setResponse(null);
    if (!valid) {
      setError("Transaction hash must be 0x-prefixed hex, ≤ 64 nibbles.");
      return;
    }
    setPending(true);
    try {
      const res = await simulator.trace(hash.trim());
      setResponse(res);
    } catch (err) {
      if (err instanceof StarknetSimulatorBridgeError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  }, [simulator, hash, valid]);

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
              onChange={(e) => setHash(e.target.value)}
              placeholder="0x... transaction hash"
              spellCheck={false}
              className="font-mono text-xs"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !pending) void runTrace();
              }}
            />
            <Button onClick={runTrace} disabled={!valid || pending}>
              {pending ? "Tracing…" : "Trace"}
            </Button>
          </div>
          {!simulator.isConfigured && (
            <p className="text-xs text-amber-500">
              Starknet sim bridge is disabled (VITE_STARKNET_SIM_BRIDGE_URL).
              Set it in <code>.env</code> to enable tracing.
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive font-mono">{error}</p>
          )}
        </CardContent>
      </Card>

      {response && (
        <StarknetSimulationResults
          response={response}
          source={`tx ${hash.trim()}`}
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
