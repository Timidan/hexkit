import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  FunctionInvocation,
  SimulationEvent,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import {
  contractLabel,
  decodeU256,
  eventName,
  formatTokenAmount,
  shortHex,
  TOKEN_META,
  walkInvocations,
} from "./decoders";

export function EventsTab({
  result,
  frames,
  types,
  onJumpToFrame,
}: {
  result: SimulationResult;
  frames?: FunctionInvocation[];
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
  /** Hand back to the page so a click on the frame badge switches to
   *  the Call tree tab and selects the emitting frame. */
  onJumpToFrame?: (frame: FunctionInvocation) => void;
}) {
  const rows: Array<{
    from: string;
    keys: string[];
    data: string[];
    frame: FunctionInvocation;
    decodedEventAbi: SimulationEvent["decodedEventAbi"];
  }> = [];
  for (const f of walkInvocations(result)) {
    for (const e of f.events || []) {
      rows.push({
        from: e.fromAddress,
        keys: e.keys,
        data: e.data,
        frame: f,
        decodedEventAbi: e.decodedEventAbi,
      });
    }
  }

  const [filter, setFilter] = useState("");
  // Pre-resolve decoded names + labels once so filtering doesn't have
  // to recompute on every keystroke.
  const annotated = useMemo(
    () =>
      rows.map((r) => {
        const decodedName = eventName({
          fromAddress: r.from,
          keys: r.keys,
          data: r.data,
        });
        return {
          ...r,
          decodedName,
          fromLabel: contractLabel(r.from),
          summary: summarizeEventData(decodedName, r.from, r.data),
        };
      }),
    [rows],
  );
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return annotated;
    return annotated.filter((r) => {
      if (r.decodedName && r.decodedName.toLowerCase().includes(q)) return true;
      if (r.fromLabel && r.fromLabel.toLowerCase().includes(q)) return true;
      if (r.from.toLowerCase().includes(q)) return true;
      if (r.keys.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [annotated, filter]);

  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase text-muted-foreground">
            Emitted events ({rows.length})
          </div>
          {filter.trim() && (
            <span className="text-[10px] text-muted-foreground">
              {filtered.length} of {rows.length} matched
            </span>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          Transaction emitted no events. Verify the call did not silently revert.
        </div>
      ) : (
        <>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by event name, contract label, address, or key"
            className="font-mono text-xs h-8 max-w-md"
            data-testid="events-filter"
          />
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              No events match the current filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Decoded name</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="w-16">Frame</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => {
                  // Preserve the original index so the column matches the
                  // bridge's emit order even after filtering — handy when
                  // cross-referencing with the call tree.
                  const originalIdx = annotated.indexOf(r);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-muted-foreground">
                        {originalIdx}
                      </TableCell>
                      <TableCell>
                        {r.decodedName ? (
                          <Badge variant="info" size="sm">
                            {r.decodedName}
                          </Badge>
                        ) : (
                          <span className="font-mono text-muted-foreground text-[10px]">
                            {shortHex(r.keys[0])}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.fromLabel ? (
                          <span className="text-success">{r.fromLabel} </span>
                        ) : null}
                        <span className="font-mono text-muted-foreground text-[10px]">
                          {shortHex(r.from)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const frameIdx = frames ? frames.indexOf(r.frame) : -1;
                          if (frameIdx < 0) {
                            return (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            );
                          }
                          if (!onJumpToFrame) {
                            return (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                #{frameIdx}
                              </span>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => onJumpToFrame(r.frame)}
                              className="font-mono text-[10px] text-info hover:underline"
                              data-testid="event-jump-frame"
                            >
                              #{frameIdx}
                            </button>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-foreground">
                        {r.keys.slice(1).map((k) => shortHex(k)).join(" · ") || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-foreground">
                        {r.decodedEventAbi && r.decodedEventAbi.fields.length > 0 ? (
                          <DecodedEventFields
                            fields={r.decodedEventAbi.fields}
                            keys={r.keys}
                            data={r.data}
                            types={types}
                          />
                        ) : r.summary ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground">{r.summary}</span>
                            <span className="text-muted-foreground/70">
                              [{r.data.length}]
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            [{r.data.length} felt{r.data.length === 1 ? "" : "s"}]
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}

/** Translate the data felts of a few well-known event shapes into a
 *  one-line summary (token amount, NFT id, batch count). Falls back to
 *  null so the renderer keeps the existing "[N felts]" form for
 *  events we don't have a decoder for. */
function summarizeEventData(
  name: string | null,
  fromAddress: string,
  data: string[],
): string | null {
  if (!name || !data || data.length === 0) return null;
  const meta = TOKEN_META[fromAddress];
  if (name === "Transfer") {
    if (data.length === 1) {
      // ERC-721 — single felt id.
      return `tokenId=${data[0]}`;
    }
    if (data.length >= 2) {
      // ERC-20 — u256 (low, high).
      const amount = decodeU256(data[0], data[1]);
      const symbol = meta?.symbol ?? "tokens";
      const decimals = meta?.decimals ?? 18;
      return `${formatTokenAmount(amount, decimals)} ${symbol}`;
    }
  }
  if (name === "Approval" && data.length >= 2) {
    const amount = decodeU256(data[0], data[1]);
    const symbol = meta?.symbol ?? "tokens";
    const decimals = meta?.decimals ?? 18;
    return `approve ${formatTokenAmount(amount, decimals)} ${symbol}`;
  }
  if (name === "TransferSingle" && data.length >= 4) {
    const id = decodeU256(data[0], data[1]);
    const value = decodeU256(data[2], data[3]);
    return `id ${id}, value ${value}`;
  }
  if (name === "TransferBatch" && data.length >= 1) {
    try {
      const idsLen = Number(BigInt(data[0]));
      return `${idsLen} batched id${idsLen === 1 ? "" : "s"}`;
    } catch {
      return null;
    }
  }
  if (name === "ApprovalForAll" && data.length >= 1) {
    return data[0] === "0x0" || data[0] === "0x" ? "revoked" : "granted";
  }
  return null;
}

/** Voyager-style typed-fields renderer for events. Walks the bridge's
 *  AbiEventDecoded.fields pairing each one with its felt slice from
 *  keys (skipping the selector at keys[0]) and data. Cairo events are
 *  conventionally KEY-then-DATA layout: indexed fields come first in
 *  keys[1..], non-indexed fields come from data[]. We don't currently
 *  receive the per-field `kind: "key"|"data"` from the bridge, so we
 *  consume keys[1..] until they're exhausted, then fall through to
 *  data[]. Works for the standard ERC20/ERC721/account event shapes. */
function DecodedEventFields({
  fields,
  keys,
  data,
  types,
}: {
  fields: import("@/chains/starknet/simulatorTypes").AbiParam[];
  keys: string[];
  data: string[];
  types?: Record<string, import("@/chains/starknet/simulatorTypes").AbiTypeDef>;
}) {
  // keys[0] is the selector itself.
  const indexedFelts = keys.slice(1);
  const consumed: Array<{ name: string; type: string; raw: string; rendered: string }> = [];
  let ki = 0;
  let di = 0;
  for (const f of fields) {
    const norm = f.type.replace(/\s+/g, "");
    const isU256 = norm.endsWith("::u256") || norm === "u256";
    const take = (n: number): string[] => {
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        if (ki < indexedFelts.length) out.push(indexedFelts[ki++]);
        else if (di < data.length) out.push(data[di++]);
        else out.push("0x0");
      }
      return out;
    };
    if (isU256) {
      const [lo, hi] = take(2);
      let value = "0";
      try {
        value = (((BigInt(hi) << 128n) | BigInt(lo))).toString();
      } catch { /* keep 0 */ }
      consumed.push({ name: f.name, type: f.type, raw: `${lo}|${hi}`, rendered: value });
    } else {
      const [v] = take(1);
      consumed.push({ name: f.name, type: f.type, raw: v, rendered: v });
    }
  }
  return (
    <div className="space-y-0.5">
      {consumed.map((c, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className="text-foreground">{c.name}</span>
          <span className="text-muted-foreground/70 text-[9px]">{lastSeg(c.type)}</span>
          <span className="text-foreground break-all" title={c.raw}>
            {c.rendered}
          </span>
        </div>
      ))}
    </div>
  );
}

function lastSeg(ty: string): string {
  const seg = ty.split("::").slice(-1)[0] ?? ty;
  return seg.replace(/[<>]/g, "");
}
