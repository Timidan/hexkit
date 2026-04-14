import React, { useEffect, useRef } from "react";
import { CircleNotch, CheckCircle, XCircle, ArrowRight } from "@phosphor-icons/react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { DepositFlow } from "../DepositFlow";
import { useCrossChainStatus } from "./hooks/useCrossChainStatus";
import { isCrossChain, type LegAction, type LegState } from "./executionMachine";
import type { Leg } from "./types";

interface ExecutionQueueProps {
  state: LegState;
  dispatch: (action: LegAction) => void;
}

export function ExecutionQueue({ state, dispatch }: ExecutionQueueProps) {
  if (state.legs.length === 0) return null;

  const current = state.currentIndex >= 0 ? state.legs[state.currentIndex] : null;
  const allDone = state.legs.every(
    (l) => l.status === "done" || l.status === "failed"
  );
  // NEXT must wait for the current step to reach a terminal state — otherwise
  // the forward-only reducer strands the in-flight step.
  const canAdvance =
    current !== null &&
    (current.status === "done" || current.status === "failed");

  const total = state.legs.length;

  const queueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      queueRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={queueRef} className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2.5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            Execution Queue
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {total} {total === 1 ? "step" : "steps"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {allDone
              ? `All ${total} steps complete`
              : `Step ${state.currentIndex + 1} of ${total}`}
          </div>
        </div>
        <div className="flex justify-center">
          {state.started && !allDone && total > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "NEXT" })}
              disabled={!canAdvance}
              title={
                canAdvance
                  ? undefined
                  : "Complete the current step before advancing"
              }
            >
              Next Step
            </Button>
          )}
          {allDone && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "RESET" })}
            >
              Reset
            </Button>
          )}
        </div>

        {state.started && total > 1 && (
          <div className="flex items-center gap-1.5">
            {state.legs.map((leg, i) => (
              <div
                key={leg.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  leg.status === "done"
                    ? "bg-emerald-500"
                    : leg.status === "failed"
                      ? "bg-red-500"
                      : i === state.currentIndex
                        ? "bg-blue-500 animate-pulse"
                        : "bg-muted/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {state.legs.map((leg, i) => (
        <LegCard
          key={leg.id}
          leg={leg}
          isCurrent={i === state.currentIndex}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

function LegCard({
  leg,
  isCurrent,
  dispatch,
}: {
  leg: Leg;
  isCurrent: boolean;
  dispatch: (action: LegAction) => void;
}) {
  const crossChain = isCrossChain(leg);

  const { data: statusData } = useCrossChainStatus({
    txHash: leg.sourceTxHash,
    fromChain: leg.source.asset.chainId,
    toChain: leg.destination.chainId,
    enabled: crossChain && leg.sourceTxHash !== null,
  });

  // INVALID means LI.FI can't track the source tx — treat as terminal failure
  // so the step doesn't stay stuck in "bridging" forever.
  useEffect(() => {
    if (!statusData) return;
    if (statusData.status === "DONE") {
      dispatch({ type: "SET_BRIDGE_STATUS", id: leg.id, status: "DONE" });
    } else if (
      statusData.status === "FAILED" ||
      statusData.status === "INVALID"
    ) {
      dispatch({ type: "SET_BRIDGE_STATUS", id: leg.id, status: "FAILED" });
    }
  }, [statusData, leg.id, dispatch]);

  return (
    <Card
      className={`space-y-3 bg-transparent p-3 shadow-none ${
        isCurrent ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-center gap-2.5 text-sm">
        <StatusIcon status={leg.status} />
        <div className="flex-1">
          <div className="font-medium">
            {leg.source.asset.token.symbol} on {leg.source.asset.chainName}
            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
            {leg.destination.name ?? leg.destination.slug}
            {crossChain && (
              <span className="ml-2 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] uppercase text-blue-400">
                cross-chain
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {leg.status}
            {leg.bridgeStatus && ` · bridge: ${leg.bridgeStatus}`}
            {statusData?.substatusMessage && ` · ${statusData.substatusMessage}`}
          </div>
        </div>
      </div>

      {leg.errorMessage && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
          {leg.errorMessage}
        </div>
      )}

      {isCurrent && leg.status !== "done" && leg.status !== "failed" && (
        <DepositFlow
          vault={leg.destination}
          override={{
            fromChain: leg.source.asset.chainId,
            fromToken: leg.source.asset.token,
            fromAmountRaw: leg.source.amountRaw,
          }}
          onBroadcast={(txHash) => {
            dispatch({ type: "SET_TX_HASH", id: leg.id, txHash });
            dispatch({
              type: "SET_STATUS",
              id: leg.id,
              status: crossChain ? "bridging" : "executing",
            });
          }}
          onConfirmed={() => {
            if (!crossChain) {
              dispatch({ type: "SET_STATUS", id: leg.id, status: "done" });
            }
          }}
          onError={(message) => {
            dispatch({ type: "SET_ERROR", id: leg.id, message });
          }}
        />
      )}
    </Card>
  );
}

function StatusIcon({ status }: { status: Leg["status"] }) {
  if (status === "done") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "pending") return <div className="h-4 w-4 rounded-full border border-border/40" />;
  return <CircleNotch className="h-4 w-4 animate-spin text-blue-400" />;
}
