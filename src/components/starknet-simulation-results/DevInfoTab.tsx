import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/ui/copy-button";
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
  const tx = response.txBody;
  const rcpt = response.txReceipt;
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
      {tx && <TxBodySection tx={tx} />}
      {rcpt && <TxReceiptSection rcpt={rcpt} />}
      <Section title="Block context" rows={blockRows} />
      <Section title="Fee estimate (raw)" rows={feeRows} />
      <Section title="Execution resources (raw)" rows={resRows} />
    </div>
  );
}

function TxBodySection({ tx }: { tx: NonNullable<SimulateResponse["txBody"]> }) {
  const rb = tx.resource_bounds;
  return (
    <Card className="p-4 gap-3">
      <div className="text-xs uppercase text-muted-foreground">Transaction body</div>
      <Table>
        <TableBody>
          <DevRow label="Hash" value={tx.transaction_hash} copy />
          <DevRow label="Type" value={tx.type} />
          <DevRow label="Version" value={tx.version} />
          <DevRow label="Sender" value={tx.sender_address} copy />
          <DevRow label="Nonce" value={tx.nonce} />
          <DevRow label="Tip" value={tx.tip} />
          <DevRow
            label="Nonce DA"
            value={tx.nonce_data_availability_mode}
          />
          <DevRow
            label="Fee DA"
            value={tx.fee_data_availability_mode}
          />
          {rb?.l1_gas && (
            <DevRow
              label="L1 gas bound"
              value={`${rb.l1_gas.max_amount} max @ ${rb.l1_gas.max_price_per_unit}`}
            />
          )}
          {rb?.l1_data_gas && (
            <DevRow
              label="L1 data gas bound"
              value={`${rb.l1_data_gas.max_amount} max @ ${rb.l1_data_gas.max_price_per_unit}`}
            />
          )}
          {rb?.l2_gas && (
            <DevRow
              label="L2 gas bound"
              value={`${rb.l2_gas.max_amount} max @ ${rb.l2_gas.max_price_per_unit}`}
            />
          )}
          {tx.signature && tx.signature.length > 0 && (
            <DevRow
              label="Signature"
              value={tx.signature.join("\n")}
              mono
              wrap
              copy
            />
          )}
          {tx.calldata && tx.calldata.length > 0 && (
            <DevRow
              label="Calldata"
              value={`[${tx.calldata.length} felts] ${tx.calldata.slice(0, 6).join(", ")}${tx.calldata.length > 6 ? `, … +${tx.calldata.length - 6}` : ""}`}
              copy
              copyValue={JSON.stringify(tx.calldata)}
            />
          )}
          {tx.paymaster_data && tx.paymaster_data.length > 0 && (
            <DevRow
              label="Paymaster data"
              value={tx.paymaster_data.join(", ")}
              wrap
            />
          )}
          {tx.account_deployment_data && tx.account_deployment_data.length > 0 && (
            <DevRow
              label="Deployment data"
              value={tx.account_deployment_data.join(", ")}
              wrap
            />
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function TxReceiptSection({
  rcpt,
}: {
  rcpt: NonNullable<SimulateResponse["txReceipt"]>;
}) {
  return (
    <Card className="p-4 gap-3">
      <div className="text-xs uppercase text-muted-foreground">Receipt</div>
      <Table>
        <TableBody>
          <DevRow label="Block number" value={rcpt.block_number?.toLocaleString()} />
          <DevRow label="Block hash" value={rcpt.block_hash} copy />
          <DevRow label="Finality" value={rcpt.finality_status} />
          <DevRow label="Execution" value={rcpt.execution_status} />
          {rcpt.actual_fee && (
            <DevRow
              label="Actual fee"
              value={`${rcpt.actual_fee.amount} ${rcpt.actual_fee.unit}`}
            />
          )}
          {rcpt.events && (
            <DevRow
              label="Events on chain"
              value={(rcpt.events as unknown[]).length.toLocaleString()}
            />
          )}
          {rcpt.messages_sent && (
            <DevRow
              label="L1 messages on chain"
              value={(rcpt.messages_sent as unknown[]).length.toLocaleString()}
            />
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function DevRow({
  label,
  value,
  mono = true,
  wrap = false,
  copy = false,
  copyValue,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
  wrap?: boolean;
  copy?: boolean;
  copyValue?: string;
}) {
  if (value === undefined || value === null || value === "") return null;
  // Stable id for the parity harness / e2e tests; slugged from label.
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <TableRow data-dev-row={id}>
      <TableCell className="text-muted-foreground w-44 align-top">{label}</TableCell>
      <TableCell
        className={`${mono ? "font-mono" : ""} text-foreground ${
          wrap ? "whitespace-pre-wrap break-all" : "break-all"
        }`}
      >
        <div className="flex items-start gap-1.5">
          <span>{value}</span>
          {copy && (
            <CopyButton value={copyValue ?? value} className="h-4 w-4 shrink-0" iconSize={10} />
          )}
        </div>
      </TableCell>
    </TableRow>
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
