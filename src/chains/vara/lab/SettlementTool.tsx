import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ETH_NETWORKS, inspectSettlement } from "./settlement";
import type { SettlementInput } from "./settlement";
import { selectClass } from "./CallComposer";
import { download, errorText, jsonText } from "./files";
import { ValueTree } from "../ui/ValueTree";
import { DownloadSimple } from "@phosphor-icons/react";
import { IconAction } from "../ui/IconAction";
import { Panel, ToolHeader } from "../ui/Panel";

export default function SettlementTool() {
  const [input, setInput] = useState<SettlementInput>({ network: "hoodi", transaction: "", settlementTransaction: "", message: "", mirror: "", from: "", to: "", validator: "" });
  const [result, setResult] = useState<Awaited<ReturnType<typeof inspectSettlement>> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function inspect() {
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setResult(null); setError("");
    try { const report = await inspectSettlement(input, controller.signal); if (!controller.signal.aborted) setResult(report); }
    catch (err) { if (!controller.signal.aborted) setError(errorText(err)); }
    finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  }
  return <div className="space-y-5">
    <ToolHeader title="Vara.eth settlement inspector" />
    <Panel footer={<>
      <Button disabled={busy} onClick={() => void inspect()}>{busy ? "Inspecting Ethereum evidence…" : "Inspect settlement"}</Button>{busy && <Button variant="outline" onClick={() => abort.current?.abort()}>Cancel</Button>}

    </>}>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <label className="block max-w-sm space-y-1.5 text-sm">Ethereum network<select className={selectClass} disabled={busy} value={input.network} onChange={(e) => { setInput({ ...input, network: e.target.value as SettlementInput["network"] }); setResult(null); }}>{Object.entries(ETH_NETWORKS).map(([key,n]) => <option key={key} value={key}>{n.name}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">{([
      ["transaction", "Request transaction hash", "0x…"], ["settlementTransaction", "Known settlement transaction (optional)", "0x…"],
    ] as const).map(([key,label,placeholder]) => <label key={key} className="space-y-1.5 text-sm">{label}<Input className="font-mono text-xs" disabled={busy} value={input[key]} placeholder={placeholder} onChange={(e) => { setInput({ ...input, [key]: e.target.value }); setResult(null); }} /></label>)}</div>
    <details className="border-t border-border/60 pt-3"><summary className="min-h-9 cursor-pointer content-center text-sm">Message lookup & search options</summary>
    <p className="mt-2 text-xs text-muted-foreground">Without a request transaction, supply a message id, Mirror address and starting block.</p>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">{([
      ["message", "Message id", "0x…"], ["mirror", "Mirror address", "0x…"], ["from", "From Ethereum block", "Request block"], ["to", "Through Ethereum block", "Up to 5,000 blocks after the start"], ["validator", "Local validator HTTP endpoint (optional)", "http://127.0.0.1:9944"],
    ] as const).map(([key,label,placeholder]) => <label key={key} className="space-y-1.5 text-sm">{label}<Input className="font-mono text-xs" disabled={busy} value={input[key]} placeholder={placeholder} onChange={(e) => { setInput({ ...input, [key]: e.target.value }); setResult(null); }} /></label>)}</div>
    </details>
    <details className="text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer content-center text-sm">Evidence limits</summary><p className="max-w-3xl text-xs text-muted-foreground">Read-only, no signing. Supports the Mirror MessageQueueingRequested / Reply ABI. Public RPCs may restrict historical log searches; supply a known settlement transaction to read its receipt directly. A request log, StateChanged log, or current validator state does not prove this message’s business outcome. Validator pre-confirmation signatures are not verified here.</p> </details>
    </Panel>

    <p role="status" className="sr-only">{result ? `Evidence loaded · ${result.network}` : ""}</p>
    {result && <section className="space-y-4 rounded-lg border border-border/70 bg-card p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Evidence · {result.network}</h2><IconAction label="Export report as JSON" onClick={() => download("vara-eth-settlement.json", jsonText(result))}><DownloadSimple size={16} /></IconAction></div><ol className="grid gap-3 md:grid-cols-3">{[["1. Request", result.requestStatus], ["2. Execution / reply", result.executionStatus], ["3. Settlement", result.settlementStatus]].map(([stage,status]) => <li key={stage} className="rounded-lg border border-border/70 bg-card p-4"><p className="text-xs text-muted-foreground">{stage}</p><p className="mt-2 text-sm font-medium">{status}</p></li>)}</ol><p className="text-xs text-muted-foreground">{result.settlementTransaction ? "Inspected one supplied receipt" : result.coveredThrough === null ? "No log range could be read" : `Scanned blocks ${result.from}–${result.coveredThrough}`}; head {String(result.head)}; finalized {result.finalized === null ? "unavailable" : String(result.finalized)}. Each reply is matched by replyTo = message id. Reply codes and payloads still need application interpretation.</p>{result.scanError && <p role="alert" className="break-words text-sm text-amber-400">Search unavailable: {result.scanError}</p>}{result.deliveryFailures.length > 0 && <p className="text-sm text-amber-400">A matching ReplyCallFailed log was observed. Ethereum callback delivery failed even though the reply was settled.</p>}<ValueTree value={{ mirror: result.mirror, message: result.message, request: result.request, replies: result.replies, deliveryFailures: result.deliveryFailures }} rootLabel="message evidence" /><ValueTree value={{ state: result.state, stateError: result.stateError, unrelatedStateChanges: result.stateChanges }} rootLabel="program context (not message attribution)" /></section>}
  </div>;
}
