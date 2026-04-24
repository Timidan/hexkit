import React, { useCallback, useMemo, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import InvocationTree from "./InvocationTree";
import StateDiffTabs from "./StateDiffTabs";
import {
  StarknetSimulator,
  StarknetSimulatorBridgeError,
} from "@/chains/starknet/simulatorClient";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";

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

  const result = response?.results?.[0];

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

      {result && response && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Summary</CardTitle>
              <Badge
                variant={result.status === "SUCCEEDED" ? "default" : "destructive"}
              >
                {result.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Block</dt>
                <dd className="font-mono">
                  #{response.blockContext.blockNumber}{" "}
                  <span className="text-muted-foreground">
                    {response.blockContext.blockHash.slice(0, 12)}…
                  </span>
                </dd>
                <dt className="text-muted-foreground">Starknet version</dt>
                <dd className="font-mono">
                  {response.blockContext.starknetVersion}
                </dd>
                <dt className="text-muted-foreground">Overall fee</dt>
                <dd className="font-mono">
                  {result.feeEstimate.overallFee} {result.feeEstimate.unit}
                </dd>
                <dt className="text-muted-foreground">Steps</dt>
                <dd className="font-mono">
                  {result.executionResources.steps.toLocaleString()}
                </dd>
                <dt className="text-muted-foreground">L1/L2 gas</dt>
                <dd className="font-mono">
                  {result.executionResources.l1Gas.toLocaleString()} /{" "}
                  {result.executionResources.l2Gas.toLocaleString()}
                </dd>
              </dl>
              {result.revertReasonDecoded && (
                <p className="rounded bg-destructive/10 p-2 text-destructive">
                  {result.revertReasonDecoded}
                </p>
              )}
            </CardContent>
          </Card>

          {result.executeInvocation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invocation tree</CardTitle>
              </CardHeader>
              <CardContent>
                <InvocationTree node={result.executeInvocation} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">State diff</CardTitle>
            </CardHeader>
            <CardContent>
              <StateDiffTabs diff={result.stateDiff} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TxTraceView;
