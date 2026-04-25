import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { SimulateResponse, SimulationResult } from "@/chains/starknet/simulatorTypes";
import { shortHex } from "./decoders";

export function DevInfoTab({
  response,
  result,
}: {
  response: SimulateResponse;
  result: SimulationResult;
}) {
  const ctx = response.blockContext;
  const blockRows: Array<[string, string]> = [
    ["Block number", ctx.blockNumber.toLocaleString()],
    ["Block hash", ctx.blockHash],
    ["Parent (timestamp)", `${new Date(ctx.timestamp * 1000).toUTCString()} (${ctx.timestamp})`],
    ["Sequencer", shortHex(ctx.sequencerAddress)],
    ["Starknet version", ctx.starknetVersion],
    ["L1 gas price (wei)", ctx.l1GasPrice?.priceInWei || "—"],
    ["L1 gas price (fri)", ctx.l1GasPrice?.priceInFri || "—"],
    ["L1 data gas (wei)", ctx.l1DataGasPrice?.priceInWei || "—"],
    ["L1 data gas (fri)", ctx.l1DataGasPrice?.priceInFri || "—"],
  ];
  const fee = result.feeEstimate;
  const feeRows: Array<[string, string]> = [
    ["Overall fee", fee.overallFee],
    ["L1 gas consumed", fee.l1GasConsumed],
    ["L1 data gas consumed", fee.l1DataGasConsumed],
    ["L2 gas consumed", fee.l2GasConsumed],
    ["Unit", fee.unit],
  ];
  const res = result.executionResources;
  const resRows: Array<[string, string]> = [
    ["Steps", res.steps?.toLocaleString() ?? "—"],
    ["Memory holes", res.memoryHoles?.toLocaleString() ?? "—"],
    ["L1 gas", res.l1Gas?.toLocaleString() ?? "—"],
    ["L1 data gas", res.l1DataGas?.toLocaleString() ?? "—"],
    ["L2 gas", res.l2Gas?.toLocaleString() ?? "—"],
    [
      "Builtins",
      Object.entries(res.builtinInstanceCounter || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(" · "),
    ],
  ];

  return (
    <div className="space-y-4">
      <Section title="Block context" rows={blockRows} />
      <Section title="Fee estimate (raw)" rows={feeRows} />
      <Section title="Execution resources (raw)" rows={resRows} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <Card className="p-4 gap-3">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <Table>
        <TableBody>
          {rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="text-muted-foreground w-44">{k}</TableCell>
              <TableCell className="font-mono text-foreground break-all">{v || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
