import type { ReactNode } from "react";
import { CircleNotch, CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MEZO_BLOCKSCOUT_UI } from "../constants";
import type { LegRun, LegStatus } from "./mezoLegs";

const statusIcon: Record<LegStatus, ReactNode> = {
  planned: <Clock className="w-4 h-4 text-muted-foreground" />,
  ready: <Clock className="w-4 h-4 text-muted-foreground" />,
  signing: <CircleNotch className="w-4 h-4 animate-spin text-blue-400" />,
  confirming: <CircleNotch className="w-4 h-4 animate-spin text-blue-400" />,
  confirmed: <CheckCircle weight="fill" className="w-4 h-4 text-green-500" />,
  failed: <XCircle weight="fill" className="w-4 h-4 text-red-500" />,
  rejected: <XCircle weight="fill" className="w-4 h-4 text-yellow-500" />,
};

const statusLabel: Record<LegStatus, string> = {
  planned: "Planned",
  ready: "Ready",
  signing: "Signing…",
  confirming: "Confirming on Mezo Testnet…",
  confirmed: "Confirmed",
  failed: "Failed",
  rejected: "Rejected",
};

interface MezoLegTimelineProps {
  runs: LegRun[];
  onRetry: (id: string) => void;
}

export function MezoLegTimeline({ runs, onRetry }: MezoLegTimelineProps) {
  if (runs.length === 0) return null;

  return (
    <ol className="flex flex-col gap-2">
      {runs.map((run) => (
        <li
          key={run.id}
          className="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-muted/20"
        >
          <div className="mt-0.5 shrink-0">{statusIcon[run.status]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{run.decodedSummary}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {statusLabel[run.status]}
            </div>
            {run.txHash && (
              <a
                href={`${MEZO_BLOCKSCOUT_UI}/tx/${run.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-2 hover:underline mt-0.5 inline-block"
              >
                {shortHash(run.txHash)} ↗
              </a>
            )}
            {run.error && (
              <div className="text-xs text-red-500 mt-1 break-all">
                {run.error}
              </div>
            )}
          </div>
          {(run.status === "failed" || run.status === "rejected") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(run.id)}
            >
              Retry
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
