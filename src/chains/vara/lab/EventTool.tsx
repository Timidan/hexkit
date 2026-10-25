import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SailsProgram } from "sails-js";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { parseVaraInput } from "../links";
import { resolveIdl } from "../case";
import { loadProgram } from "../program";
import { loadIdlModel } from "../idlForm";
import { decodeEvent } from "../decode";
import { sqdEventsFrom, sqdHead } from "../sqd";
import { parseMapping, transformEvent, exportEventHandler } from "./events";
import { download, errorText, jsonText, readText } from "./files";
import { ValueTree } from "../ui/ValueTree";
import type { SqdEvent } from "../sqd";
import { DownloadSimple, FileCode } from "@phosphor-icons/react";
import { fileButtonClass } from "./CallComposer";
import { Panel, ToolHeader } from "../ui/Panel";
import { ProgramExamples } from "../ui/ProgramExamples";

export default function EventTool() {
  const [params, setParams] = useSearchParams();
  const program = params.get("program") ?? "";
  const setProgram = (value: string) => setParams((p) => { p.set("program", value); return p; }, { replace: true });
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [idl, setIdl] = useState(""), [mapping, setMapping] = useState('{"id":"id","block":"block","service":"decoded.service","event":"decoded.name","data":"decoded.value"}');
  const [result, setResult] = useState<{ events: (SqdEvent & { decoded: ReturnType<typeof decodeEvent> })[]; rows: Record<string, unknown>[]; handler: string | null; from: number; to: number; head: number; idl: string; program: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setIdl(""); setResult(null); }, [program]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function inspect() {
    setBusy(true); setError(""); setResult(null);
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(new Error("Event request exceeded 60 seconds; narrow the range")), 60_000);
    try {
      const parsed = parseVaraInput(program, "program");
      if (parsed?.kind !== "program") throw new Error("Enter a valid program id");
      const map = parseMapping(mapping);
      const head = await sqdHead(controller.signal);
      if (head === null) throw new Error("Indexer head unavailable; coverage cannot be established");
      if ((from && !/^\d+$/.test(from)) || (to && !/^\d+$/.test(to))) throw new Error("Block bounds must be integers");
      const end = to ? Number(to) : head, start = from ? Number(from) : Math.max(0, end - 499);
      if (end > head) throw new Error(`Indexer has only reached block ${head}`);
      let text = idl;
      if (!text.trim()) { const info = await loadProgram(parsed.id); text = (await resolveIdl(parsed.id, info.codeId))?.text ?? ""; }
      if (!text) throw new Error("No published IDL found. Open an IDL file to decode program events.");
      const loaded = await loadIdlModel(text);
      const raw = await sqdEventsFrom(parsed.id, start, end, controller.signal);
      const events = raw.map((e) => ({ ...e, decoded: decodeEvent(e.payload, loaded.sails) }));
      controller.signal.throwIfAborted();
      setResult({ events, rows: events.map((e) => transformEvent(e, map)), // The handler template reads IDL v1 only.
      handler: loaded.sails instanceof SailsProgram ? null : exportEventHandler(parsed.id, text, loaded.model, map), from: start, to: end, head, idl: text, program: parsed.id });
    } catch (err) { if (!controller.signal.aborted || controller.signal.reason instanceof Error && controller.signal.reason.name !== "AbortError") setError(errorText(err)); }
    finally { clearTimeout(timer); if (abort.current === controller) { setBusy(false); abort.current = null; } }
  }
  return <div className="space-y-5">
    <ToolHeader title="Event explorer" source="Vara mainnet" />
    <Panel footer={<>
      <Button disabled={busy} onClick={() => void inspect()}>{busy ? "Reading indexed events…" : "Inspect events"}</Button>{busy && <Button variant="outline" onClick={() => abort.current?.abort()}>Cancel</Button>}

    </>}>
    {error && <p role="alert" className="max-w-md break-words text-sm text-red-400">{error}</p>}
    <label className="block space-y-1.5 text-sm">Program<Input value={program} disabled={busy} className="font-mono" placeholder="Program id or explorer link" onChange={(e) => { setProgram(e.target.value); setResult(null); }} /></label>
    <ProgramExamples disabled={busy} onSelect={(id) => { setProgram(id); setFrom(""); setTo(""); setResult(null); setError(""); }} />
    <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm">From block<Input value={from} disabled={busy} placeholder="Last 500 indexed blocks" onChange={(e) => { setFrom(e.target.value); setResult(null); }} /></label><label className="space-y-1.5 text-sm">Through block<Input value={to} disabled={busy} placeholder="Indexer head" onChange={(e) => { setTo(e.target.value); setResult(null); }} /></label></div>
    <div className="flex flex-wrap items-center gap-2"><label className={fileButtonClass}><FileCode size={14} aria-hidden />{idl ? "Replace local IDL" : "Open IDL"}<input className="sr-only" type="file" disabled={busy} accept=".idl,.txt" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setIdl(await readText(f)); setResult(null); } catch (err) { setError(errorText(err)); } }} /></label><span className="text-xs text-muted-foreground">{idl ? "Local IDL loaded" : "Optional; the published interface is used otherwise"}</span></div>
    <details className="border-t border-border/60 pt-3"><summary className="min-h-9 cursor-pointer content-center text-sm">Export columns</summary><div className="mt-3">
    <label className="block space-y-1.5 text-sm">Output columns (JSON name → dot path)<Textarea className="font-mono text-xs" value={mapping} disabled={busy} spellCheck={false} onChange={(e) => { setMapping(e.target.value); setResult(null); }} /></label>
    </div></details>
    <details className="text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer content-center text-sm">Coverage & export limits</summary><p className="text-xs text-muted-foreground">Uses the existing SQD Vara dataset. Up to 2,000 blocks and 5,000 events per request. Event emission is scoped to a program, not automatically attributed to a particular extrinsic. Missing paths become null; expressions are not executed.</p> </details>
    </Panel>

    {result && !result.events.length && <p className="max-w-md text-sm text-muted-foreground">Try an earlier block range or <Link className="underline underline-offset-4" to={`/vara/transactions?${new URLSearchParams({ tool: "program", program: result.program })}`}>open the program workspace</Link> to explore its activity.</p>}
    <p role="status" className="sr-only">{result ? `${result.events.length} events · blocks ${result.from}–${result.to}` : ""}</p>
    {result && <section className="space-y-4 rounded-lg border border-border/70 bg-card p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto font-semibold">{result.events.length} events · blocks {result.from}–{result.to}</h2><Button size="sm" variant="outline" onClick={() => download("vara-events.json", jsonText(result))}><DownloadSimple />Export evidence</Button>{result.handler && <Button size="sm" variant="outline" onClick={() => download("vara-event-handler.ts", result.handler ?? "", "text/plain")}><DownloadSimple />Export handler</Button>}</div><p className="text-xs text-muted-foreground">Indexer head: {result.head}. Only messages from this program to the zero address without reply details are included. Decode failures remain visible.</p>{!result.events.length && <p className="text-sm">No program events were found in the covered range.{result.handler && " The handler is still available for export."}</p>}<div className="space-y-3">{result.events.slice(0, 100).map((e, i) => <details key={`${e.hash}:${e.id}`} className="rounded-lg border border-border/70 bg-card"><summary className="min-h-11 cursor-pointer content-center px-4 py-2 text-sm"><h3 className="inline text-sm font-medium">Block {e.block} · {e.decoded.service}.{e.decoded.name}</h3>{e.decoded.error && <span className="ml-2 text-xs text-amber-400">Decode failed</span>}</summary><div className="space-y-2 border-t border-border/60 p-4">{e.decoded.error && <p className="text-sm text-amber-400">{e.decoded.error}</p>}<div className="grid gap-4 lg:grid-cols-2"><ValueTree value={e} rootLabel="event" /><ValueTree value={result.rows[i]} rootLabel="output row" /></div></div></details>)}</div>{result.events.length > 100 && <p className="text-xs text-muted-foreground">Previewing the first 100 events. The export includes all {result.events.length}.</p>}</section>}
  </div>;
}
