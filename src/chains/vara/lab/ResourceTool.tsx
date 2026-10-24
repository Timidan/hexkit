import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import CallComposer, { useCallInput } from "./CallComposer";
import { preflight } from "./resources";
import { download, errorText, jsonText } from "./files";
import { ValueTree } from "../ui/ValueTree";
import { fromPlancks } from "../ui/AmountInput";
import { HexChip } from "../ui/HexChip";
import { IconAction } from "../ui/IconAction";
import { Panel, ToolHeader } from "../ui/Panel";
import { DownloadSimple } from "@phosphor-icons/react";

export default function ResourceTool() {
  const [input, setInput] = useCallInput();
  const [, setParams] = useSearchParams();
  const [result, setResult] = useState<Awaited<ReturnType<typeof preflight>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(true);
  const latestInput = useRef(input);
  latestInput.current = input;
  useEffect(() => { setResult(null); }, [input.program, input.origin, input.payload, input.value, input.gasLimit, input.block]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function check() {
    const signature = JSON.stringify(input);
    setBusy(true); setError(""); setResult(null);
    try { const report = await preflight(input); if (alive.current && JSON.stringify(latestInput.current) === signature) setResult(report); }
    catch (err) { if (alive.current) setError(errorText(err)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="space-y-5">
    <ToolHeader title="Gas & vouchers" />
    <div className="grid items-start gap-4 lg:grid-cols-2">
    <Panel title="Call" actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => setParams((p) => { p.set("tool", "simulator"); return p; })}>{input.program ? "Open this call in simulation" : "Choose a message sample"}</Button>} footer={<>
      <Button disabled={busy} onClick={() => void check()}>{busy ? "Checking resources…" : "Check gas & vouchers"}</Button>
      {(result || busy) && <a href="#vara-resource-result" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 lg:hidden">View result</a>}
    </>}>
      {error && <p role="alert" className="max-w-md break-words rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-400">{error}</p>}
      <CallComposer input={input} disabled={busy} onChange={(v) => { setInput(v); setResult(null); }} />
    </Panel>
    <Panel id="vara-resource-result" aria-live="polite" title={result ? `Snapshot at block ${result.reply.block?.number ?? "unavailable"}` : "Resource report"} className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
      actions={result && <IconAction label="Export report as JSON" onClick={() => download("vara-preflight.json", jsonText(result))}><DownloadSimple size={16} /></IconAction>}>
      {!result && <p className="text-sm text-muted-foreground">{busy ? "Checking your call…" : "No estimate yet."}</p>}
    {result && <>
      <p className="text-xs text-muted-foreground">Reply, balances, and vouchers use this block. Gas and transaction fees use the current head, estimated {new Date(result.estimatedAt).toLocaleTimeString()}. Estimates and funding checks do not guarantee admission or application success. VARA amounts are shown exactly. Raw balance evidence remains in plancks; gas counts are separate units.</p>
      {result.warnings.map((w) => <p key={w} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">{w}</p>)}
      <div className="grid gap-4 xl:grid-cols-2"><ValueTree value={{ sender: result.senderBalance, program: result.programBalance }} rootLabel="balances" /><ValueTree value={result.reply.error ?? result.reply.reply} rootLabel="simulated reply" /></div>
      <section className="space-y-3 border-t border-border/60 pt-4"><h3 className="text-sm font-semibold">Gas estimate</h3>{result.gasError ? <p role="alert" className="text-sm text-amber-400">Unavailable: {result.gasError}</p> : result.gas && <><dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries({ "Minimum gas": result.gas.minLimit, "Burned gas": result.gas.burned, "Reserved gas": result.gas.reserved, "Gas potentially returned": result.gas.mayBeReturned, "Proposed gas limit": result.gas.limit, "Gas purchase (VARA)": fromPlancks(result.gas.purchase), "Transaction fee (VARA)": fromPlancks(result.gas.transactionFee), "Entered waitlist": String(result.gas.waited) }).map(([key,value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-all font-mono">{value}</dd></div>)}</dl><p className="text-xs text-muted-foreground">A zero input gas limit selects the estimated minimum plus 10%. Gas purchase is an upfront amount; unused gas can be returned.</p></>}</section>
      <section className="space-y-3 border-t border-border/60 pt-4"><h3 className="text-sm font-semibold">Sender’s vouchers</h3>{result.voucherError && <p role="alert" className="text-sm text-amber-400">Unavailable: {result.voucherError}</p>}{result.vouchers?.length === 0 && <p className="text-sm text-muted-foreground">No vouchers found for this sender at the snapshot.</p>}{result.vouchers?.map((v) => <article key={v.id} className="space-y-2 rounded-md bg-background/40 p-3"><div className="flex flex-wrap items-center gap-2"><HexChip value={v.id} label="voucher" /><Badge variant={v.status === "Scope eligible" ? "success" : "warning"}>{v.status}</Badge></div><p className="text-xs text-muted-foreground">Expires at block {v.expiry} · {v.programs === null ? "All programs" : `${v.programs.length} allowed programs`}</p><p className="text-sm">Available: <span className="font-mono">{fromPlancks(v.balance.available)}</span> VARA · {v.coversGasAndFee === null ? "Funding comparison unavailable" : v.coversGasAndFee ? "Covers estimated gas and voucher fee" : "Below estimated gas and voucher fee"}</p><ValueTree value={{ owner: v.owner, allowedPrograms: v.programs, estimatedFee: v.estimatedFee }} rootLabel="voucher details" /></article>)}</section>
    </>}
    </Panel>
    </div>
  </div>;
}
