import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { StarknetSimulationResults } from "@/components/starknet-simulation-results";
import { useStarknetSimulation } from "@/contexts/StarknetSimulationContext";
import type { StarknetSimulationEntry } from "@/contexts/StarknetSimulationContext";
import { starknetDebugVault } from "@/chains/starknet/debug/starknetDebugVault";
import { StarknetSimulator } from "@/chains/starknet/simulatorClient";
import type {
  SimulateRequest,
  SimulateResponse,
  SimulationFlag,
  TxBody,
} from "@/chains/starknet/simulatorTypes";

async function hydrateDebugTraceFromVault(
  simulationId: string,
  response: SimulateResponse,
): Promise<SimulateResponse> {
  const needsHydration = response.results?.some(
    (result) => !result.debugTrace && result.debugTraceHandle,
  );
  if (!needsHydration) return response;
  const cloned =
    typeof structuredClone === "function"
      ? structuredClone(response)
      : (JSON.parse(JSON.stringify(response)) as SimulateResponse);
  const trace = await starknetDebugVault.loadDebugTrace(simulationId);
  if (!trace) return cloned;
  for (const result of cloned.results ?? []) {
    if (!result.debugTrace && result.debugTraceHandle) {
      result.debugTrace = trace;
    }
  }
  return cloned;
}

function needsRevertedTraceEnrichment(entry: StarknetSimulationEntry): boolean {
  if (entry.source !== "manual") return false;
  const response = entry.response;
  const result = response.results?.[0];
  if (!result || result.status !== "REVERTED") return false;
  if (
    result.executeInvocation ||
    result.validateInvocation ||
    result.feeTransferInvocation
  ) {
    return false;
  }
  if ((result.traceSteps?.length ?? 0) > 0 || result.debugTrace) return false;
  return !!response.txBody;
}

function restoredBounds(
  txBody: TxBody,
  key: "l1_gas" | "l1_data_gas" | "l2_gas",
): { maxAmount: string; maxPricePerUnit: string } {
  const value = txBody.resource_bounds?.[key];
  return {
    maxAmount: value?.max_amount ?? "0x0",
    maxPricePerUnit: value?.max_price_per_unit ?? "0x0",
  };
}

function availabilityMode(value: string | undefined): "L1" | "L2" {
  return value === "L2" ? "L2" : "L1";
}

function traceEnrichmentRequestFromEntry(
  entry: StarknetSimulationEntry,
): SimulateRequest | null {
  const txBody = entry.response.txBody;
  if (!txBody) return null;
  if (txBody.type !== "INVOKE" || txBody.version !== "0x3") return null;
  if (!txBody.sender_address || !txBody.nonce || !Array.isArray(txBody.calldata)) {
    return null;
  }

  const flags: SimulationFlag[] = [];
  if (entry.formSnapshot?.skipValidate) flags.push("SKIP_VALIDATE");
  if (entry.formSnapshot?.skipFeeCharge) flags.push("SKIP_FEE_CHARGE");

  const blockNumber = entry.response.blockContext?.blockNumber;
  return {
    blockId:
      typeof blockNumber === "number" && Number.isFinite(blockNumber)
        ? { blockNumber }
        : { tag: "latest" },
    transactions: [
      {
        type: "INVOKE",
        version: "0x3",
        senderAddress: txBody.sender_address,
        calldata: txBody.calldata,
        signature: txBody.signature ?? [],
        nonce: txBody.nonce,
        resourceBounds: {
          l1Gas: restoredBounds(txBody, "l1_gas"),
          l1DataGas: restoredBounds(txBody, "l1_data_gas"),
          l2Gas: restoredBounds(txBody, "l2_gas"),
        },
        tip: txBody.tip ?? "0x0",
        paymasterData: txBody.paymaster_data ?? [],
        nonceDataAvailabilityMode: availabilityMode(
          txBody.nonce_data_availability_mode,
        ),
        feeDataAvailabilityMode: availabilityMode(
          txBody.fee_data_availability_mode,
        ),
      },
    ],
    simulationFlags: flags,
  };
}

const StarknetSimulationResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { current, setSimulation } = useStarknetSimulation();
  const navigate = useNavigate();
  const location = useLocation();
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const navState = location.state as { fromSimulation?: boolean } | null;
  const isFreshNavigation = !!navState?.fromSimulation;

  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const hasAttemptedRef = useRef(false);
  const traceEnrichAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    hasAttemptedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (current && current.id === id) {
      setIsHydrating(false);
      return;
    }
    if (hasAttemptedRef.current) return;

    let cancelled = false;
    const run = async () => {
      hasAttemptedRef.current = true;
      setIsHydrating(true);
      setHydrateError(null);
      try {
        const { starknetSimulationHistoryService } = await import(
          "@/services/StarknetSimulationHistoryService"
        );
        const stored = await starknetSimulationHistoryService.getSimulation(id);
        if (cancelled) return;
        if (stored) {
          if (!stored.response) {
            setHydrateError("Stored simulation has no response payload.");
            return;
          }
          const response = await hydrateDebugTraceFromVault(id, stored.response);
          const rehydrated: StarknetSimulationEntry = {
            id: stored.id,
            source: stored.source,
            response,
            txHash: stored.txHash,
            chainId: stored.chainId ?? null,
            bridgeGitSha: stored.bridgeGitSha ?? null,
            network: stored.network,
            formSnapshot: stored.formSnapshot,
            createdAt: stored.timestamp,
          };
          setSimulation(rehydrated, { skipHistorySave: true });
        } else {
          setHydrateError("Simulation not found in history.");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn(
          "[StarknetSimulationResultsPage] Hydration failed:",
          err,
        );
        setHydrateError("Failed to load simulation from history.");
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    };

    if (isFreshNavigation) {
      const timer = window.setTimeout(() => {
        if (!current || current.id !== id) {
          void run();
        }
      }, 500);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, current, setSimulation, isFreshNavigation]);

  useEffect(() => {
    if (!id || !current || current.id !== id) return;
    if (traceEnrichAttemptedRef.current.has(current.id)) return;
    if (!needsRevertedTraceEnrichment(current)) return;
    const request = traceEnrichmentRequestFromEntry(current);
    if (!request || !simulator.isConfigured) return;

    traceEnrichAttemptedRef.current.add(current.id);
    let cancelled = false;
    simulator
      .simulate(request, {
        network: current.network,
        traceSteps: true,
        timeoutMs: 120_000,
      })
      .then((response) => {
        if (cancelled) return;
        setSimulation({
          ...current,
          response,
          chainId:
            response.chainId ??
            response.blockContext.chainId ??
            current.chainId ??
            null,
        });
      })
      .catch((err: unknown) => {
        console.warn(
          "[StarknetSimulationResultsPage] Trace enrichment failed:",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [current, id, setSimulation, simulator]);

  const handleResimulate = useCallback(() => {
    if (!current) {
      navigate("/starknet/builder");
      return;
    }
    if (current.source === "manual") {
      navigate(
        `/starknet/builder?mode=simulation&clone=${encodeURIComponent(current.id)}`,
      );
    } else if (current.source === "trace" && current.txHash) {
      navigate(
        `/starknet/builder?mode=replay&txHash=${encodeURIComponent(current.txHash)}`,
      );
    } else {
      navigate("/starknet/builder");
    }
  }, [current, navigate]);

  if (isHydrating) {
    return (
      <div
        style={{
          width: "100%",
          padding: "48px 16px",
          textAlign: "center",
          color: "var(--muted-foreground, #888)",
        }}
      >
        <p>Loading simulation…</p>
      </div>
    );
  }

  if (!current || current.id !== id) {
    return (
      <div
        style={{
          width: "100%",
          padding: "48px 16px",
          textAlign: "center",
          color: "var(--muted-foreground, #888)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <p style={{ margin: 0 }}>
          {hydrateError ??
            "Simulation not found in memory. Run a new simulation from the builder."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <StarknetSimulationResults
        response={current.response}
        txHash={current.txHash}
        chainId={
          current.chainId ??
          current.response.chainId ??
          current.response.blockContext.chainId ??
          null
        }
        stateReplayPending={current.stateReplayPending}
        stateReplayError={current.stateReplayError ?? null}
        onResimulate={handleResimulate}
      />
    </div>
  );
};

export default StarknetSimulationResultsPage;
