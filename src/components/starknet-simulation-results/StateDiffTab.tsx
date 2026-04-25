import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { shortHex } from "./decoders";

export function StateDiffTab({
  result,
  addressLabels = {},
}: {
  result: SimulationResult;
  /** Built once at the response root and shared with this and other
   *  tabs so labels stay consistent (Account / ETH / STRK / etc). */
  addressLabels?: Record<string, string>;
}) {
  const sd = result.stateDiff;
  if (!sd) {
    return (
      <Card className="p-6 text-sm text-muted-foreground leading-relaxed border-dashed">
        <div className="text-xs uppercase text-muted-foreground mb-2">State diff</div>
        Bridge response has no <span className="font-mono">stateDiff</span> field — this fixture
        predates the Sprint 4 plumbing. Re-run against a current bridge build.
      </Card>
    );
  }

  const firstTouchCount = sd.storageDiffs.reduce(
    (n, grp) => n + grp.storageEntries.filter((e) => isZeroFelt(e.before)).length,
    0,
  );

  // Free-text filter — matches contract address, contract label
  // (Account / ETH / STRK / …), or storage key. Empty = pass-through.
  // First-touch toggle slices to rows where before === 0.
  const [filter, setFilter] = useState("");
  const [onlyFirstTouch, setOnlyFirstTouch] = useState(false);
  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sd.storageDiffs
      .map((grp) => {
        const lbl = (addressLabels[grp.address] || "").toLowerCase();
        const addrMatches = !q || grp.address.toLowerCase().includes(q) || lbl.includes(q);
        const entries = grp.storageEntries.filter((e) => {
          if (onlyFirstTouch && !isZeroFelt(e.before)) return false;
          if (!q) return true;
          if (addrMatches) return true;
          return e.key.toLowerCase().includes(q);
        });
        return { ...grp, storageEntries: entries };
      })
      .filter((grp) => grp.storageEntries.length > 0);
  }, [sd.storageDiffs, addressLabels, filter, onlyFirstTouch]);
  const filteredEntryCount = filteredGroups.reduce(
    (n, g) => n + g.storageEntries.length,
    0,
  );
  const totalEntryCount = sd.storageDiffs.reduce(
    (n, g) => n + g.storageEntries.length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <SummaryCard label="contracts touched" value={sd.summary.contractsTouched} />
        <SummaryCard label="storage writes" value={sd.summary.storageWrites} />
        <SummaryCard label="nonce updates" value={sd.summary.nonceUpdates} />
        <SummaryCard label="class hash updates" value={sd.summary.classHashUpdates} />
      </div>

      <Card className="p-4 gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase text-muted-foreground">Storage writes</div>
            {firstTouchCount > 0 && (
              <Badge variant="info" size="sm" data-testid="first-touch-summary">
                {firstTouchCount} first-touch
              </Badge>
            )}
            {filter.trim() || onlyFirstTouch ? (
              <span className="text-[10px] text-muted-foreground">
                {filteredEntryCount} of {totalEntryCount} matched
              </span>
            ) : null}
          </div>
          <span className="text-[10px] text-muted-foreground">
            canonical — emitted by trace_map.rs
          </span>
        </div>
        {sd.storageDiffs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            No storage writes in this transaction.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter by contract label, address, or key prefix"
                className="font-mono text-xs h-8 max-w-md"
                data-testid="storage-filter"
              />
              <button
                type="button"
                onClick={() => setOnlyFirstTouch((v) => !v)}
                aria-pressed={onlyFirstTouch}
                data-testid="filter-first-touch"
                className={`text-[10px] px-2 py-1 rounded-md border ${
                  onlyFirstTouch
                    ? "border-info bg-info/10 text-info"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                first-touch only
              </button>
              {(filter.trim() || onlyFirstTouch) && filteredEntryCount === 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  No rows match.
                </span>
              ) : null}
            </div>
          </>
        )}
        {sd.storageDiffs.length === 0 ? null : filteredGroups.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Storage key</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.flatMap((grp) => {
                const lbl = addressLabels[grp.address];
                return grp.storageEntries.map((e, i) => {
                  const isFirstWrite = isZeroFelt(e.before);
                  return (
                    <TableRow key={`${grp.address}-${i}`}>
                      {i === 0 ? (
                        <TableCell rowSpan={grp.storageEntries.length} className="align-top">
                          {lbl ? (
                            <div className="text-success text-xs">{lbl}</div>
                          ) : null}
                          <div className="font-mono text-muted-foreground text-[10px] flex items-center gap-1">
                            {shortHex(grp.address)}
                            <CopyButton value={grp.address} className="h-4 w-4" iconSize={10} />
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">
                            {grp.storageEntries.length} write
                            {grp.storageEntries.length === 1 ? "" : "s"}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-mono text-[11px] text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{shortHex(e.key)}</span>
                          {isFirstWrite && (
                            <Badge
                              variant="info"
                              size="sm"
                              data-testid="first-touch-pill"
                              title="Slot was zero before this transaction"
                            >
                              new
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {shortHex(e.before ?? "0x0")}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-warning">
                        {shortHex(e.value)}
                      </TableCell>
                    </TableRow>
                  );
                });
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4 gap-3">
        <div className="text-xs uppercase text-muted-foreground">Nonce updates</div>
        {sd.nonceUpdates.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            No nonce updates.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>New nonce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sd.nonceUpdates.map((n, i) => {
                const lbl = addressLabels[n.contractAddress];
                return (
                  <TableRow key={i}>
                    <TableCell>
                      {lbl ? (
                        <div className="text-info text-xs">{lbl}</div>
                      ) : null}
                      <div className="font-mono text-[11px] text-foreground">
                        {shortHex(n.contractAddress)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-warning">{n.nonce}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {sd.classHashUpdates && sd.classHashUpdates.length > 0 ? (
        <Card className="p-4 gap-3">
          <div className="text-xs uppercase text-muted-foreground">Class hash updates</div>
          <Table>
            <TableBody>
              {sd.classHashUpdates.map((c, i) => {
                const lbl = addressLabels[c.contractAddress];
                return (
                  <TableRow key={i}>
                    <TableCell>
                      {lbl ? (
                        <div className="text-info text-xs">{lbl}</div>
                      ) : null}
                      <div className="font-mono text-[11px] text-foreground">
                        {shortHex(c.contractAddress)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-warning">
                      {shortHex(c.classHash)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

/** Slot was zero (or unset) before the tx — i.e. this is the first
 *  write to that key. Treat null/undefined the same as 0x0; cairo
 *  storage's default value is 0. */
function isZeroFelt(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  try {
    return BigInt(value) === 0n;
  } catch {
    return false;
  }
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-2.5 gap-0">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-foreground text-lg">{value}</div>
    </Card>
  );
}
