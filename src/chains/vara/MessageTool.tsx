import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { hexToBytes } from "@noble/hashes/utils";
import { SailsProgram } from "sails-js";
import type { SailsIdl } from "./decode";
import { Badge } from "../../components/ui/badge";
import { CaretDown, Cube, DownloadSimple, FileCode, FloppyDisk, MagnifyingGlass, UploadSimple, X } from "@phosphor-icons/react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { encodeSs58, VARA_SS58_PREFIX } from "./address";
import { IDL_SOURCE_LABEL, caseFromJson, explainRpcError, fetchCase, findMessage, resolveIdl } from "./case";
import type { IdlSource } from "./case";
import { ideaHead } from "./idea";
import { ideaCodeUrl, ideaMessageUrl, ideaProgramUrl, parseVaraInput, subscanAccount, subscanBlock, subscanExtrinsic } from "./links";
import { ExplorerLinks } from "./ui/ExplorerLinks";
import { IconAction } from "./ui/IconAction";
import { Panel, SURFACE, ToolHeader } from "./ui/Panel";
import { useProgramNames } from "./ui/useProgramNames";
import type { Runs, VaraCase } from "./case";
import { decodeCall, decodeEvent, decodeReply, loadIdl } from "./decode";
import type { Decoded } from "./decode";
import DryRunPanel from "./DryRunPanel";
import { getIdl, setIdl } from "./idlStore";
import type { Trace } from "./model";
import TracePanel from "./TracePanel";
import { Field, HexChip, shortHex } from "./ui/HexChip";
import { ValueTree } from "./ui/ValueTree";
import IncidentPanel from "./lab/IncidentPanel";
import { readInvestigations, saveInvestigation } from "./lab/incident";
import type { SavedCase } from "./lab/incident";
import RecentMessages from "./lab/RecentMessages";
import basketExample from "./fixtures/case-36589852-1.json?raw";
import traceExample from "./fixtures/case-36592237-1.json?raw";

const TABS = ["overview", "diagnosis", "trace", "dryrun"] as const;
type Detail = "payload" | "reply" | "events";
/** Tab panels are focusable (Radix); keep a visible ring for keyboard users. */
const PANEL = "mt-3 min-w-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
type Tab = (typeof TABS)[number];

function defaultRuns(c: VaraCase): Runs | null {
  if (!c.call.destination || !c.call.payload) return null;
  const input = { block: String(c.block.number - 1), origin: c.call.signer ?? `0x${"00".repeat(32)}`, payload: c.call.payload, value: c.call.value ?? "0", gasLimit: c.call.gasLimit ?? "0" };
  return { a: { input, result: null }, b: { input: { ...input, block: "latest" }, result: null }, query: null };
}

function utf8(hex: string): string | null {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(hex.slice(2))); } catch { return null; }
}

function Payload({ payload, decoded, hasIdl }: { payload: `0x${string}`; decoded: Decoded; hasIdl: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      {decoded.service && decoded.name && <p className="text-sm">{decoded.service}.{decoded.name}</p>}
      {hasIdl && !decoded.error && decoded.value !== null
        ? <ValueTree value={decoded.value} rootLabel={decoded.name ?? "value"} />
        : <code className="block break-all rounded-md border border-border/60 bg-background/40 p-3 font-mono text-xs">{payload}</code>}
      {decoded.error && <p className="text-sm text-red-400">{decoded.error}</p>}
    </div>
  );
}

export default function MessageTool() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [input, setInput] = useState(() => params.get("id") ?? "");
  const [c, setCase] = useState<VaraCase | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [idlText, setIdlText] = useState<string | null>(null);
  /** Program the loaded IDL belongs to; null while it is not yet bound to a fetched case. */
  const [idlFor, setIdlFor] = useState<string | null>(null);
  const [idlSource, setIdlSource] = useState<IdlSource | null>(null);
  const [sails, setSails] = useState<SailsIdl | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedCase[]>([]);
  const [savedNotice, setSavedNotice] = useState("");
  useEffect(() => { try { setSaved(readInvestigations()); } catch (err) { setSavedNotice(err instanceof Error ? err.message : String(err)); } }, []);
  const tabParam = params.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview");
  const [detail, setDetail] = useState<Detail>("payload");
  const handledId = useRef<string | null>(null);
  const fetchSeq = useRef(0);
  /** A URL write that arrived while the tool was hidden; replayed when the tool is shown again. */
  const skippedWrite = useRef<((p: URLSearchParams) => void) | null>(null);
  const caseInput = useRef<HTMLInputElement>(null);
  const idlInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function applyIdl(text: string | null, programId: string | null, source: IdlSource = "local") {
    setIdlText(text);
    setIdlFor(text ? programId : null);
    setIdlSource(text ? source : null);
    setSails(null);
    if (!text) return;
    const s = await loadIdl(text);
    if (!alive.current) return;
    setSails(s);
    // Only IDLs the user supplied are remembered; IDEA's copy is fetched again when needed.
    if (programId && source === "local") setIdl(programId as `0x${string}`, text);
  }

  /** Accepts b-i, b-i#k, a Subscan extrinsic link, a Gear IDEA message link or a message id. */
  async function fetchExtrinsic(raw = input, msg = 0) {
    const parsed = parseVaraInput(raw, "message");
    if (!parsed || parsed.kind === "program") {
      setError("Use <block>-<index> (e.g. 36589852-1), a Subscan extrinsic link, a Gear IDEA message link or a message id");
      return;
    }
    const seq = ++fetchSeq.current;
    skippedWrite.current = null;
    const stale = () => !alive.current || seq !== fetchSeq.current;
    setBusy(true);
    setError("");
    let where = parsed.kind === "extrinsic" ? String(parsed.block) : "";
    try {
      let block: number, index: number, messageIndex = msg;
      if (parsed.kind === "message") {
        const hit = await findMessage(parsed.id);
        if (!hit) {
          const head = await ideaHead();
          if (!stale()) setError(head
            ? `Gear IDEA has no record of message ${shortHex(parsed.id)}. It has indexed messages up to at least block ${head.block} (${new Date(head.timestamp).toLocaleDateString()}); for newer messages, paste the block-index from Subscan.`
            : `Message ${shortHex(parsed.id)} could not be resolved: the Gear IDEA indexer did not answer. Paste the block-index from Subscan instead.`);
          return;
        }
        ({ block, index, messageIndex } = hit);
      } else {
        ({ block, index } = parsed);
        if (parsed.messageIndex !== undefined) messageIndex = parsed.messageIndex;
      }
      where = String(block);
      const fetched = await fetchCase(block, index, messageIndex);
      // A newer fetch (another id) wins over this one.
      if (stale()) return;
      setCase(fetched);
      setRuns(defaultRuns(fetched));
      setTrace(null);
      setInput(`${block}-${index}${messageIndex ? `#${messageIndex}` : ""}`);
      handledId.current = `${block}-${index}#${messageIndex}`;
      writeUrl((p) => {
        p.set("id", `${block}-${index}`);
        if (messageIndex) p.set("msg", String(messageIndex)); else p.delete("msg");
      });
      const programId = fetched.message?.programId ?? fetched.call.destination;
      // An IDL loaded before any case binds to this program. Otherwise switch to this program's
      // IDL: the one remembered locally, else the one its developer published on Gear IDEA.
      if (programId && idlText && idlFor === null && idlSource === "local") { setIdlFor(programId); setIdl(programId as `0x${string}`, idlText); }
      else if (programId && idlFor !== programId) {
        const local = getIdl(programId as `0x${string}`);
        if (local) await applyIdl(local, programId, "local");
        else {
          const resolved = await resolveIdl(programId as `0x${string}`, fetched.message?.codeId ?? null);
          if (!stale()) await applyIdl(resolved?.text ?? null, programId, resolved?.source ?? "local");
        }
      }
    } catch (err) {
      if (!stale()) setError(explainRpcError(err, where || raw));
    } finally {
      if (!stale()) setBusy(false);
    }
  }

  // Deep link: /vara/transactions?tool=message&id=<block>-<index>&tab=trace. Tools stay mounted between
  // visits, so react to the id changing rather than only to the first mount.
  const idParam = params.get("id");
  // Non-negative integer only; anything else falls back to the first message.
  const msgParam = /^\d+$/.test(params.get("msg") ?? "") ? Number(params.get("msg")) : 0;
  useEffect(() => {
    if (TABS.includes(tabParam as Tab)) setTab(tabParam as Tab);
  }, [tabParam]);
  useEffect(() => {
    if (!idParam || `${idParam}#${msgParam}` === handledId.current) return;
    handledId.current = `${idParam}#${msgParam}`;
    setInput(idParam);
    if (TABS.includes(tabParam as Tab)) setTab(tabParam as Tab);
    void fetchExtrinsic(idParam, msgParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, msgParam]);

  // Replays a write that was skipped while the tool was hidden.
  const shownTool = params.get("tool");
  useEffect(() => {
    if (skippedWrite.current) writeUrl(skippedWrite.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownTool]);

  async function importCase(file: File) {
    setBusy(true);
    setError("");
    try {
      const imported = caseFromJson(await file.text());
      setCase(imported);
      setRuns(imported.runs ?? defaultRuns(imported));
      setTrace(imported.trace ?? null);
      setInput(`${imported.block.number}-${imported.extrinsicIndex}`);
      await applyIdl(imported.idl, null);
      // Bind the file's IDL to its program without overwriting the IDL remembered for it.
      setIdlFor(imported.idl ? (imported.message?.programId ?? imported.call.destination) : null);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function importIdl(file: File) {
    setBusy(true);
    setError("");
    try {
      await applyIdl(await file.text(), c?.message?.programId ?? c?.call.destination ?? null);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function exportCase() {
    if (!c) return;
    const body = { ...c, idl: idlText ?? null, ...(runs ? { runs } : {}), ...(trace ? { trace } : {}) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vara-case-${c.block.number}-${c.extrinsicIndex}${(c.messageCount ?? 1) > 1 ? `-m${(c.messageIndex ?? 0) + 1}` : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Rewrites this tool's query through the live URL and keeps the hash. The tool stays mounted while hidden, so after an await the render's params are stale. A write that arrives while another tool is on screen is kept and replayed when this one is shown again. */
  function writeUrl(update: (p: URLSearchParams) => void) {
    const live = new URL(window.location.href);
    skippedWrite.current = null;
    if (live.pathname !== "/vara/transactions" || live.searchParams.get("tool") !== "message") { skippedWrite.current = update; return; }
    update(live.searchParams);
    navigate({ pathname: live.pathname, search: live.search, hash: live.hash }, { replace: true });
  }

  function changeTab(next: string) {
    setTab(next as Tab);
    writeUrl((p) => { p.set("tab", next); });
  }

  let signerAddress = "";
  if (c?.call.signer) {
    try { signerAddress = encodeSs58(hexToBytes(c.call.signer.slice(2)), VARA_SS58_PREFIX); } catch { /* not an AccountId32 */ }
  }
  const call = c?.call.payload ? decodeCall(c.call.payload, sails) : null;
  const reply = c?.message?.reply;
  const programId = c?.message?.programId ?? c?.call.destination ?? null;
  const programNames = useProgramNames([programId]);

  return (
    <section className={`${SURFACE} mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6`}>
      <ToolHeader title="Message inspector" source="Vara mainnet" />

      <div className="space-y-2.5">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void fetchExtrinsic(); }}>
          <div className="min-w-0 flex-1 basis-60 space-y-1.5">
            <label htmlFor="vara-extrinsic" className="block text-sm font-medium">Transaction or message</label>
            <Input id="vara-extrinsic" value={input} onChange={(event) => setInput(event.target.value)} placeholder="36589852-1, a Subscan or IDEA link, or a message id"
              className="font-mono" autoComplete="off" spellCheck={false} disabled={busy}
              aria-describedby={error ? "vara-message-error" : undefined} />
          </div>
          <Button type="submit" loading={busy} icon={<MagnifyingGlass size={16} />}>Inspect</Button>
          {/* One labelled menu for the investigation's files instead of four unlabelled icons. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={busy}>Investigation<CaretDown /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="[&_[role=menuitem]]:min-h-11 md:[&_[role=menuitem]]:min-h-9">
              <DropdownMenuItem disabled={!c} onSelect={() => { if (!c) return; try { setSaved(saveInvestigation({ ...c, idl: idlText, ...(trace ? { trace } : {}), ...(runs ? { runs } : {}) })); setSavedNotice("Investigation saved in this browser."); } catch (err) { setSavedNotice(err instanceof Error ? err.message : String(err)); } }}><FloppyDisk size={16} />Save in this browser</DropdownMenuItem>
              <DropdownMenuItem disabled={!c} onSelect={exportCase}><DownloadSimple size={16} />Export as a file</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => caseInput.current?.click()}><UploadSimple size={16} />Open an investigation file…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => idlInput.current?.click()}><FileCode size={16} />Load an IDL file…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={caseInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importCase(file);
          }} />
          <input ref={idlInput} type="file" accept=".idl,.txt" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importIdl(file);
          }} />
        </form>
        <details open={!c}><summary className="min-h-9 cursor-pointer content-center text-sm text-muted-foreground">Saved snapshots</summary><div className="flex flex-wrap items-center gap-2 py-2" role="group" aria-label="Example investigations">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { setTab("overview"); setDetail("payload"); void importCase(new File([basketExample], "case-36589852-1.json")); }}>Decoded call</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { setTab("trace"); void importCase(new File([traceExample], "case-36592237-1.json")); }}>Wait & wake trace</Button>
          <span className="basis-full text-xs text-muted-foreground">Inspect, trace and dry run use RPC data.</span>
        </div></details>
        {error && <p id="vara-message-error" role="alert" className="max-w-md break-words text-sm text-red-400">{error}</p>}
        {!c && !busy && <RecentMessages disabled={busy} onPick={(id) => { setInput(id); void fetchExtrinsic(id); }} />}
        {(saved.length > 0 || savedNotice) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* A menu, not a <select>: arrow keys on a closed select fire change and would replace the open investigation. */}
            {saved.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-auto max-w-full whitespace-normal text-left" disabled={busy}>Open saved investigation ({saved.length})<CaretDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="[&_[role=menuitem]]:min-h-11">{saved.map((s) => <DropdownMenuItem key={s.key} onSelect={() => void importCase(new File([JSON.stringify(s.c)], "saved-case.json"))}>{s.c.block.number}-{s.c.extrinsicIndex} · message {(s.c.messageIndex ?? 0) + 1} · {new Date(s.savedAt).toLocaleDateString()}</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>}
            {savedNotice && <span role="status">{savedNotice}</span>}
          </div>
        )}
        {sails && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge variant={idlSource === "local" || !idlSource ? "outline" : "teal"}>{IDL_SOURCE_LABEL[idlSource ?? "local"]}</Badge>
            <span>{Object.keys(sails.services).length} service{Object.keys(sails.services).length === 1 ? "" : "s"}</span>
            <IconAction label="Clear the IDL" disabled={busy} onClick={() => { setSails(null); setIdlText(null); setIdlFor(null); setIdlSource(null); setError(""); }}><X size={16} /></IconAction>
            <span className="text-xs">{sails instanceof SailsProgram ? "Sails IDL v2" : "Legacy Sails IDL"}</span>
          </div>
        )}
      </div>

      {c && (
        <>
          <section aria-label="Transaction summary" className="min-w-0 rounded-lg border border-border/70 bg-card">
          <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Extrinsic">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-mono">{c.block.number}-{c.extrinsicIndex}</span>
                <ExplorerLinks links={[{ label: "Subscan", href: subscanExtrinsic(c.block.number, c.extrinsicIndex), title: "Open the extrinsic in Subscan" }]} />
              </span>
            </Field>
            <Field label="Block">
              <span className="inline-flex flex-wrap items-center gap-1">
                <HexChip value={c.block.hash} label="block hash" />
                <ExplorerLinks links={[{ label: "Subscan", href: subscanBlock(c.block.number), title: "Open the block in Subscan" }]} />
              </span>
            </Field>
            <Field label="Call">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {c.call.section}.{c.call.method}
                <Badge variant={c.result.success ? "success" : "error"}>{c.result.success ? "Success" : "Failed"}</Badge>
                {c.call.via === "voucher" && <Badge variant="outline">via voucher</Badge>}
                {c.call.via === "batch" && <Badge variant="outline">batch</Badge>}
              </span>
            </Field>
            <Field label="Program">
              {programId ? (
                <span className="block min-w-0 space-y-1">
                  {programNames.get(programId.toLowerCase()) && <span className="block truncate text-sm font-medium">{programNames.get(programId.toLowerCase())}</span>}
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <HexChip value={programId} label="program id" />
                    <ExplorerLinks links={[
                      { label: "IDEA", href: ideaProgramUrl(programId), title: "Open the program in Gear IDEA" },
                      { label: "Subscan", href: subscanAccount(programId), title: "Open the program account in Subscan" },
                    ]} />
                    <IconAction size="icon-inline" label="Open in the program workspace" onClick={() => navigate(`/vara/transactions?tool=program&program=${programId}`)}><Cube size={14} /></IconAction>
                  </span>
                </span>
              ) : "—"}
            </Field>
          </dl>

          {((c.messageCount ?? 1) > 1 || c.call.voucherId) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-4 py-2">
              {(c.messageCount ?? 1) > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="vara-message-index" className="text-sm text-muted-foreground">This extrinsic queued {c.messageCount} messages</label>
                  <Select value={String(c.messageIndex ?? 0)} disabled={busy} onValueChange={(v) => void fetchExtrinsic(`${c.block.number}-${c.extrinsicIndex}`, Number(v))}>
                    <SelectTrigger id="vara-message-index" size="sm" className="w-auto min-w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: c.messageCount ?? 1 }, (_, k) => <SelectItem key={k} value={String(k)}>Message {k + 1} of {c.messageCount}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {c.call.voucherId && <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">Voucher <HexChip value={c.call.voucherId} label="voucher id" /></span>}
            </div>
          )}
          </section>

          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList aria-label="Message views" className="h-auto max-w-full flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="dryrun">Dry run</TabsTrigger>
            </TabsList>
            <TabsContent value="diagnosis" className={PANEL}>
              <IncidentPanel c={{ ...c, idl: idlText }} trace={trace} onTrace={() => changeTab("trace")} />
            </TabsContent>
            <TabsContent value="trace" className={PANEL}>
              <TracePanel c={c} sails={sails} trace={trace} onTrace={setTrace} />
            </TabsContent>
            <TabsContent value="dryrun" className={PANEL}>
              {runs ? <DryRunPanel key={`${c.block.hash}-${c.extrinsicIndex}`} c={c} sails={sails} runs={runs} update={(f) => setRuns((prev) => prev && f(prev))} />
                : <p className="text-sm text-muted-foreground">Only message sends (direct, via voucher or inside a batch) can be dry-run.</p>}
            </TabsContent>
            <TabsContent value="overview" className={PANEL}>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <Panel title="Details">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Field label="Signer">{c.call.signer ? <span className="inline-flex flex-wrap items-center gap-1"><HexChip value={c.call.signer} label="signer" /><ExplorerLinks links={[{ label: "Subscan", href: subscanAccount(c.call.signer), title: "Open the signer in Subscan" }]} /></span> : "—"}</Field>
                    {signerAddress && <Field label={`Vara SS58 (${VARA_SS58_PREFIX})`}><HexChip value={signerAddress} label="Vara address" /></Field>}
                    {c.message && <Field label="Message id"><span className="inline-flex flex-wrap items-center gap-1"><HexChip value={c.message.id} label="message id" /><ExplorerLinks links={[{ label: "IDEA", href: ideaMessageUrl(c.message.id), title: "Open the message in Gear IDEA" }]} /></span></Field>}
                    {c.message && (
                      <Field label="Dispatch">
                        {c.message.dispatchStatus
                          ? <Badge variant={c.message.dispatchStatus === "Success" ? "success" : "error"}>{c.message.dispatchStatus}</Badge>
                          : <span className="text-muted-foreground">Not dispatched in this block</span>}
                      </Field>
                    )}
                    {c.message?.codeId && <Field label="Code id"><span className="inline-flex flex-wrap items-center gap-1"><HexChip value={c.message.codeId} label="code id" /><ExplorerLinks links={[{ label: "IDEA", href: ideaCodeUrl(c.message.codeId), title: "Open the code in Gear IDEA" }]} /></span></Field>}
                    <Field label="Gas limit"><span className="font-mono">{c.call.gasLimit ?? "—"}</span></Field>
                    <Field label="Value"><span className="font-mono">{c.call.value ?? "—"}</span></Field>
                    <Field label="Keep alive">{c.call.keepAlive === null ? "—" : String(c.call.keepAlive)}</Field>
                    <Field label="Runtime"><span className="font-mono">spec {c.network.specVersion}</span></Field>
                    {!c.result.success && <Field label="Error" className="sm:col-span-2"><span className="text-red-400">{c.result.error}</span></Field>}
                    {!c.message && <p className="text-sm text-muted-foreground sm:col-span-2">This extrinsic queued no Gear message.</p>}
                  </dl>
                </Panel>
                <Panel aria-label="Message contents">
                  <Tabs value={detail} onValueChange={(v) => setDetail(v as Detail)}>
                    <TabsList aria-label="Message contents">
                      <TabsTrigger value="payload">Payload</TabsTrigger>
                      <TabsTrigger value="reply">Reply</TabsTrigger>
                      <TabsTrigger value="events">Events <span className="ml-1 font-mono text-xs text-muted-foreground">{c.message?.programEvents.length ?? 0}</span></TabsTrigger>
                    </TabsList>
                    <TabsContent value="payload" className={PANEL}>
                      {c.call.payload && call
                        ? <Payload payload={c.call.payload} decoded={call} hasIdl={!!sails} />
                        : <><ValueTree value={c.call.args} rootLabel="args" /><p className="text-sm text-muted-foreground">Only message sends (direct, via voucher or inside a batch) are decoded.</p></>}
                    </TabsContent>
                    <TabsContent value="reply" className={PANEL}>
                      {reply ? (
                        <div className="space-y-3">
                          <dl className="grid gap-4 sm:grid-cols-2">
                            <Field label="Reply id"><HexChip value={reply.id} label="reply id" /></Field>
                            <Field label="Code"><code className="break-all font-mono text-sm">{reply.code}</code></Field>
                          </dl>
                          {reply.success
                            ? reply.payload === "0x" ? <p className="text-sm text-muted-foreground">Empty reply</p>
                              : <Payload payload={reply.payload} decoded={decodeReply(reply.payload, call ?? { service: null, name: null, value: null, error: null }, sails)} hasIdl={!!sails} />
                            : <pre className="whitespace-pre-wrap break-all rounded-md border border-red-500/30 bg-red-500/5 p-3 font-mono text-sm text-red-300">{utf8(reply.payload) ?? reply.payload}</pre>}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No reply in this block. <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => changeTab("trace")}>Trace the message</button> to follow later blocks.</p>
                      )}
                    </TabsContent>
                    <TabsContent value="events" className={cn(PANEL, "space-y-4")}>
                      <p className="text-xs text-muted-foreground">Events this program emitted in the same block. The Trace tab proves which ones this message caused.</p>
                      {c.message?.programEvents.length ? c.message.programEvents.map((event) => (
                        <div key={event.id} className="space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                          <Field label="Event id"><HexChip value={event.id} label="event id" /></Field>
                          <Payload payload={event.payload} decoded={decodeEvent(event.payload, sails)} hasIdl={!!sails} />
                        </div>
                      )) : <p className="text-sm text-muted-foreground">This program emitted no events in this block.</p>}
                    </TabsContent>
                  </Tabs>
                </Panel>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
