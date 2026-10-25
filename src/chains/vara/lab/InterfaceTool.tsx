import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { compareInterfaces } from "./compatibility";
import { download, errorText, jsonText, readText } from "./files";
import { ValueTree } from "../ui/ValueTree";
import { caseFromJson } from "../case";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { fileButtonClass } from "./CallComposer";
import { IconAction } from "../ui/IconAction";
import { Panel, ToolHeader } from "../ui/Panel";
import example from "../fixtures/case-36589852-1.json";

export default function InterfaceTool() {
  const [before, setBefore] = useState(""), [after, setAfter] = useState(""), [payloads, setPayloads] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof compareInterfaces>> | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function compare() {
    setBusy(true); setError(""); setResult(null);
    try { setResult(await compareInterfaces(before, after, payloads.split(/\s+/).filter(Boolean))); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <ToolHeader title="IDL comparison" source="In your browser" aside={<Button variant="outline" size="sm" disabled={busy} onClick={() => {
        setBefore(example.idl); setAfter(example.idl.replace("FinalizeSettlement : (basket_id: u64)", "FinalizeSettlement : (basket_id: u32)"));
        setPayloads(example.call.payload); setResult(null); setError("");
      }}>Load breaking-change example</Button>} />
    <Panel footer={<>
      <Button disabled={busy || !before.trim() || !after.trim()} onClick={() => void compare()}>{busy ? "Comparing…" : "Compare interfaces"}</Button>

    </>}>
    {error && <p role="alert" className="max-w-md break-words text-sm text-red-400">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{([{ name: "Before", value: before, set: setBefore }, { name: "After", value: after, set: setAfter }]).map((side) => <div key={side.name} className="space-y-2"><div className="flex items-center justify-between"><label className="text-sm font-medium" htmlFor={`idl-${side.name}`}>{side.name} IDL</label><label className={fileButtonClass}><UploadSimple size={14} aria-hidden />Open file<input className="sr-only" type="file" accept=".idl,.txt" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { side.set(await readText(file)); setResult(null); } catch (err) { setError(errorText(err)); } }} /></label></div><Textarea id={`idl-${side.name}`} className="min-h-64 font-mono text-xs" disabled={busy} spellCheck={false} placeholder="service Counter { query Value : () -> u32; };" value={side.value} onChange={(e) => { side.set(e.target.value); setResult(null); }} /></div>)}</div>
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="saved-payloads" className="text-sm font-medium">Saved call payloads (optional, one hex payload per line)</label><label className={fileButtonClass}><UploadSimple size={14} aria-hidden />Add saved investigation<input type="file" accept=".json" className="sr-only" disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const c = caseFromJson(await readText(f)); if (!c.call.payload) throw new Error("The investigation has no recoverable call payload"); setPayloads((v) => `${v}\n${c.call.payload}`.trim()); if (!before && c.idl) setBefore(c.idl); setResult(null); } catch (err) { setError(errorText(err)); } }} /></label></div><Textarea id="saved-payloads" className="font-mono text-xs" disabled={busy} value={payloads} onChange={(e) => { setPayloads(e.target.value); setResult(null); }} placeholder="0x…" /></div>
    <details className="text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer content-center text-sm">Comparison limits</summary><p className="text-xs text-muted-foreground">Checks service methods and events in legacy Sails IDL or IDL v2; compare two files of the same format, since payload framing differs between them. Recursive type bodies, constructors, business behavior, access rules, and persisted program state require separate review. A matching modeled signature or payload is not proof of a safe program upgrade.</p> </details>
    </Panel>

    <p role="status" className="sr-only">{result ? `${result.changes.length} interface change${result.changes.length === 1 ? "" : "s"}` : ""}</p>
    {result && <section className="space-y-4 rounded-lg border border-border/70 bg-card p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{result.changes.length} interface change{result.changes.length === 1 ? "" : "s"}</h2><IconAction label="Export report as JSON" onClick={() => download("vara-interface-comparison.json", jsonText(result))}><DownloadSimple size={16} /></IconAction></div>{!result.changes.length && <p className="text-sm">All {result.routesBefore} method and event signatures match.</p>}{result.changes.map((change) => <div key={change.route} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center gap-2"><code className="break-all text-sm">{change.route}</code><Badge variant={change.kind === "added" ? "success" : "warning"}>{change.kind}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{change.detail}</p></div>)}{result.payloads.map((p, i) => <div className="space-y-2 rounded-lg border border-border p-4" key={i}><h3 className="text-sm font-medium">Saved call {i + 1} · Before: {p.before.ok ? "round-trip matches" : "invalid"} · After: {p.after.ok ? "round-trip matches" : "invalid"}</h3><ValueTree value={p} rootLabel="payload check" /></div>)}</section>}
  </div>;
}
