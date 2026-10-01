import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { hexToBytes } from "@noble/hashes/utils";
import type { Sails } from "sails-js";
import { AnimatedTabContent } from "../../components/ui/animated-tabs";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { encodeSs58, VARA_SS58_PREFIX } from "./address";
import { caseFromJson, explainRpcError, fetchCase } from "./case";
import type { Runs, VaraCase } from "./case";
import { decodeCall, decodeEvent, decodeReply, loadIdl } from "./decode";
import type { Decoded } from "./decode";
import DryRunPanel from "./DryRunPanel";
import { getIdl, setIdl } from "./idlStore";
import type { Trace } from "./model";
import TracePanel from "./TracePanel";
import { Field, HexChip } from "./ui/HexChip";
import { ValueTree } from "./ui/ValueTree";

const TABS = ["overview", "trace", "dryrun"] as const;
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

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

export default function MessageTool() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(() => params.get("id") ?? "");
  const [c, setCase] = useState<VaraCase | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [idlText, setIdlText] = useState<string | null>(null);
  /** Program the loaded IDL belongs to; null while it is not yet bound to a fetched case. */
  const [idlFor, setIdlFor] = useState<string | null>(null);
  const [sails, setSails] = useState<Sails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tabParam = params.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview");
  const handledId = useRef<string | null>(null);
  const caseInput = useRef<HTMLInputElement>(null);
  const idlInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function applyIdl(text: string | null, programId: string | null) {
    setIdlText(text);
    setIdlFor(text ? programId : null);
    setSails(null);
    if (!text) return;
    const s = await loadIdl(text);
    if (!alive.current) return;
    setSails(s);
    if (programId) setIdl(programId as `0x${string}`, text);
  }

  async function fetchExtrinsic(raw = input, msg = 0) {
    const match = /^(\d+)-(\d+)$/.exec(raw.trim());
    if (!match) {
      setError("Use <block>-<index>, e.g. 36589852-1");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fetched = await fetchCase(Number(match[1]), Number(match[2]), msg);
      if (!alive.current) return;
      setCase(fetched);
      setRuns(defaultRuns(fetched));
      setTrace(null);
      handledId.current = `${match[1]}-${match[2]}#${msg}`;
      setParams((p) => {
        p.set("id", `${match[1]}-${match[2]}`);
        if (msg) p.set("msg", String(msg)); else p.delete("msg");
        return p;
      }, { replace: true });
      const programId = fetched.message?.programId ?? fetched.call.destination;
      // An IDL loaded before any case binds to this program; otherwise switch to the
      // IDL remembered for this program so another program's IDL is never reused.
      if (programId && idlText && idlFor === null) { setIdlFor(programId); setIdl(programId as `0x${string}`, idlText); }
      else if (programId && idlFor !== programId) await applyIdl(getIdl(programId), programId);
    } catch (err) {
      if (alive.current) setError(explainRpcError(err, match[1]));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Deep link: /vara/message?id=<block>-<index>&tab=trace. Tools stay mounted between
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

  function changeTab(next: string) {
    setTab(next as Tab);
    setParams((p) => { p.set("tab", next); return p; }, { replace: true });
  }

  let signerAddress = "";
  if (c?.call.signer) {
    try { signerAddress = encodeSs58(hexToBytes(c.call.signer.slice(2)), VARA_SS58_PREFIX); } catch { /* not an AccountId32 */ }
  }
  const call = c?.call.payload ? decodeCall(c.call.payload, sails) : null;
  const reply = c?.message?.reply;
  const programId = c?.message?.programId ?? c?.call.destination ?? null;

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Message case</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">Decode a Gear message from Vara mainnet, trace everything it caused, replay it at other blocks, and export it as a portable case file.</p>
        <p className="mt-2 text-xs text-muted-foreground">Pinned format: legacy Sails IDL (sails-js-parser 0.5.1). IDL v2 payloads (0x474d) are flagged, not decoded.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="vara-extrinsic" className="text-sm font-medium">Extrinsic id</label>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void fetchExtrinsic(); }}>
          <Input id="vara-extrinsic" value={input} onChange={(event) => setInput(event.target.value)} placeholder="36589852-1"
            className="w-full font-mono sm:w-60" autoComplete="off" spellCheck={false} disabled={busy}
            aria-describedby={error ? "vara-message-error" : undefined} />
          <Button type="submit" variant="outline" loading={busy}>Fetch</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => caseInput.current?.click()}>Import case</Button>
          <input ref={caseInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importCase(file);
          }} />
          <Button type="button" variant="outline" disabled={!c || busy} onClick={exportCase}>Export case</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => idlInput.current?.click()}>Load IDL</Button>
          <input ref={idlInput} type="file" accept=".idl,.txt" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importIdl(file);
          }} />
        </form>
        {sails && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">IDL</Badge>
            <span>{Object.keys(sails.services).length} service{Object.keys(sails.services).length === 1 ? "" : "s"}</span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setSails(null); setIdlText(null); setIdlFor(null); setError(""); }}>Clear</Button>
          </div>
        )}
        {error && <p id="vara-message-error" role="alert" className="text-sm text-red-400">{error}</p>}
      </div>

      {c && (
        <>
          <dl className="grid gap-4 rounded-lg border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Extrinsic"><span className="font-mono">{c.block.number}-{c.extrinsicIndex}</span></Field>
            <Field label="Block hash"><HexChip value={c.block.hash} label="block hash" /></Field>
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
                <span className="inline-flex flex-wrap items-center gap-1">
                  <HexChip value={programId} label="program id" />
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate(`/vara/program?program=${programId}`)}>Open workspace</Button>
                </span>
              ) : "—"}
            </Field>
          </dl>

          {((c.messageCount ?? 1) > 1 || c.call.voucherId) && (
            <div className="flex flex-wrap items-center gap-3">
              {(c.messageCount ?? 1) > 1 && (
                <div className="flex items-center gap-2">
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

          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="dryrun">Dry run</TabsTrigger>
            </TabsList>
          </Tabs>

          <AnimatedTabContent activeKey={tab} className="min-w-0">
            {tab === "trace" ? (
              <TracePanel c={c} sails={sails} trace={trace} onTrace={setTrace} />
            ) : tab === "dryrun" ? (
              runs ? <DryRunPanel key={`${c.block.hash}-${c.extrinsicIndex}`} c={c} sails={sails} runs={runs} update={(f) => setRuns((prev) => prev && f(prev))} />
                : <p className="text-sm text-muted-foreground">Only gear.sendMessage extrinsics can be dry-run.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Call">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Field label="Signer">{c.call.signer ? <HexChip value={c.call.signer} label="signer" /> : "—"}</Field>
                    {signerAddress && <Field label={`Vara SS58 (${VARA_SS58_PREFIX})`}><HexChip value={signerAddress} label="Vara address" /></Field>}
                    <Field label="Destination">{c.call.destination ? <HexChip value={c.call.destination} label="destination" /> : "—"}</Field>
                    <Field label="Gas limit"><span className="font-mono">{c.call.gasLimit ?? "—"}</span></Field>
                    <Field label="Value"><span className="font-mono">{c.call.value ?? "—"}</span></Field>
                    <Field label="Keep alive">{c.call.keepAlive === null ? "—" : String(c.call.keepAlive)}</Field>
                    {!c.result.success && <Field label="Error" className="sm:col-span-2"><span className="text-red-400">{c.result.error}</span></Field>}
                  </dl>
                </Card>
                <Card title="Payload">
                  {c.call.payload && call
                    ? <Payload payload={c.call.payload} decoded={call} hasIdl={!!sails} />
                    : <><ValueTree value={c.call.args} rootLabel="args" /><p className="text-sm text-muted-foreground">Only message sends (direct, via voucher or inside a batch) are decoded</p></>}
                </Card>
                <Card title="Message">
                  {c.message ? (
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Field label="Message id"><HexChip value={c.message.id} label="message id" /></Field>
                      <Field label="Code id">{c.message.codeId ? <HexChip value={c.message.codeId} label="code id" /> : "—"}</Field>
                      <Field label="Dispatch status">
                        {c.message.dispatchStatus
                          ? <Badge variant={c.message.dispatchStatus === "Success" ? "success" : "error"}>{c.message.dispatchStatus}</Badge>
                          : "Not dispatched in this block"}
                      </Field>
                      <Field label="Spec version"><span className="font-mono">{c.network.specVersion}</span></Field>
                    </dl>
                  ) : <p className="text-sm text-muted-foreground">No queued message</p>}
                </Card>
                <Card title="Reply">
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
                  ) : <p className="text-sm text-muted-foreground">No reply in this block. The Trace tab follows later blocks.</p>}
                </Card>
                <div className="lg:col-span-2">
                  <Card title="Program events in this block" aside={<span className="text-xs text-muted-foreground">same block, same program; the Trace tab proves which belong to this message</span>}>
                    {c.message?.programEvents.length ? c.message.programEvents.map((event) => (
                      <div key={event.id} className="space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                        <Field label="Event id"><HexChip value={event.id} label="event id" /></Field>
                        <Payload payload={event.payload} decoded={decodeEvent(event.payload, sails)} hasIdl={!!sails} />
                      </div>
                    )) : <p className="text-sm text-muted-foreground">No program events in this block</p>}
                  </Card>
                </div>
              </div>
            )}
          </AnimatedTabContent>
        </>
      )}
    </section>
  );
}
