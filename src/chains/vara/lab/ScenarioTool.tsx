import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { bytesToHex } from "@noble/hashes/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, CaretDown, DownloadSimple, FilePlus, FloppyDisk, Play, Plus, Stop, Trash, UploadSimple } from "@phosphor-icons/react";
import { Button } from "../../../components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "../../../components/ui/dropdown-menu";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { ValueTree } from "../ui/ValueTree";
import { shortHex } from "../ui/HexChip";
import { loadIdlModel, defaultFormValue, encodeMethod } from "../idlForm";
import { decodeCall, decodeReply, loadIdl, type SailsIdl } from "../decode";
import type { Hex } from "../model";
import { FieldEditor } from "../ui/TypedForm";
import type { FormValue } from "../model";
import { actorId, DEFAULT_GAS, exportRust, IS_LOCAL_SIMULATOR, SIMULATOR_URL, newScenario, runScenario, ScenarioSchema } from "./scenario";
import type { Scenario, ScenarioProgram, ScenarioReport, ScenarioStep } from "./scenario";
import { download, errorText, jsonText, readText } from "./files";
import { AmountInput } from "../ui/AmountInput";
import { fileButtonClass, selectClass } from "./CallComposer";
import { IconAction } from "../ui/IconAction";
import { ToolHeader } from "../ui/Panel";

const STORAGE = "hexkit.vara.scenario";
const KINDS = { send: "Send a message", advance: "Advance blocks", expectReply: "Assert reply", expectStatus: "Assert processing status", expectBalance: "Assert balance" };
function readDraft(): Scenario {
  try { const text = sessionStorage.getItem("hexkit.vara.scenario.handoff") ?? localStorage.getItem(STORAGE); return text ? ScenarioSchema.parse(JSON.parse(text)) : newScenario(); } catch { return newScenario(); }
}

const compact = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);

/** Typed method builder plus the encoded bytes. An existing payload is shown as decoded and kept until a method is chosen or the bytes are edited. */
function PayloadEditor({ program, payload, onPayload }: { program?: ScenarioProgram; payload: string; onPayload: (payload: string) => void }) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadIdlModel>> | null>(null);
  const [key, setKey] = useState("");
  const [values, setValues] = useState<FormValue[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setLoaded(null); setKey(""); setError("");
    if (program?.idl) void loadIdlModel(program.idl).then((l) => { if (active) setLoaded(l); }).catch((e) => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [program?.idl]);
  const methods = loaded?.model.services.flatMap((s) => s.methods) ?? [];
  const method = methods.find((m) => `${m.service}.${m.name}` === key);
  // Bytes edited elsewhere no longer match the typed fields: stop claiming they came from this method.
  useEffect(() => {
    if (!loaded || !method) return;
    try { if (encodeMethod(loaded.sails, method, values) !== payload) setKey(""); }
    catch { /* Keep invalid typed fields available for correction. */ }
  }, [payload, loaded, method, values]);
  function encode(values: FormValue[], methodKey = key) {
    setValues(values); setError("");
    const m = methods.find((m) => `${m.service}.${m.name}` === methodKey);
    if (loaded && m) { try { onPayload(encodeMethod(loaded.sails, m, values)); } catch (e) { onPayload(""); setError(errorText(e)); } }
  }
  const hasBytes = payload.length > 2;
  // Constructors and non-Sails bytes simply stay raw; only a known service method is named.
  const existing = loaded && !method && hasBytes && /^0x([0-9a-fA-F]{2})*$/.test(payload) ? decodeCall(payload as Hex, loaded.sails) : null;
  const known = existing && !existing.error && existing.name ? existing : null;
  const route = known ? `${known.service ? `${known.service}.` : ""}${known.name}` : "";
  // Decoders return arguments as a list or as a name → value map.
  const v = known?.value;
  const args = Array.isArray(v) ? v.map(compact) : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}: ${compact(x)}`) : v == null ? [] : [compact(v)];
  return <>
    {loaded && <div className="space-y-3 rounded-md border border-border/60 p-3">
      <label className="block space-y-1.5 text-sm">Method
        <select aria-label="Scenario method" className={selectClass} value={key} onChange={(e) => { setKey(e.target.value); const m = methods.find((m) => `${m.service}.${m.name}` === e.target.value); if (m) encode(m.params.map((p) => defaultFormValue(p.schema)), e.target.value); }}>
          <option value="">{!hasBytes ? "Choose a method" : known ? `Keep encoded call (${route})` : "Keep raw payload"}</option>
          {methods.map((m) => <option key={`${m.service}.${m.name}`}>{m.service}.{m.name}</option>)}
        </select>
      </label>
      {!method && hasBytes && <div className="space-y-1 text-sm">
        <p>{known ? <>{known.service ? "Encoded call" : "Constructor"}: <code className="break-all font-mono text-xs">{route}({args.join(", ")})</code></> : "Encoded call: raw bytes, not a service method in this interface."}</p>
        <p className="text-xs text-muted-foreground">Selecting a method resets its arguments.</p>
      </div>}
      {method?.params.map((p, i) => <FieldEditor key={`${key}.${p.name}`} schema={p.schema} value={values[i]} label={p.name} path={`scenario.${p.name}`} onChange={(v) => { const next = [...values]; next[i] = v; encode(next); }} />)}
    </div>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <details open={!method && !known} className="rounded-md border border-border/60 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Payload bytes</summary><label className="mt-2 block space-y-1.5 text-sm">Payload (hex)<Textarea className="font-mono text-xs" value={payload} onChange={(e) => onPayload(e.target.value)} /></label></details>
  </>;
}

export default function ScenarioTool() {
  const { key } = useLocation();
  const [scenario, setScenario] = useState<Scenario>(readDraft);
  const [selected, setSelected] = useState(0);
  const [report, setReport] = useState<ScenarioReport | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const abort = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const reduce = useReducedMotion();
  useEffect(() => { try { const text = sessionStorage.getItem("hexkit.vara.scenario.handoff"); if (text === null) return; sessionStorage.removeItem("hexkit.vara.scenario.handoff"); abort.current?.abort(); setScenario(ScenarioSchema.parse(JSON.parse(text))); setSelected(0); setReport(null); setError(""); setNotice(""); } catch { /* Scenario files still work without browser storage. */ } }, [key]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  function change(next: Scenario) { setScenario(next); setReport(null); setError(""); setNotice(""); }
  function updateStep(patch: Partial<ScenarioStep>) { change({ ...scenario, steps: scenario.steps.map((s, i) => i === selected ? { ...s, ...patch } as ScenarioStep : s) }); }
  function updateProgram(index: number, patch: Partial<ScenarioProgram>) { change({ ...scenario, programs: scenario.programs.map((p, i) => i === index ? { ...p, ...patch } : p) }); }
  async function health() {
    try { const response = await fetch(`${SIMULATOR_URL}/health`, { signal: AbortSignal.timeout(IS_LOCAL_SIMULATOR ? 2500 : 10_000) }); const data = await response.json(); if (alive.current) setReady(response.ok && data.ready && data.runtime === "gtest 2.0.0"); } catch { if (alive.current) setReady(false); }
  }
  useEffect(() => { void health(); }, []);
  async function run() {
    setRunning(true); setReport(null); setError(""); const controller = new AbortController(); abort.current = controller;
    try { const result = await runScenario(scenario, controller.signal); if (alive.current) { setReport(result); setReady(true); } }
    catch (e) { if (alive.current) setError(controller.signal.aborted ? "Run cancelled" : errorText(e)); }
    finally { if (alive.current) setRunning(false); }
  }
  async function loadExample(url: string) {
    setLoadingExample(true); setError("");
    try { const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error("Example could not be loaded. Try again."); change(ScenarioSchema.parse(await response.json())); setSelected(0); }
    catch (e) { setError(errorText(e)); }
    finally { setLoadingExample(false); }
  }
  async function importFile(file: File) {
    try { const next = ScenarioSchema.parse(JSON.parse(await readText(file, 48 * 1024 * 1024))); change(next); setSelected(0); } catch (e) { setError(errorText(e)); }
  }
  function add(kind: ScenarioStep["kind"]) {
    const previous = scenario.steps.map((s, i) => s.kind === "send" ? i : -1).filter((i) => i >= 0).at(-1) ?? 0;
    const label = KINDS[kind];
    const step: ScenarioStep = kind === "send" ? { kind, label, program: scenario.programs[0]?.id ?? actorId(1), sender: scenario.accounts[0]?.id ?? actorId(100001), payload: "0x", value: "0", gasLimit: DEFAULT_GAS, blocks: 1 }
      : kind === "advance" ? { kind, label, blocks: 1 }
      : kind === "expectReply" ? { kind, label, message: previous, payload: "0x" }
      : kind === "expectStatus" ? { kind, label, message: previous, status: "success" }
      : { kind, label, account: scenario.accounts[0]?.id ?? actorId(100001), equals: "0" };
    setSelected(scenario.steps.length); change({ ...scenario, steps: [...scenario.steps, step] });
  }
  function move(from: number, to: number) {
    const order = scenario.steps.map((_, i) => i); const [old] = order.splice(from, 1); order.splice(to, 0, old);
    change({ ...scenario, steps: order.map((i) => { const s = scenario.steps[i]; return "message" in s ? { ...s, message: order.indexOf(s.message) } : s; }) }); setSelected(to);
  }
  function remove(index: number) {
    if (scenario.steps.some((s) => "message" in s && s.message === index)) { setError("Remove assertions referring to this message first"); return; }
    change({ ...scenario, steps: scenario.steps.filter((_, i) => i !== index).map((s) => "message" in s && s.message > index ? { ...s, message: s.message - 1 } : s) }); setSelected(Math.max(0, index - 1));
  }
  const step = scenario.steps[selected];
  const result = report?.steps[selected];
  const [idls, setIdls] = useState<Map<string, SailsIdl>>(new Map());
  useEffect(() => {
    let active = true;
    const texts = [...new Set(scenario.programs.flatMap((p) => p.idl ? [p.idl] : []))];
    if (report && texts.length) void Promise.all(texts.map(async (t) => [t, await loadIdl(t)] as const)).then((loaded) => { if (active) setIdls(new Map(loaded)); }).catch(() => { /* Raw evidence still shows without an IDL. */ });
    return () => { active = false; };
  }, [report, scenario.programs]);
  // Decode the actual successful reply, not an assertion's expected bytes.
  const replyOf = step?.kind === "send" ? { message: selected, payload: result?.logs.find((l) => l.replyTo === result.messageId && l.success)?.payload } : null;
  const sent = replyOf && scenario.steps[replyOf.message];
  const replyIdl = sent?.kind === "send" ? idls.get(scenario.programs.find((p) => p.id === sent.program)?.idl ?? "") : undefined;
  const decodedReply = result && replyIdl && sent?.kind === "send" && replyOf?.payload && replyOf.payload !== "0x" ? decodeReply(replyOf.payload as Hex, decodeCall(sent.payload as Hex, replyIdl), replyIdl) : null;
  return <div className="space-y-5">
    <ToolHeader title="Scenario tests"
      source={<Badge variant={ready ? "success" : "outline"}>{IS_LOCAL_SIMULATOR ? (ready === null ? "Checking local runtime…" : ready ? "Local · connected" : "Local runtime required") : (ready === null ? "Checking hosted runtime…" : ready ? "Hosted · connected" : "Hosted runtime unavailable")}</Badge>} />
    {ready === false && <div className="inline-flex max-w-md flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm">{IS_LOCAL_SIMULATOR ? <><span>Start the runtime in the HexKit directory:</span><code className="break-all rounded bg-muted px-2 py-0.5 font-mono text-xs">npm run vara:simulator</code></> : <span>The hosted simulator is unavailable. Retry, or contact the HexKit operator if it stays offline.</span>}<Button size="sm" variant="outline" onClick={() => void health()}>Check connection</Button></div>}
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card p-3" role="group" aria-label="Scenario file">
      <label className="min-w-0 flex-1 basis-full sm:basis-60"><span className="sr-only">Scenario name</span><Input disabled={running || loadingExample} value={scenario.name} maxLength={120} onChange={(e) => change({ ...scenario, name: e.target.value })} /></label>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={running || loadingExample}>File<CaretDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="[&_[role=menuitem]]:min-h-11">
          <DropdownMenuItem onSelect={() => { change(newScenario()); setSelected(0); }}><FilePlus />New scenario</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => importInput.current?.click()}><UploadSimple />Import scenario JSON</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => download("scenario.json", jsonText(scenario))}><DownloadSimple />Export scenario as JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { try { download("scenario.rs", exportRust(scenario), "text/plain"); } catch (e) { setError(errorText(e)); } }}><DownloadSimple />Export scenario as a Rust test</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={running || loadingExample}>Examples<CaretDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 [&_[role=menuitem]]:min-h-11">
          <p className="px-2 py-2 text-xs text-muted-foreground">Replaces the editor. Export your work first.</p>
          <DropdownMenuItem onSelect={() => void loadExample("/vara/scenario.json")}>Try counter example</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void loadExample("/vara/async-scenario.json")}>Try async example</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void loadExample("/vara/sails-scenario.json")}>Try Sails example</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconAction label="Save on this device" disabled={running || loadingExample} onClick={() => { try { localStorage.setItem(STORAGE, JSON.stringify(scenario)); sessionStorage.removeItem("hexkit.vara.scenario.handoff"); setNotice("Scenario saved on this device"); } catch { setError("Browser storage is full or unavailable. Export JSON to keep this scenario."); } }}><FloppyDisk size={16} /></IconAction>
      <input ref={importInput} type="file" hidden accept=".json" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importFile(file); }} />
      <Button className="ml-auto" disabled={running || loadingExample} onClick={() => void run()} title={`${IS_LOCAL_SIMULATOR ? "Local" : "Hosted"} execution; no network transaction`}><Play weight="fill" />{running ? "Executing…" : "Run scenario"}</Button>
      {running && <Button variant="outline" onClick={() => abort.current?.abort()}><Stop />Cancel</Button>}
      {report && <a href="#scenario-execution" className="text-sm text-primary underline underline-offset-4 lg:hidden">Results</a>}
    </div>
    <p role="status" className="sr-only">{report ? (report.passed === true ? "Run finished. Assertions passed" : report.passed === false ? "Run finished. Assertion failed" : "Run finished") : ""}</p>
    {loadingExample && <p role="status" className="text-sm text-muted-foreground">Loading example…</p>}
    {notice && <p role="status" className="max-w-md text-sm text-teal-400">{notice}</p>}{error && <p role="alert" className="max-w-md whitespace-pre-wrap break-words text-sm text-red-400">{error}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <fieldset disabled={running || loadingExample} className="min-w-0 space-y-4">
      <details className="rounded-lg border border-border/70 bg-card p-4" open={!scenario.programs.every((p) => p.wasm || p.mock)}><summary className="cursor-pointer font-medium">Programs & accounts <span className="ml-2 text-xs font-normal text-muted-foreground">{scenario.programs.length} program{scenario.programs.length === 1 ? "" : "s"} · {scenario.accounts.length} sender{scenario.accounts.length === 1 ? "" : "s"}</span></summary>
        <div className="mt-4 space-y-5">
          {scenario.programs.map((p, i) => <div key={i} className="space-y-3 border-t border-border/60 pt-4 first:border-0 first:pt-0">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]"><label className="space-y-1 text-xs">Name<Input value={p.name} onChange={(e) => updateProgram(i, { name: e.target.value })} /></label><label className="space-y-1 text-xs">Actor id<Input className="font-mono text-xs" value={p.id} onChange={(e) => updateProgram(i, { id: e.target.value })} /></label><AmountInput label="Initial balance" value={p.balance} onChange={(balance) => updateProgram(i, { balance })} /></div>
            <div className="flex flex-wrap items-center gap-3">
              <label className={fileButtonClass}>{p.wasm ? `WASM loaded · ${(p.wasm.length - 2) / 2} bytes` : "Upload .wasm"}<input className="sr-only" type="file" accept=".wasm" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { if (file.size > 4 * 1024 * 1024) throw new Error("WASM exceeds 4 MiB"); updateProgram(i, { wasm: `0x${bytesToHex(new Uint8Array(await file.arrayBuffer()))}`, mock: null }); } catch (err) { setError(errorText(err)); } }} /></label>
              <label className={fileButtonClass}>{p.idl ? "Replace IDL" : "Add IDL"}<input className="sr-only" type="file" accept=".idl,.txt" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { updateProgram(i, { idl: await readText(file) }); } catch (err) { setError(errorText(err)); } }} /></label>
              <Button size="sm" variant="ghost" onClick={() => updateProgram(i, { wasm: null, mock: p.mock ? null : { reply: "0x", fail: false } })}>{p.mock ? "Remove mock" : "Use mock dependency"}</Button>
              <IconAction label={`Remove ${p.name}`} disabled={scenario.programs.length === 1} onClick={() => change({ ...scenario, programs: scenario.programs.filter((_, j) => i !== j) })}><Trash /></IconAction>
            </div>
            {p.mock && <div className="flex flex-wrap items-center gap-3 rounded border border-amber-500/30 p-3"><Badge variant="warning">Mock · no WASM execution</Badge><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.mock.fail} onChange={(e) => updateProgram(i, { mock: { ...p.mock!, fail: e.target.checked } })} />Fail on handle</label><label className="min-w-40 flex-1 space-y-1 text-xs">Reply payload<Input value={p.mock.reply} className="font-mono" onChange={(e) => updateProgram(i, { mock: { ...p.mock!, reply: e.target.value } })} /></label></div>}
          </div>)}
          <Button size="sm" variant="outline" disabled={scenario.programs.length >= 8} onClick={() => change({ ...scenario, programs: [...scenario.programs, { id: actorId(scenario.programs.length + 1), name: `Program ${scenario.programs.length + 1}`, balance: "10000000000000", wasm: null, mock: null, idl: null }] })}><Plus />Add program</Button>
          <p className="text-xs text-muted-foreground">The first message to each program initializes it. Supply its constructor payload. Fixtures start fresh; imported case inputs do not restore historical state.</p>
          {scenario.accounts.map((a, i) => <div className="flex items-end gap-2" key={i}><label className="min-w-0 flex-1 space-y-1 text-xs">Sender {i + 1}<Input value={a.id} className="font-mono text-xs" onChange={(e) => change({ ...scenario, accounts: scenario.accounts.map((a, j) => i === j ? { ...a, id: e.target.value } : a) })} /></label><div className="min-w-0 flex-1"><AmountInput label="Initial balance" value={a.balance} onChange={(balance) => change({ ...scenario, accounts: scenario.accounts.map((a, j) => i === j ? { ...a, balance } : a) })} /></div><IconAction size="icon" label={`Remove sender ${i + 1}`} disabled={scenario.accounts.length === 1} onClick={() => change({ ...scenario, accounts: scenario.accounts.filter((_, j) => j !== i) })}><Trash /></IconAction></div>)}
          <Button size="sm" variant="outline" disabled={scenario.accounts.length >= 32} onClick={() => change({ ...scenario, accounts: [...scenario.accounts, { id: actorId(100001 + scenario.accounts.length), balance: "1000000000000000000" }] })}><Plus />Add sender</Button>
        </div>
      </details>
      {/* The step list sits beside the editor only when there is room: compact select on phones and beside the results panel at laptop widths. */}
      <div className="grid gap-5 md:grid-cols-[minmax(130px,0.65fr)_minmax(0,2fr)] lg:grid-cols-1 xl:grid-cols-[minmax(130px,0.65fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <label className="block space-y-1.5 text-sm md:hidden lg:block xl:hidden">Current step<select className={selectClass} value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{scenario.steps.map((s, i) => <option key={i} value={i}>{String(i + 1).padStart(2, "0")} · {s.label || KINDS[s.kind]} · {report?.steps[i]?.status ?? KINDS[s.kind]}</option>)}</select></label>
          <ol className="hidden space-y-1 md:block lg:hidden xl:block" aria-label="Scenario steps">{scenario.steps.map((s, i) => <li key={i}><button type="button" className={`relative isolate flex w-full items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors ${selected === i ? "" : "hover:bg-muted/50"}`} onClick={() => setSelected(i)} aria-current={selected === i ? "step" : undefined}>{selected === i && <motion.span layoutId="vara-scenario-step" aria-hidden className="pointer-events-none absolute -inset-px -z-10 border border-teal-500/50 bg-teal-500/5" style={{ borderRadius: 8 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} />}<span className="mt-0.5 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block break-words text-sm font-medium">{s.label || KINDS[s.kind]}</span><span className="text-xs text-muted-foreground">{report?.steps[i]?.status ?? KINDS[s.kind]}</span></span></button></li>)}</ol>
          {/* A menu, not a <select>: arrow keys on a closed select fire change and would add a step per keypress. */}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={scenario.steps.length >= 128}><Plus />Add step<CaretDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="[&_[role=menuitem]]:min-h-11">{Object.entries(KINDS).map(([k, label]) => <DropdownMenuItem key={k} onSelect={() => add(k as ScenarioStep["kind"])}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-w-0 space-y-4 rounded-lg border border-border/70 bg-card p-4">
          {step && <><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Step {selected + 1}</Badge><span className="flex-1 text-sm text-muted-foreground">{KINDS[step.kind]}</span><IconAction label="Move step up" disabled={selected === 0} onClick={() => move(selected, selected - 1)}><ArrowUp /></IconAction><IconAction label="Move step down" disabled={selected === scenario.steps.length - 1} onClick={() => move(selected, selected + 1)}><ArrowDown /></IconAction><IconAction label="Remove step" onClick={() => remove(selected)}><Trash /></IconAction></div>
          <label className="block space-y-1.5 text-sm">Step name<Input value={step.label} onChange={(e) => updateStep({ label: e.target.value })} /></label>
          {step.kind === "send" && <>
            <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm">Destination<select className={selectClass} value={step.program} onChange={(e) => updateStep({ program: e.target.value })}>{scenario.programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {shortHex(p.id)}</option>)}</select></label><label className="space-y-1.5 text-sm">Sender<select className={selectClass} value={step.sender} onChange={(e) => updateStep({ sender: e.target.value })}>{scenario.accounts.map((a, i) => <option key={a.id} value={a.id}>Sender {i + 1} · {shortHex(a.id)}</option>)}</select></label></div>
            <PayloadEditor key={`${selected}:${step.program}`} program={scenario.programs.find((p) => p.id === step.program)} payload={step.payload} onPayload={(payload) => updateStep({ payload })} />
            <div className="grid gap-3 sm:grid-cols-2"><AmountInput key={selected} value={step.value} onChange={(value) => updateStep({ value })} /><label className="space-y-1.5 text-sm">Gas limit<Input value={step.gasLimit} className="font-mono" onChange={(e) => updateStep({ gasLimit: e.target.value })} /></label></div>
          </>}
          {"blocks" in step && <label className="block space-y-1.5 text-sm">Blocks to execute<Input type="number" min={0} max={256} value={step.blocks} onChange={(e) => updateStep({ blocks: Number(e.target.value) })} /><span className="block text-xs text-muted-foreground">Use 0 to queue multiple messages before an Advance blocks step.</span></label>}
          {"message" in step && <label className="block space-y-1.5 text-sm">Message to check<select className={selectClass} value={step.message} onChange={(e) => updateStep({ message: Number(e.target.value) })}>{scenario.steps.map((s, i) => s.kind === "send" && i < selected ? <option key={i} value={i}>{i + 1}. {s.label}</option> : null)}</select></label>}
          {step.kind === "expectReply" && <label className="block space-y-1.5 text-sm">Expected successful reply (hex)<Textarea className="font-mono text-xs" value={step.payload} onChange={(e) => updateStep({ payload: e.target.value })} /></label>}
          {step.kind === "expectStatus" && <label className="block space-y-1.5 text-sm">Expected processing status<select className={selectClass} value={step.status} onChange={(e) => updateStep({ status: e.target.value as "success" | "failed" })}><option value="success">Processed without a recorded failure</option><option value="failed">Failed</option></select><span className="block text-xs text-muted-foreground">Use a reply assertion to check the application result.</span></label>}
          {step.kind === "expectBalance" && <><label className="block space-y-1.5 text-sm">Actor<select className={selectClass} value={step.account} onChange={(e) => updateStep({ account: e.target.value })}>{[...scenario.accounts, ...scenario.programs].map((a) => <option key={a.id} value={a.id}>{"name" in a ? String(a.name) : "Sender"} · {shortHex(a.id)}</option>)}</select></label><AmountInput key={selected} label="Expected balance" value={step.equals} onChange={(equals) => updateStep({ equals })} /></>}
          </>}
          {!step && <p className="text-sm text-muted-foreground">Add a step to begin.</p>}
        </div>
      </div>
    </fieldset>
    <aside id="scenario-execution" className="min-w-0 scroll-mt-20 space-y-4 rounded-lg border border-border/70 bg-card p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" aria-label="Scenario results">
    {!report && <div className="space-y-2"><h2 className="text-sm font-semibold">Run results</h2><p className="text-sm text-muted-foreground">{running ? "Executing steps in order…" : "No run yet."}</p></div>}
    {report && <section className="space-y-4 motion-safe:animate-[vara-enter_260ms_cubic-bezier(0.23,1,0.32,1)]"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Run results</h2><Badge variant={report.passed === true ? "success" : report.passed === false ? "destructive" : "outline"}>{report.passed === true ? "Assertions passed" : report.passed === false ? "Assertion failed" : "No assertions"}</Badge><span className="text-xs text-muted-foreground">{report.runtime} · block {report.block} · {report.assertions} assertions</span><IconAction label="Export report as JSON" onClick={() => download("scenario-result.json", jsonText(report))}><DownloadSimple size={16} /></IconAction></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-xs">Result step<select aria-label="Result step" className={selectClass} value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{report.steps.map((s) => <option key={s.index} value={s.index}>Step {s.index + 1} · {scenario.steps[s.index]?.label} · {s.status}</option>)}</select></label>
        <Button size="sm" variant="outline" disabled={selected <= 0} onClick={() => setSelected(selected - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={selected >= report.steps.length - 1} onClick={() => setSelected(selected + 1)}>Next</Button>
      </div>
      {result && <div className="space-y-3"><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 text-sm font-medium">{result.status}</dd></div><div><dt className="text-xs text-muted-foreground">Gas burned · step blocks</dt><dd className="mt-1 font-mono text-sm">{BigInt(result.gasBurned).toLocaleString()}</dd></div></dl>{result.detail && <p className="break-all text-xs text-muted-foreground">{result.detail}</p>}{decodedReply && <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Reply{decodedReply.service && <> · {decodedReply.service}.{decodedReply.name}</>}</p>{decodedReply.error ? <p role="alert" className="mt-2 text-sm text-red-400">{decodedReply.error}</p> : <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-lg">{jsonText(decodedReply.value)}</pre>}</div>}<details className="border-t border-border/60 pt-3"><summary className="min-h-9 cursor-pointer content-center text-sm">Execution evidence</summary><div className="mt-3"><ValueTree value={{ messageId: result.messageId, logs: result.logs, balances: result.balances.filter((b) => b.before !== b.after) }} rootLabel="evidence" /></div></details></div>}
    </section>}
    </aside></div>
  </div>;
}
