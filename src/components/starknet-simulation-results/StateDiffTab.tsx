import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SimulationResult } from "@/chains/starknet/simulatorTypes";
import { contractLabel, shortHex } from "./decoders";

export function StateDiffTab({ result }: { result: SimulationResult }) {
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <SummaryCard label="contracts touched" value={sd.summary.contractsTouched} />
        <SummaryCard label="storage writes" value={sd.summary.storageWrites} />
        <SummaryCard label="nonce updates" value={sd.summary.nonceUpdates} />
        <SummaryCard label="class hash updates" value={sd.summary.classHashUpdates} />
      </div>

      <Card className="p-4 gap-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">Storage writes</div>
          <span className="text-[10px] text-muted-foreground">
            canonical — emitted by trace_map.rs
          </span>
        </div>
        {sd.storageDiffs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            No storage writes in this transaction.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Storage key</TableHead>
                <TableHead>→ New value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sd.storageDiffs.flatMap((grp) => {
                const lbl = contractLabel(grp.address);
                return grp.storageEntries.map((e, i) => (
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
                      {shortHex(e.key)}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-warning">
                      {shortHex(e.value)}
                    </TableCell>
                  </TableRow>
                ));
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
              {sd.nonceUpdates.map((n, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-[11px] text-foreground">
                    {shortHex(n.contractAddress)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-warning">{n.nonce}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {sd.classHashUpdates && sd.classHashUpdates.length > 0 ? (
        <Card className="p-4 gap-3">
          <div className="text-xs uppercase text-muted-foreground">Class hash updates</div>
          <Table>
            <TableBody>
              {sd.classHashUpdates.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-[11px] text-foreground">
                    {shortHex(c.contractAddress)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-warning">
                    {shortHex(c.classHash)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-2.5 gap-0">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-foreground text-lg">{value}</div>
    </Card>
  );
}
