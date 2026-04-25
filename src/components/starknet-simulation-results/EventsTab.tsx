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
import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { contractLabel, eventName, shortHex, walkInvocations } from "./decoders";

export function EventsTab({ result }: { result: SimulationResult }) {
  const rows: Array<{ from: string; keys: string[]; data: string[] }> = [];
  for (const f of walkInvocations(result)) {
    for (const e of f.events || []) {
      rows.push({ from: e.fromAddress, keys: e.keys, data: e.data });
    }
  }

  const [filter, setFilter] = useState("");
  // Pre-resolve decoded names + labels once so filtering doesn't have
  // to recompute on every keystroke.
  const annotated = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        decodedName: eventName({
          fromAddress: r.from,
          keys: r.keys,
          data: r.data,
        }),
        fromLabel: contractLabel(r.from),
      })),
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
                      <TableCell className="font-mono text-[10px] text-foreground">
                        {r.keys.slice(1).map((k) => shortHex(k)).join(" · ") || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-foreground">
                        [{r.data.length} felt{r.data.length === 1 ? "" : "s"}]
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
