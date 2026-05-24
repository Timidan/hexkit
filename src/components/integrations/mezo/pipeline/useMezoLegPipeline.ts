import { useCallback, useRef, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { waitForTransactionReceipt as wagmiWaitForReceipt } from "@wagmi/core";
import { executeLeg } from "./legHandlers";
import type { LegRun, LegStatus, MezoLegSpec } from "./mezoLegs";

function makeRunId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useMezoLegPipeline() {
  const config = useConfig();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<LegRun[]>([]);
  const runsRef = useRef<LegRun[]>(runs);
  runsRef.current = runs;

  const updateLeg = useCallback((id: string, patch: Partial<LegRun>) => {
    setRuns((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      runsRef.current = next;
      return next;
    });
  }, []);

  const start = useCallback(
    (legs: MezoLegSpec[], summaries: string[]): LegRun[] => {
      const newRuns: LegRun[] = legs.map((spec, i) => ({
        id: makeRunId(),
        spec,
        status: "ready" as LegStatus,
        decodedSummary: summaries[i] ?? "",
      }));
      setRuns(newRuns);
      runsRef.current = newRuns;
      return newRuns;
    },
    [],
  );

  const runOne = useCallback(
    async (run: LegRun) => {
      if (!address) throw new Error("wallet not connected");
      try {
        updateLeg(run.id, { status: "signing" });
        const txHash = await executeLeg(config, address, run.spec);
        updateLeg(run.id, { status: "confirming", txHash });
        await wagmiWaitForReceipt(config, { hash: txHash });
        updateLeg(run.id, { status: "confirmed" });
        // Tx landed — bust wagmi's read cache so wallet balances, trove state,
        // veMEZO views, and pool reserves all refresh on the next tick.
        // Broad invalidation is fine here: the surface area is small and an
        // extra round-trip per balance is cheaper than missed updates.
        queryClient.invalidateQueries();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isReject = /user (rejected|denied)/i.test(msg);
        updateLeg(run.id, {
          status: isReject ? "rejected" : "failed",
          error: msg,
        });
        throw err;
      }
    },
    [address, config, queryClient, updateLeg],
  );

  const executeAll = useCallback(async () => {
    const queue = runsRef.current.slice();
    for (const run of queue) {
      try {
        await runOne(run);
      } catch {
        // Stop on first failure; user can retry the specific leg.
        return;
      }
    }
  }, [runOne]);


  const retry = useCallback(
    async (id: string) => {
      const run = runsRef.current.find((r) => r.id === id);
      if (!run) return;
      if (run.status !== "failed" && run.status !== "rejected") return;
      updateLeg(id, { status: "ready", error: undefined });
      const fresh: LegRun = { ...run, status: "ready", error: undefined };
      try {
        await runOne(fresh);
      } catch {
        // Error already surfaced in state.
      }
    },
    [runOne, updateLeg],
  );

  const reset = useCallback(() => {
    setRuns([]);
    runsRef.current = [];
  }, []);

  return { runs, start, executeAll, retry, reset };
}
