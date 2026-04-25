// L2 → L1 messages tab. Walks the call tree once via collectL2ToL1Messages
// and renders one card per emitted message: source frame (decoded selector
// + contract label when known), L1 destination, payload felt count + a
// compact preview, copy buttons for the destination and the raw payload.

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { collectL2ToL1Messages, contractLabel, selectorName, shortHex } from "./decoders";

export function MessagesTab({ result }: { result: SimulationResult }) {
  const items = collectL2ToL1Messages(result);

  if (items.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        <div className="text-xs uppercase text-muted-foreground mb-2">L2 → L1 messages</div>
        No messages emitted to L1. Most INVOKE-only transactions don't bridge state to L1;
        this tab is populated by contracts calling{" "}
        <span className="font-mono">send_message_to_l1_syscall</span>.
      </Card>
    );
  }

  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">
          L2 → L1 messages ({items.length})
        </div>
        <span className="text-[10px] text-muted-foreground">
          emitted via <span className="font-mono">send_message_to_l1_syscall</span>
        </span>
      </div>
      <div className="space-y-2">
        {items.map(({ frame, message }, i) => {
          const fromLbl = contractLabel(message.fromAddress);
          const sel = selectorName(frame);
          const payload = message.payload || [];
          return (
            <Card key={i} className="p-3 gap-2 bg-background">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant="outline" size="sm">
                  msg #{i}
                </Badge>
                <span className="text-muted-foreground">from</span>
                {fromLbl ? (
                  <span className="font-mono text-success">{fromLbl}</span>
                ) : null}
                <span className="font-mono text-foreground">
                  {shortHex(message.fromAddress)}
                </span>
                {sel && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-success">{sel}()</span>
                  </>
                )}
                <span className="text-muted-foreground">→ L1</span>
                <span className="font-mono text-foreground">{shortHex(message.toAddress)}</span>
                <CopyButton value={message.toAddress} className="h-4 w-4" iconSize={10} />
              </div>
              <div className="rounded bg-card border border-border p-2 font-mono text-[11px] space-y-0.5">
                <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase">
                  <span>payload ({payload.length} felt{payload.length === 1 ? "" : "s"})</span>
                  {payload.length > 0 && (
                    <CopyButton
                      value={JSON.stringify(payload)}
                      className="h-4 w-4"
                      iconSize={10}
                    />
                  )}
                </div>
                {payload.length === 0 ? (
                  <div className="text-muted-foreground/70">empty</div>
                ) : (
                  <div className="space-y-0.5 max-h-32 overflow-auto">
                    {payload.slice(0, 8).map((p, idx) => (
                      <div key={idx} className="text-foreground">
                        <span className="text-muted-foreground">[{idx}]</span> {p}
                      </div>
                    ))}
                    {payload.length > 8 && (
                      <div className="text-muted-foreground">… +{payload.length - 8} more</div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
