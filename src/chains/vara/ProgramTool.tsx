import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Sails } from "sails-js";
import AnimatedProgressBar from "../../components/smoothui/ui/AnimatedProgressBar";
import SearchableDropdown from "../../components/smoothui/ui/SearchableDropdown";
import Skeleton from "../../components/smoothui/ui/Skeleton";
import { AnimatedTabContent } from "../../components/ui/animated-tabs";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { decodeSs58, encodeSs58, VARA_SS58_PREFIX } from "./address";
import { decodeCall } from "./decode";
import { dryRun, parseInput, sendMessage } from "./dryRun";
import { getIdl, setIdl } from "./idlStore";
import { defaultFormValue, encodeMethod, loadIdlModel } from "./idlForm";
import type { ActivityItem, FormValue, Hex, IdlModel, MethodSchema, ProgramInfo } from "./model";
import { estimateGas, loadProgram, recentActivity } from "./program";
import type { RunResultT } from "./case";
import { useVaraWallet } from "./wallet";
import { Field, HexChip, shortHex } from "./ui/HexChip";
import { IdlDrop } from "./ui/IdlDrop";
import { FieldEditor, typeLabel } from "./ui/TypedForm";
import { ValueTree } from "./ui/ValueTree";

const EXAMPLES = [
  { id: "0xa749ccd80d71637b450789e12e3d94524e9ae17877d1b59f5ddda784f89a2cba", name: "PolyBaskets BasketMarket" },
  { id: "0xbdc6cbde7047f3a742c589a0073412cecdb56bd541a7d2b1810d134794d82029", name: "ServiceSync" },
  { id: "0x038534fe3ec91c4a9b4074f14908bfeca6358da0515772a428d8c489fdd134a1", name: "DEX Pair" },
  { id: "0x4255ff4a87a4c13dc39f74ace8c4948bbef2f75fb639d66639a1cfcc99e6243e", name: "Vft token" },
] as const;
const ZERO = `0x${"00".repeat(32)}` as Hex;
const LAST_KEY = "hexkit.vara.lastProgram";
const ACTIVITY_RANGES = [300, 1200, 3600] as const;

const methodKey = (m: MethodSchema) => `${m.service}.${m.name}`;

function formatVara(plancks: string | null) {
  if (plancks === null) return "—";
  const v = BigInt(plancks);
  const whole = v / 10n ** 12n;
  const frac = (v % 10n ** 12n).toString().padStart(12, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toLocaleString()}${frac ? `.${frac}` : ""} VARA`;
}

function toHexAccount(input: string): Hex {
  const v = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase() as Hex;
  return `0x${bytesToHex(decodeSs58(v))}` as Hex;
}

function utf8(hex: string): string | null {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(hex.slice(2))); } catch { return null; }
}

function readLast(): string {
  try { return localStorage.getItem(LAST_KEY) ?? ""; } catch { return ""; }
}

type Outcome =
  | { kind: "run"; method: string; at: string; result: RunResultT }
  | { kind: "gas"; method: string; gas: string }
  | { kind: "sent"; method: string; block: number; index: number }
  | { kind: "error"; method: string; message: string };

function ResultCard({ outcome, method, sails, onOpenTrace }: { outcome: Outcome; method: MethodSchema | null; sails: Sails | null; onOpenTrace: (id: string) => void }) {
  if (outcome.kind === "error") return <p role="alert" className="break-words text-sm text-red-400">{outcome.message}</p>;
  if (outcome.kind === "gas") {
    return <dl className="rounded-lg border border-border/70 bg-card p-4"><Field label="Minimum gas"><code className="font-mono text-sm">{outcome.gas}</code></Field></dl>;
  }
  if (outcome.kind === "sent") {
    const id = `${outcome.block}-${outcome.index}`;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card p-4 text-sm">
        <Badge variant="success">Included</Badge> <span className="font-mono">{id}</span>
        <Button variant="outline" size="sm" onClick={() => onOpenTrace(id)}>Open trace</Button>
      </div>
    );
  }
  const r = outcome.result;
  if (r.error) return <p role="alert" className="break-words text-sm text-red-400">{r.error}</p>;
  const reply = r.reply;
  let body: React.ReactNode = <p className="text-sm text-muted-foreground">No reply</p>;
  if (reply) {
    if (!reply.success) {
      const text = utf8(reply.payload);
      body = <pre className="whitespace-pre-wrap break-all rounded-md border border-red-500/30 bg-red-500/5 p-3 font-mono text-sm text-red-300">{text ?? reply.payload}</pre>;
    } else if (reply.payload === "0x") {
      body = <p className="text-sm text-muted-foreground">Empty reply</p>;
    } else if (sails && method) {
      try {
        const kind = method.kind === "query" ? "queries" : "functions";
        const value = sails.services[method.service][kind][method.name].decodeResult<unknown>(reply.payload);
        body = <ValueTree value={value} rootLabel={method.name} />;
      } catch (err) {
        body = <><code className="block break-all font-mono text-xs">{reply.payload}</code><p className="text-xs text-muted-foreground">{err instanceof Error ? err.message : String(err)}</p></>;
      }
    } else {
      body = <code className="block break-all font-mono text-xs">{reply.payload}</code>;
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {reply && <Badge variant={reply.success ? "success" : "error"}>{reply.success ? "Success" : "Error"}</Badge>}
        {reply && <code className="break-all font-mono text-xs text-muted-foreground">{reply.code}</code>}
        {r.block && <span className="font-mono text-xs text-muted-foreground">at #{r.block.number} · spec {r.specVersion}</span>}
      </div>
      {body}
    </div>
  );
}

function MethodList({ model, selected, onSelect }: { model: IdlModel; selected: string | null; onSelect: (key: string) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search methods" aria-label="Search methods" className="pl-9" />
      </div>
      <nav aria-label="Methods" className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
        {model.services.map((svc) => {
          const methods = svc.methods.filter((m) => !needle || m.name.toLowerCase().includes(needle) || svc.name.toLowerCase().includes(needle));
          if (methods.length === 0) return null;
          return (
            <div key={svc.name} className="space-y-1">
              <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{svc.name}</p>
              {methods.map((m) => {
                const key = methodKey(m);
                return (
                  <button key={key} type="button" onClick={() => onSelect(key)} aria-current={selected === key}
                    className={cn("flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selected === key ? "bg-foreground/10 text-foreground" : "text-foreground/80 hover:bg-foreground/5")}>
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{m.kind === "query" ? "query" : "fn"}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function Activity({ programId, sails, onOpenTrace }: { programId: Hex; sails: Sails | null; onOpenTrace: (id: string, msg?: number) => void }) {
  const [range, setRange] = useState<number>(1200);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function scan() {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError("");
    setProgress({ scanned: 0, total: range });
    try {
      const list = await recentActivity(programId, range, (scanned, total) => { if (!ctl.signal.aborted) setProgress({ scanned, total }); }, ctl.signal);
      // Stop returns the partial list; only a newer scan supersedes it.
      if (abort.current === ctl) setItems(list);
    } catch (err) {
      if (!ctl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abort.current === ctl) { abort.current = null; setProgress(null); }
    }
  }

  const pct = progress ? Math.round((progress.scanned / Math.max(progress.total, 1)) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="vara-activity-range" className="block text-xs text-muted-foreground">Window</label>
          <Select value={String(range)} onValueChange={(v) => setRange(Number(v))} disabled={!!progress}>
            <SelectTrigger id="vara-activity-range" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{ACTIVITY_RANGES.map((r) => <SelectItem key={r} value={String(r)}>Last {r} blocks (~{Math.round((r * 3) / 60)} min)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" loading={!!progress} onClick={() => void scan()}>{items ? "Rescan" : "Scan activity"}</Button>
        {progress && <Button variant="ghost" onClick={() => abort.current?.abort()}>Stop</Button>}
      </div>
      {progress && (
        <div className="max-w-md space-y-1">
          <AnimatedProgressBar value={pct} color="var(--foreground)" />
          <p className="font-mono text-xs text-muted-foreground">Scanned {progress.scanned} / {progress.total} blocks</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {items && items.length === 0 && !progress && <p className="text-sm text-muted-foreground">No messages to this program in the last {range} blocks.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
          {items.map((it) => {
            const route = decodeCall(it.payload, sails);
            const id = `${it.block}-${it.extrinsicIndex}`;
            const ok = it.status === "Success" && it.replySuccess !== false;
            return (
              <li key={it.messageId}>
                <button type="button" onClick={() => onOpenTrace(id, it.messageIndex)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-3 text-left transition-colors hover:bg-foreground/5 sm:grid-cols-[7.5rem_1fr_9rem_auto] sm:px-4">
                  <span className="font-mono text-xs text-muted-foreground sm:text-sm">{it.block}-{it.extrinsicIndex}{it.messageIndex ? ` #${it.messageIndex + 1}` : ""}</span>
                  <span className="col-span-2 row-start-2 min-w-0 truncate text-sm sm:col-span-1 sm:row-start-auto">{route.service && route.name ? `${route.service}.${route.name}` : "Raw payload"}</span>
                  <span className="hidden font-mono text-xs text-muted-foreground sm:block">{shortHex(encodeSs58(hexToBytes(it.source.slice(2)), VARA_SS58_PREFIX), 4, 4)}</span>
                  <Badge variant={it.status === null ? "outline" : ok ? "success" : "error"} className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">{it.status ?? "Pending"}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ProgramTool() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { account } = useVaraWallet();
  const [input, setInput] = useState(() => params.get("program") ?? readLast());
  const [programId, setProgramId] = useState<Hex | null>(null);
  const [info, setInfo] = useState<ProgramInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [idl, setIdlState] = useState<{ sails: Sails; model: IdlModel } | null>(null);
  const [idlError, setIdlError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, FormValue[]>>({});
  const [origin, setOrigin] = useState("");
  const [block, setBlock] = useState("latest");
  const [value, setValue] = useState("0");
  const [gas, setGas] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tab, setTab] = useState("methods");
  const alive = useRef(true);
  const loadSeq = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const accountHex = useMemo(() => {
    if (!account) return null;
    try { return toHexAccount(account.address); } catch { return null; }
  }, [account]);

  const methods = useMemo(() => idl?.model.services.flatMap((s) => s.methods) ?? [], [idl]);
  const method = methods.find((m) => methodKey(m) === selected) ?? null;
  const values = method ? forms[methodKey(method)] ?? method.params.map((p) => defaultFormValue(p.schema)) : [];

  async function applyIdl(id: Hex, text: string | null) {
    setIdlError("");
    if (!text) { setIdlState(null); return; }
    try {
      const loaded = await loadIdlModel(text);
      if (!alive.current) return;
      setIdlState(loaded);
      const first = loaded.model.services.flatMap((s) => s.methods)[0];
      setSelected((cur) => cur ?? (first ? methodKey(first) : null));
      setIdl(id, text);
    } catch (err) {
      if (alive.current) setIdlError(err instanceof Error ? err.message : String(err));
    }
  }

  async function load(raw: string) {
    const seq = ++loadSeq.current;
    let id: Hex;
    try { id = toHexAccount(raw); } catch { setError("Enter a 0x program id (32 bytes) or an SS58 address"); return; }
    setLoading(true);
    setError("");
    setOutcome(null);
    setSelected(null);
    setForms({});
    try {
      const pi = await loadProgram(id);
      // A newer load (another program id) wins over this one.
      if (!alive.current || seq !== loadSeq.current) return;
      handledProgram.current = id;
      setProgramId(id);
      setInfo(pi);
      setParams((p) => { p.set("program", id); return p; }, { replace: true });
      try { localStorage.setItem(LAST_KEY, id); } catch { /* storage unavailable */ }
      await applyIdl(id, getIdl(id));
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  // Load the program named in the URL. Tools stay mounted between visits, so react to
  // the parameter changing rather than only to the first mount.
  const programParam = params.get("program");
  const handledProgram = useRef<string | null>(null);
  useEffect(() => {
    if (!programParam || programParam.toLowerCase() === handledProgram.current) return;
    setInput(programParam);
    void load(programParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programParam]);

  function openTrace(id: string, msg = 0) {
    navigate(`/vara/message?id=${id}${msg ? `&msg=${msg}` : ""}&tab=trace`);
  }

  function originHex(): Hex {
    const v = origin.trim();
    if (!v) return accountHex ?? ZERO;
    return toHexAccount(v);
  }

  async function act(kind: "run" | "gas" | "send") {
    if (!method || !idl || !programId) return;
    const key = methodKey(method);
    setBusy(kind);
    setOutcome(null);
    try {
      const payload = encodeMethod(idl.sails, method, values);
      const from = originHex();
      if (kind === "gas") {
        const g = await estimateGas(from, programId, payload, BigInt(value || "0"));
        if (!alive.current) return;
        setGas(g);
        setOutcome({ kind: "gas", method: key, gas: g });
      } else if (kind === "send") {
        if (!account || !accountHex) throw new Error("Connect a Vara wallet first");
        const gasLimit = gas.trim() || (await estimateGas(accountHex, programId, payload, BigInt(value || "0")));
        const input = parseInput({ block: "latest", origin: accountHex, payload, value: value || "0", gasLimit });
        const res = await sendMessage(account, programId, input, () => {});
        if (!alive.current) return;
        setOutcome({ kind: "sent", method: key, ...res });
      } else {
        // gasLimit 0 lets calculateReply use the block gas limit.
        const input = parseInput({ block, origin: from, payload, value: method.kind === "query" ? "0" : value || "0", gasLimit: gas.trim() || "0" });
        const result = await dryRun(programId, input, null);
        if (!alive.current) return;
        setOutcome({ kind: "run", method: key, at: block, result });
      }
    } catch (err) {
      if (alive.current) setOutcome({ kind: "error", method: key, message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  const signature = method ? `(${method.params.map((p) => `${p.name}: ${typeLabel(p.schema)}`).join(", ")}) -> ${typeLabel(method.returns)}` : "";
  const dropdownItems = methods.map((m) => ({ id: methodKey(m), label: `${m.service}.${m.name}`, description: m.kind === "query" ? "query" : "function" }));

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Program workspace</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">Load a Vara program and its Sails IDL, then call any function or query as a dry run at a chosen block, estimate gas, or send it from your wallet.</p>
      </div>

      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void load(input); }}>
        <div className="w-full min-w-0 space-y-1.5 sm:w-auto sm:flex-1">
          <label htmlFor="vara-program-id" className="block text-sm font-medium">Program id</label>
          <Input id="vara-program-id" value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x… program id" className="font-mono" autoComplete="off" spellCheck={false} />
        </div>
        <Button type="submit" variant="outline" loading={loading}>Load</Button>
      </form>
      {!programId && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Examples on mainnet</span>
          {EXAMPLES.map((ex) => (
            <Button key={ex.id} type="button" variant="outline" size="sm" onClick={() => { setInput(ex.id); void load(ex.id); }}>{ex.name}</Button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {loading && !info && <Skeleton className="h-28 w-full rounded-lg" />}

      {info && programId && (
        <>
          <dl className="grid gap-4 rounded-lg border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Program"><HexChip value={programId} label="program id" /></Field>
            <Field label="Status"><Badge variant={info.status === "active" ? "success" : info.status === "missing" ? "outline" : "warning"}>{info.status}</Badge></Field>
            <Field label="Code id">{info.codeId ? <HexChip value={info.codeId} label="code id" /> : "—"}</Field>
            <Field label="Balance"><span className="font-mono">{formatVara(info.balance)}</span></Field>
          </dl>

          {!idl ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-card p-4">
              <p className="text-sm font-medium">Sails IDL</p>
              <p className="text-xs text-muted-foreground">Drop the program's .idl file to unlock typed forms and decoding. It is remembered for this program in this browser.</p>
              <IdlDrop onText={(text) => void applyIdl(programId, text)} />
              {idlError && <p role="alert" className="text-sm text-red-400">{idlError}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">IDL</Badge>
              <span>{idl.model.services.length} service{idl.model.services.length === 1 ? "" : "s"} · {methods.length} methods</span>
              <Button variant="ghost" size="sm" onClick={() => { setIdl(programId, null); setIdlState(null); setSelected(null); setOutcome(null); }}>Replace IDL</Button>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="methods">Methods</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </Tabs>
          <AnimatedTabContent activeKey={tab}>
            {tab === "activity" ? (
              <Activity programId={programId} sails={idl?.sails ?? null} onOpenTrace={openTrace} />
            ) : !idl ? (
              <p className="text-sm text-muted-foreground">Load an IDL to call this program's methods.</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
                <aside className="hidden lg:block"><MethodList model={idl.model} selected={selected} onSelect={(k) => { setSelected(k); setOutcome(null); }} /></aside>
                <div className="lg:hidden">
                  <SearchableDropdown className="w-full" value={selected} label="Choose a method" items={dropdownItems} placeholder="Search methods"
                    onChange={(item) => { setSelected(String(item.id)); setOutcome(null); }} />
                </div>

                {method && (
                  <div className="min-w-0 space-y-5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{method.service}.{method.name}</h2>
                        <Badge variant="outline">{method.kind === "query" ? "query" : "function"}</Badge>
                      </div>
                      <code className="block break-all font-mono text-xs text-muted-foreground">{signature}</code>
                      {method.docs && <p className="max-w-prose text-sm text-muted-foreground">{method.docs}</p>}
                    </div>

                    {method.params.length > 0 ? (
                      <div className="space-y-4">
                        {method.params.map((p, i) => (
                          <FieldEditor key={`${methodKey(method)}.${p.name}`} schema={p.schema} value={values[i]} label={p.name} path={`${method.name}.${p.name}`}
                            disabled={!!busy}
                            onChange={(v) => setForms((f) => { const next = [...(f[methodKey(method)] ?? values)]; next[i] = v; return { ...f, [methodKey(method)]: next }; })} />
                        ))}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">No arguments.</p>}

                    <details className="group rounded-lg border border-border/70 p-3">
                      <summary className="cursor-pointer select-none text-sm">Execution settings</summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label htmlFor="vara-origin" className="block text-xs text-muted-foreground">Origin (empty = {account ? "connected wallet" : "zero address"})</label>
                          <Input id="vara-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={accountHex ?? ZERO} className="font-mono" autoComplete="off" spellCheck={false} />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="vara-block" className="block text-xs text-muted-foreground">Block for dry runs</label>
                          <Input id="vara-block" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="latest" className="font-mono" inputMode="numeric" autoComplete="off" />
                        </div>
                        {method.kind === "function" && (
                          <>
                            <div className="space-y-1.5">
                              <label htmlFor="vara-value" className="block text-xs text-muted-foreground">Value (plancks)</label>
                              <Input id="vara-value" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" inputMode="numeric" autoComplete="off" />
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="vara-gas" className="block text-xs text-muted-foreground">Gas limit (empty = estimate)</label>
                              <Input id="vara-gas" value={gas} onChange={(e) => setGas(e.target.value)} placeholder="estimate" className="font-mono" inputMode="numeric" autoComplete="off" />
                            </div>
                          </>
                        )}
                      </div>
                    </details>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" loading={busy === "run"} disabled={!!busy && busy !== "run"} onClick={() => void act("run")}>{method.kind === "query" ? "Query" : "Dry run"}</Button>
                      {method.kind === "function" && (
                        <>
                          <Button variant="outline" loading={busy === "gas"} disabled={!!busy && busy !== "gas"} onClick={() => void act("gas")}>Estimate gas</Button>
                          <Button variant="outline" loading={busy === "send"} disabled={!account || (!!busy && busy !== "send")} onClick={() => void act("send")}>Send</Button>
                        </>
                      )}
                    </div>
                    {method.kind === "function" && (
                      <p className="text-xs text-muted-foreground">{account ? `Send submits a real Vara mainnet transaction from ${account.name ?? shortHex(account.address)}.` : "Connect a Vara wallet (top right) to send."}</p>
                    )}

                    {outcome && outcome.method === methodKey(method) && (
                      <ResultCard outcome={outcome} method={method} sails={idl.sails} onOpenTrace={openTrace} />
                    )}
                  </div>
                )}
              </div>
            )}
          </AnimatedTabContent>
        </>
      )}
    </section>
  );
}
