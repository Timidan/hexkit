import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Play, DownloadSimple } from "@phosphor-icons/react";
import CallComposer, { useCallInput } from "./CallComposer";
import { prepareCall } from "./simulation";
import { dryRun } from "../dryRun";
import type { RunResultT, VaraCase } from "../case";
import { subscanExtrinsic } from "../links";
import RecentMessages from "./RecentMessages";
import { decodeCall, decodeReply, loadIdl } from "../decode";
import { ValueTree } from "../ui/ValueTree";
import { HexChip } from "../ui/HexChip";
import { errorText, download, jsonText } from "./files";
import { IconAction } from "../ui/IconAction";
import { Panel, ToolHeader } from "../ui/Panel";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import { preflight } from "./resources";
import { ResourceReport, type ResourceResult } from "./ResourceReport";

export default function SimulatorTool() {
  const [input, setInput] = useCallInput();
  const [idl, setIdl] = useState("");
  const [result, setResult] = useState<{ run: RunResultT; decoded: unknown; input: typeof input } | null>(null);
  const [compare, setCompare] = useState("");
  const [other, setOther] = useState<RunResultT | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sample, setSample] = useState<{ source: VaraCase; signature: string } | null>(null);
  const alive = useRef(true);
  const latestInput = useRef(input);
  latestInput.current = input;
  const [gas, setGas] = useState<ResourceResult | null>(null);
  useEffect(() => { setResult(null); setOther(null); setGas(null); setError(""); }, [input.program, input.origin, input.payload, input.value, input.gasLimit, input.block]);
  const [params, setParams] = useSearchParams();
  // One call, two readings of it: the dry-run reply, or gas, balances and vouchers at the same snapshot.
  const view = params.get("view") === "gas" ? "gas" : "reply";
  // From the live URL, like useCallInput: a sample writes its call and its view in the same event.
  function showView(next: "reply" | "gas") { const p = new URLSearchParams(window.location.search); if (next === "gas") p.set("view", "gas"); else p.delete("view"); setParams(p, { replace: true }); }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // A replayed sample runs before its program's IDL has loaded: decode the reply as soon as the IDL arrives.
  useEffect(() => {
    const reply = result?.run.reply;
    if (!idl || !result || result.decoded !== null || !reply?.success) return;
    let live = true;
    void loadIdl(idl).then((sails) => {
      if (live) setResult((r) => r === result ? { ...r, decoded: decodeReply(reply.payload, decodeCall(prepareCall(r.input).input.payload, sails), sails) } : r);
    }).catch(() => { /* the raw reply stays on screen */ });
    return () => { live = false; };
  }, [idl, result]);
  async function simulate(current = input, interfaceText = idl, comparison = compare) {
    const signature = JSON.stringify(current);
    setBusy(true); setError(""); setResult(null); setOther(null);
    try {
      const call = prepareCall(current);
      const runs = await Promise.all([dryRun(call.programId, call.input, null), comparison.trim() ? dryRun(call.programId, prepareCall({ ...current, block: comparison.trim() }).input, null) : null]);
      let decoded: unknown = null;
      if (runs[0].reply?.success && interfaceText) { const sails = await loadIdl(interfaceText); decoded = decodeReply(runs[0].reply.payload, decodeCall(call.input.payload, sails), sails); }
      if (alive.current && JSON.stringify(latestInput.current) === signature) { setResult({ run: runs[0], decoded, input: { ...current } }); setOther(runs[1]); }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function checkGas() {
    const signature = JSON.stringify(input);
    showView("gas"); setBusy(true); setError(""); setGas(null);
    try { const report = await preflight(input); if (alive.current && JSON.stringify(latestInput.current) === signature) setGas(report); }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="space-y-5">
    <ToolHeader title="Message simulation" source="Vara mainnet" />
    <details><summary className="min-h-9 cursor-pointer content-center text-sm text-muted-foreground">Choose a recent message</summary><div className="pt-2"><RecentMessages disabled={busy || sampleLoading} onLoading={setSampleLoading} onSelect={(next, source) => {
      // The sample finished loading after the user left this tool: applying it would rewrite the URL of the tool now on screen.
      if (window.location.pathname !== "/vara/transactions" || new URLSearchParams(window.location.search).get("tool") !== "simulator") return;
      if (JSON.stringify(latestInput.current) !== JSON.stringify(input)) { setError("Your call changed while the sample loaded. Select the sample again to replace it."); return; }
      setInput(next); setCompare(""); setSample({ source, signature: JSON.stringify(next) }); showView("reply"); void simulate(next, "", "");
    }} /></div></details>
    <div className="grid items-start gap-4 lg:grid-cols-2">
    <Panel title="Call" footer={<>
      <Button disabled={busy || sampleLoading} onClick={() => { showView("reply"); void simulate(); }}><Play weight="fill" />{sampleLoading ? "Loading sample…" : busy && view === "reply" ? "Simulating…" : "Simulate message"}</Button>
      <Button variant="outline" disabled={busy || sampleLoading} onClick={() => void checkGas()}>{busy && view === "gas" ? "Checking…" : "Check gas & vouchers"}</Button>
      {(result || gas || busy) && <a href="#vara-simulation-result" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 lg:hidden">View result</a>}
    </>}>
      {sample && sample.signature === JSON.stringify(input) && <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-relaxed" role="status">
        Sample <a className="font-mono underline underline-offset-2" href={subscanExtrinsic(sample.source.block.number, sample.source.extrinsicIndex)} target="_blank" rel="noreferrer">{sample.source.block.number}-{sample.source.extrinsicIndex}</a> · state before block {sample.source.block.number}. Earlier calls within that block are excluded; this is not an exact replay. <Link className="underline underline-offset-2" to={`/vara/transactions?tool=message&id=${sample.source.block.number}-${sample.source.extrinsicIndex}&msg=${sample.source.messageIndex ?? 0}`}>Inspect original</Link>
      </p>}
      {error && <p role="alert" className="rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-400">{error}</p>}
      <CallComposer input={input} onChange={(next) => { setInput(next); setResult(null); setOther(null); }} onIdl={setIdl} disabled={busy || sampleLoading} />
      <details className="border-t border-border/60 pt-3"><summary className="min-h-8 cursor-pointer content-center text-sm">Compare with another block {compare.trim() && <span className="text-xs text-muted-foreground">· {compare.trim()}</span>}</summary><label className="mt-3 block space-y-1.5 text-sm">Comparison block<Input className="font-mono" value={compare} disabled={busy} placeholder="Block number or latest" onChange={(e) => { setCompare(e.target.value); setOther(null); }} /></label></details>
      <details className="text-xs text-muted-foreground"><summary className="min-h-8 cursor-pointer content-center hover:text-foreground">Simulation limits</summary><p className="pb-1 leading-relaxed">Runs do not save state or validate nonces, fee payment, or voucher eligibility. Use Scenario Tests for a sequence of state-changing calls.</p></details>
    </Panel>
    <Panel id="vara-simulation-result" aria-live="polite" title="Result" className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
      actions={<>
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => { if (v) showView(v as "reply" | "gas"); }} aria-label="Result view">
          <ToggleGroupItem value="reply">Reply</ToggleGroupItem>
          <ToggleGroupItem value="gas">Gas & vouchers</ToggleGroupItem>
        </ToggleGroup>
        {view === "gas" && gas && <IconAction label="Export report as JSON" onClick={() => download("vara-preflight.json", jsonText(gas))}><DownloadSimple size={16} /></IconAction>}
        {view === "reply" && result && <><Badge variant={result.run.error ? "warning" : result.run.reply?.success ? "success" : "destructive"}>{result.run.error ? "Unavailable" : result.run.reply?.success ? "Successful reply" : "Failed reply"}</Badge>
        <IconAction label="Export simulation as JSON" onClick={() => download("vara-simulation.json", jsonText({ ...result, comparison: other }))}><DownloadSimple size={16} /></IconAction></>}
      </>}>
      {view === "gas" ? (gas ? <ResourceReport result={gas} /> : <p className="text-sm text-muted-foreground">{busy ? "Checking your call…" : "No estimate yet."}</p>) : <>
      {!result && <p className="text-sm text-muted-foreground">{busy ? "Running your call…" : "No simulation yet."}</p>}
      {result && <>
        <div className={`grid gap-3 ${other ? "lg:grid-cols-2" : ""}`}>{[result.run, ...(other ? [other] : [])].map((run, i) => <div key={i} className="min-w-0 space-y-2 rounded-md bg-background/40 p-3"><p className="text-sm font-medium">{other ? `${i ? "B" : "A"} · ` : ""}Block {run.block?.number ?? "unavailable"}</p>{run.block && <HexChip value={run.block.hash} label="simulation block hash" />}<p className="text-xs text-muted-foreground">Runtime spec {run.specVersion ?? "unavailable"}</p>{run.error ? <p role="alert" className="text-sm text-red-400">{run.error}</p> : <ValueTree value={run.reply} rootLabel="reply" />}</div>)}</div>
        {result.decoded !== null && <ValueTree value={result.decoded} rootLabel="decoded reply" />}
        {other && <p className="text-sm">{result.run.error || other.error ? "Comparison is incomplete because a run was unavailable." : jsonText(result.run.reply) === jsonText(other.reply) ? "Both snapshots returned the same reply." : "The reply changed between snapshots."}</p>}
      </>}
      </>}
    </Panel>
    </div>
  </div>;
}
