import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  FunctionInvocation,
  SimulationEvent,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import {
  TOKEN_META,
  contractLabel,
  decodeU256,
  eventName,
  formatTokenAmount,
  shortHex,
  walkInvocations,
} from "./decoders";

interface DecodedTransfer {
  token: string;
  from: string;
  to: string;
  kind: string;
  amount: bigint;
  /** The frame whose events list contained the source event. Used by
   *  the per-row jump-to-frame button. */
  frame: FunctionInvocation;
}

/** Cairo array length felts max out around 2^32 in practice; clamp to
 *  a sane range so a malformed event can't blow up the loop. */
function safeFeltLen(felt: string | undefined): number {
  try {
    const n = Number(BigInt(felt ?? "0x0"));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 256);
  } catch {
    return 0;
  }
}

export function TokenFlowTab({
  result,
  frames,
  onJumpToFrame,
}: {
  result: SimulationResult;
  frames?: FunctionInvocation[];
  onJumpToFrame?: (frame: FunctionInvocation) => void;
}) {
  const eventsWithFrame: Array<{ ev: SimulationEvent; frame: FunctionInvocation }> = [];
  for (const f of walkInvocations(result)) {
    for (const e of f.events || []) eventsWithFrame.push({ ev: e, frame: f });
  }

  const transfers: DecodedTransfer[] = [];
  for (const { ev, frame } of eventsWithFrame) {
    const name = eventName(ev);
    if (name === "Transfer" && ev.keys.length >= 3) {
      const data = ev.data || [];
      const isErc721 = data.length === 1;
      const amount = isErc721 ? BigInt(data[0]) : decodeU256(data[0], data[1]);
      transfers.push({
        token: ev.fromAddress,
        from: ev.keys[1],
        to: ev.keys[2],
        kind: isErc721 ? "ERC721" : "ERC20",
        amount,
        frame,
      });
    } else if (name === "TransferSingle" && ev.keys.length >= 4) {
      const d = ev.data || [];
      const tokenId = decodeU256(d[0], d[1]);
      const value = decodeU256(d[2], d[3]);
      transfers.push({
        token: ev.fromAddress,
        from: ev.keys[2],
        to: ev.keys[3],
        kind: `ERC1155 #${tokenId}`,
        amount: value,
        frame,
      });
    } else if (name === "TransferBatch" && ev.keys.length >= 4) {
      // Cairo array layout: [ids_len, id_low, id_high, …, values_len,
      // val_low, val_high, …]. Emit one row per (id, value) pair so
      // batch transfers feel uniform with TransferSingle in the table.
      const d = ev.data || [];
      let i = 0;
      const idsLen = safeFeltLen(d[i++]);
      const ids: bigint[] = [];
      for (let j = 0; j < idsLen; j++) {
        ids.push(decodeU256(d[i++], d[i++]));
      }
      const valuesLen = safeFeltLen(d[i++]);
      const values: bigint[] = [];
      for (let j = 0; j < valuesLen; j++) {
        values.push(decodeU256(d[i++], d[i++]));
      }
      for (let j = 0; j < ids.length; j++) {
        transfers.push({
          token: ev.fromAddress,
          from: ev.keys[2],
          to: ev.keys[3],
          kind: `ERC1155 #${ids[j]} (batch)`,
          amount: values[j] ?? 0n,
          frame,
        });
      }
    }
  }

  // Per-token aggregate for the summary chips.
  const byToken = new Map<
    string,
    { meta: { symbol: string; decimals: number }; count: number; sum: bigint }
  >();
  for (const t of transfers) {
    const meta =
      TOKEN_META[t.token] || {
        symbol: shortHex(t.token, 6, 4),
        decimals: t.kind.startsWith("ERC721") || t.kind.startsWith("ERC1155") ? 0 : 18,
      };
    const cur = byToken.get(t.token) || { meta, count: 0, sum: 0n };
    cur.count++;
    cur.sum += t.amount;
    byToken.set(t.token, cur);
  }

  return (
    <Card className="p-4 gap-3">
      <div>
        <div className="text-xs uppercase text-muted-foreground">
          Token flow (derived from events)
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Walks every emitted event for the canonical{" "}
          <span className="font-mono">starknet_keccak("Transfer")</span> /{" "}
          <span className="font-mono">"TransferSingle"</span> /{" "}
          <span className="font-mono">"TransferBatch"</span> key and reconstructs the directional
          flow with per-token decimals.
        </div>
      </div>

      {transfers.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          No <span className="font-mono">Transfer</span> /{" "}
          <span className="font-mono">TransferSingle</span> events detected.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Array.from(byToken.entries()).map(([addr, info]) => {
              const formatted = formatTokenAmount(info.sum, info.meta.decimals);
              return (
                <Badge key={addr} variant="success" size="md" className="gap-2">
                  <span className="font-semibold">{info.meta.symbol}</span>
                  <span className="font-mono">{formatted}</span>
                  <span className="opacity-70">
                    in {info.count} transfer{info.count === 1 ? "" : "s"}
                  </span>
                </Badge>
              );
            })}
          </div>
          <div className="space-y-2">
            {transfers.map((t, i) => {
              const meta =
                TOKEN_META[t.token] || {
                  symbol: shortHex(t.token, 6, 4),
                  decimals:
                    t.kind.startsWith("ERC721") || t.kind.startsWith("ERC1155") ? 0 : 18,
                };
              const formatted = formatTokenAmount(t.amount, meta.decimals);
              const fromLbl = contractLabel(t.from);
              const toLbl = contractLabel(t.to);
              const frameIdx = frames ? frames.indexOf(t.frame) : -1;
              return (
                <Card key={i} className="p-3 gap-1.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="success" size="sm" className="font-mono">
                      {meta.symbol}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {t.kind}
                    </span>
                    {frameIdx >= 0 && onJumpToFrame && (
                      <button
                        type="button"
                        onClick={() => onJumpToFrame(t.frame)}
                        className="font-mono text-[10px] text-info hover:underline"
                        data-testid="flow-jump-frame"
                      >
                        frame #{frameIdx}
                      </button>
                    )}
                    <span
                      className={`font-mono text-xs ${
                        fromLbl ? "text-success" : "text-foreground"
                      }`}
                    >
                      {fromLbl || shortHex(t.from)}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span
                      className={`font-mono text-xs ${
                        toLbl ? "text-success" : "text-foreground"
                      }`}
                    >
                      {toLbl || shortHex(t.to)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="font-mono text-sm text-warning">{formatted}</span>
                      <span className="text-[10px] text-muted-foreground">{meta.symbol}</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>
                      raw u256:{" "}
                      <span className="font-mono">{t.amount.toString(16)}</span>
                    </span>
                    <span>·</span>
                    <span>
                      token: <span className="font-mono">{shortHex(t.token)}</span>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
