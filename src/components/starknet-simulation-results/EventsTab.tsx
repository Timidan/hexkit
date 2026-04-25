import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  return (
    <Card className="p-4 gap-3">
      <div className="text-xs uppercase text-muted-foreground">
        Emitted events ({rows.length})
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          Transaction emitted no events. Verify the call did not silently revert.
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
            {rows.map((r, i) => {
              const name = eventName({ fromAddress: r.from, keys: r.keys, data: r.data });
              const fromLbl = contractLabel(r.from);
              return (
                <TableRow key={i}>
                  <TableCell className="font-mono text-muted-foreground">{i}</TableCell>
                  <TableCell>
                    {name ? (
                      <Badge variant="info" size="sm">
                        {name}
                      </Badge>
                    ) : (
                      <span className="font-mono text-muted-foreground text-[10px]">
                        {shortHex(r.keys[0])}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {fromLbl ? <span className="text-success">{fromLbl} </span> : null}
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
    </Card>
  );
}
