import type { SimulateResponse, SimulationResult } from "@/chains/starknet/simulatorTypes";
import { shortHex } from "./decoders";

export function DevInfoTab({ response, result }: { response: SimulateResponse; result: SimulationResult }) {
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
    ["Builtins", Object.entries(res.builtinInstanceCounter || {}).map(([k, v]) => `${k}=${v}`).join(" · ")],
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="text-xs uppercase text-zinc-500">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-zinc-800/50">
              <td className="py-1.5 px-2 text-zinc-500 w-44">{k}</td>
              <td className="py-1.5 px-2 font-mono text-zinc-200 break-all">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
