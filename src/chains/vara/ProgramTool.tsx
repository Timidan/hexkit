import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowClockwise, ArrowsClockwise, DownloadSimple, GasPump, Lightning, MagnifyingGlass, Play, Stop, Terminal } from "@phosphor-icons/react";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { SailsIdl } from "./decode";
import { FunctionTypeTabs } from "../../components/FunctionControls";
import type { FunctionKind, FunctionMode } from "../../components/FunctionControls";
import { AnimatedPlayIcon } from "../../components/icons/IconLibrary";
import AnimatedProgressBar from "../../components/smoothui/ui/AnimatedProgressBar";
import Skeleton from "../../components/smoothui/ui/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import ComplexValueViewer from "../../components/ui/ComplexValueViewer";
import CopyableResult from "../../components/ui/CopyableResult";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { serializeNode } from "../../utils/complexValueBuilder";
import type { ComplexValueNode } from "../../utils/complexValueBuilder";
import { decodeSs58, encodeSs58, VARA_SS58_PREFIX } from "./address";
import { decodeCall, decodeEvent, decodeReply } from "./decode";
import { dryRun, parseInput, sendMessage } from "./dryRun";
import { getIdl, setIdl } from "./idlStore";
import { defaultFormValue, encodeMethod, loadIdlModel, toArgs } from "./idlForm";
import { ideaProgram } from "./idea";
import type { IdeaProgram } from "./idea";
import { SqdBusyError, sqdHead, sqdMessagesTo } from "./sqd";
import type { SqdMessage } from "./sqd";
import { ideaCodeUrl, ideaProgramUrl, parseVaraInput, subscanAccount, subscanBlock, varaWalletCall } from "./links";
import { ExplorerLinks } from "./ui/ExplorerLinks";
import { IconAction } from "./ui/IconAction";
import { CopyButton } from "../../components/ui/copy-button";
import type { ActivityItem, FormValue, Hex, IdlModel, MethodSchema, ProgramInfo } from "./model";
import { estimateGas, loadProgram, recentActivity } from "./program";
import { IDL_SOURCE_LABEL, explainRpcError, findMessage, resolveIdl } from "./case";
import type { IdlSource } from "./case";
import type { RunResultT } from "./case";
import { useVaraWallet } from "./wallet";
import { Field, HexChip, shortHex } from "./ui/HexChip";
import { IdlDrop } from "./ui/IdlDrop";
import { toNode } from "./ui/resultNode";
import { AmountInput } from "./ui/AmountInput";
import { FieldEditor, typeLabel } from "./ui/TypedForm";
import { PROGRAM_EXAMPLES, ProgramExamples, ProgramMark } from "./ui/ProgramExamples";
import { Panel, ToolHeader } from "./ui/Panel";
import { toolGroups } from "./lab/tools";
/** The other tools of this workspace. Program Interaction is its first tool, so it is on screen whenever the URL names none of them. */
const SIBLINGS = toolGroups.find((g) => g.tools.some((t) => t.id === "program"))!.tools.map((t) => t.id).filter((id) => id !== "program");
const ZERO = `0x${"00".repeat(32)}` as Hex;
const ACTIVITY_RANGES = [300, 1200, 3600] as const;

const methodKey = (m: MethodSchema) => `${m.service}.${m.name}`;
// Tab panels get a visible keyboard focus ring (the shared TabsContent removes the outline).
const PANEL = "mt-4 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

function downloadIdl(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type Outcome =
  | { kind: "run"; method: string; at: string; result: RunResultT }
  | { kind: "gas"; method: string; gas: string }
  | { kind: "sent"; method: string; block: number; index: number }
  | { kind: "error"; method: string; message: string };

// Same viewer settings as the EVM function result, with the first level open.
const VIEWER_OPTIONS = { collapse: { root: false, depth: 3, arrayItems: 12, objectKeys: 12 }, previewItems: 4 };

function ValueResult({ title, node, heading = "Decoded value" }: { title: string; node: ComplexValueNode; heading?: string }) {
  return (
    <CopyableResult title={title} tone="success" copyText={serializeNode(node)}>
      <ComplexValueViewer node={node} showControls heading={heading} options={VIEWER_OPTIONS} />
    </CopyableResult>
  );
}

function ResultCard({ outcome, method, sails, onOpenTrace }: { outcome: Outcome; method: MethodSchema | null; sails: SailsIdl | null; onOpenTrace: (id: string) => void }) {
  if (outcome.kind === "error") return <CopyableResult title="Error" tone="error" plainText={outcome.message} />;
  if (outcome.kind === "gas") return <CopyableResult title="Minimum gas" plainText={outcome.gas} />;
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
  if (r.error) return <CopyableResult title="Error" tone="error" plainText={r.error} />;
  const reply = r.reply;
  let body: React.ReactNode = <p className="text-sm text-muted-foreground">No reply</p>;
  if (reply) {
    if (!reply.success) {
      body = <CopyableResult title="Reply error" tone="error" plainText={utf8(reply.payload) ?? reply.payload} />;
    } else if (reply.payload === "0x") {
      body = <CopyableResult title="Result" tone="success" plainText="Empty reply" />;
    } else if (sails && method) {
      try {
        const kind = method.kind === "query" ? "queries" : "functions";
        const value = sails.services[method.service][kind][method.name].decodeResult<unknown>(reply.payload);
        body = <ValueResult title={`Result (${typeLabel(method.returns)})`} node={toNode(method.returns, value, method.name)} />;
      } catch (err) {
        body = <CopyableResult title={`Raw reply (${err instanceof Error ? err.message : String(err)})`} plainText={reply.payload} />;
      }
    } else {
      body = <CopyableResult title="Raw reply" plainText={reply.payload} />;
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {reply && <Badge variant={reply.success ? "success" : "error"}>{reply.success ? "Success" : "Error"}</Badge>}
        {reply && <code className="break-all font-mono text-xs text-muted-foreground">{reply.code}</code>}
        {r.block && <span className="font-mono text-xs text-muted-foreground">at #{r.block.number} · spec {r.specVersion}</span>}
      </div>
      {body}
    </div>
  );
}

type DecodeAs = "call" | "reply" | "event";

/** Decodes any Sails payload with the loaded IDL; the method or event comes from the payload's route. */
function decodeRaw(text: string, as: DecodeAs, sails: SailsIdl, model: IdlModel, methods: MethodSchema[]) {
  const hex = text.trim();
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) return { payload: null, method: null, route: null, node: null, error: "Enter the payload as 0x-prefixed hex bytes" };
  const payload = hex.toLowerCase() as Hex;
  if (as === "event") {
    const d = decodeEvent(payload, sails);
    const schema = model.services.find((s) => s.name === d.service)?.events.find((e) => e.name === d.name)?.schema;
    const label = `${d.service}.${d.name}`;
    const node = d.error ? null : schema ? toNode(schema, d.value, label) : { label, type: "event", value: "no data" };
    return { payload, method: null, route: d.service ? label : null, node, error: d.error };
  }
  const route = decodeCall(payload, as === "call" ? sails : null);
  const method = methods.find((m) => m.service === route.service && m.name === route.name) ?? null;
  const name = route.service ? `${route.service}.${route.name}` : null;
  if (route.error) return { payload, method, route: name, node: null, error: route.error };
  if (!method) return { payload, method, route: name, node: null, error: `${name} is not in this program's IDL` };
  if (as === "call") return { payload, method, route: name, node: toNode({ kind: "struct", name: method.kind, tuple: false, fields: method.params }, route.value, name ?? method.name), error: null };
  const reply = decodeReply(payload, route, sails);
  return { payload, method, route: name, node: reply.error ? null : toNode(method.returns, reply.value, method.name), error: reply.error };
}

function Activity({ programId, sails, onOpenTrace }: { programId: Hex; sails: SailsIdl | null; onOpenTrace: (id: string, msg?: number) => void }) {
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
        {items
          ? <IconAction variant="outline" size="icon" label="Rescan" loading={!!progress} onClick={() => void scan()}>{!progress && <ArrowClockwise size={16} />}</IconAction>
          : <Button variant="outline" loading={!!progress} onClick={() => void scan()}>Scan activity</Button>}
        {progress && <IconAction size="icon" label="Stop scanning" onClick={() => abort.current?.abort()}><Stop size={16} weight="fill" /></IconAction>}
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
        <ul className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70">
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

const DAY_BLOCKS = 28_800; // ~1 day at 3 s blocks

type IndexedMessage = { id: Hex; block: number; hash: Hex };

function History({ programId, createdBlock, onOpen }: { programId: Hex; createdBlock: number | null; onOpen: (m: IndexedMessage) => Promise<string | null> }) {
  const [items, setItems] = useState<SqdMessage[] | null>(null);
  const [head, setHead] = useState<number | null | undefined>(undefined);
  // Lowest block scanned so far; older days load below it.
  const [lowest, setLowest] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const floor = createdBlock ?? 0;

  async function loadDay(to: number, fresh: boolean) {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const from = Math.max(floor, to - DAY_BLOCKS + 1);
    setLoading(true);
    setError("");
    try {
      const found = await sqdMessagesTo(programId, from, to, ctl.signal);
      if (ctl.signal.aborted) return;
      setItems((cur) => (fresh ? found : [...(cur ?? []), ...found]));
      setLowest(from);
    } catch (err) {
      if (!ctl.signal.aborted) setError(err instanceof SqdBusyError ? "SQD Portal is busy. Try again in a moment." : "Unable to load history from SQD Portal. Check your connection and try again.");
    } finally {
      if (abort.current === ctl) setLoading(false);
    }
  }

  async function start() {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setItems(null);
    setLowest(null);
    setHead(undefined);
    setError("");
    const h = await sqdHead(ctl.signal);
    if (ctl.signal.aborted) return;
    setHead(h);
    if (h === null) setError("SQD Portal did not answer. Check your connection and try again.");
    // A program newer than the indexed head has nothing there yet; Live covers it.
    else if (h >= floor) void loadDay(h, true);
  }

  useEffect(() => {
    void start();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const notYet = typeof head === "number" && head < floor;
  const done = lowest !== null && lowest <= floor;
  return (
    <div className="space-y-3">
      <p className="max-w-prose text-xs text-muted-foreground">
        {head === undefined ? "Checking SQD Portal…" : head === null ? null : notYet
          ? `SQD Portal has indexed the chain up to block ${head.toLocaleString()}, before this program was created at block ${floor.toLocaleString()}. Its messages appear under Live.`
          : `From SQD Portal, which has indexed the chain up to block ${head.toLocaleString()} (it updates in batches, usually 15+ hours behind). Live scans only the latest blocks, so messages from the hours in between are in neither list.`}
        {head && lowest !== null && items ? ` ${items.length.toLocaleString()} ${items.length === 1 ? "message" : "messages"} in blocks ${lowest.toLocaleString()}–${head.toLocaleString()}.` : ""}
      </p>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-400">
          {error}
          <Button variant="outline" size="sm" loading={loading} onClick={() => void (typeof head === "number" ? loadDay(lowest === null ? head : lowest - 1, lowest === null) : start())}>Try again</Button>
        </div>
      )}
      {openError && <p role="alert" className="text-sm text-red-400">{openError}</p>}
      {items === null && !error && head !== null && !notYet && <Skeleton className="h-40 w-full rounded-lg" />}
      {items && items.length === 0 && !loading && <p className="text-sm text-muted-foreground">No messages to this program in these blocks.</p>}
      {items && items.length > 0 && (
        <ul className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" disabled={opening !== null}
                onClick={async () => { setOpening(m.id); setOpenError(""); const err = await onOpen(m); setOpening(null); if (err) setOpenError(err); }}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-3 text-left transition-colors hover:bg-foreground/5 disabled:opacity-60 sm:grid-cols-[7.5rem_1fr_9rem_auto] sm:px-4">
                <span className="font-mono text-xs text-muted-foreground sm:text-sm">#{m.block}</span>
                <span className="col-span-2 row-start-2 min-w-0 truncate font-mono text-xs sm:col-span-1 sm:row-start-auto">{shortHex(m.id, 6, 4)}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{new Date(m.timestamp).toLocaleString()}</span>
                <span className="col-start-2 row-start-1 inline-flex items-center gap-1.5 sm:col-start-auto sm:row-start-auto">
                  {opening === m.id && <span className="text-xs text-muted-foreground">Opening…</span>}
                  <Badge variant="outline">{m.entry}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {items && !done && (
        <Button variant="outline" size="sm" loading={loading} onClick={() => lowest !== null && void loadDay(lowest - 1, false)}>Load the day before</Button>
      )}
      {done && <p className="text-xs text-muted-foreground">{createdBlock !== null ? "Reached the block where this program was created." : "Reached the first block of the chain."}</p>}
    </div>
  );
}

export default function ProgramTool() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { account } = useVaraWallet();
  const [input, setInput] = useState(() => params.get("program") ?? "");
  const [programId, setProgramId] = useState<Hex | null>(null);
  const [info, setInfo] = useState<ProgramInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [idl, setIdlState] = useState<{ sails: SailsIdl; model: IdlModel; text: string; source: IdlSource } | null>(null);
  const [ideaInfo, setIdeaInfo] = useState<IdeaProgram | null>(null);
  const [idlError, setIdlError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, FormValue[]>>({});
  const origin = params.get("origin") ?? "";
  const setOrigin = (value: string) => setParams((p) => { p.set("origin", value); return p; }, { replace: true });
  const block = params.get("block") ?? "latest";
  const setBlock = (value: string) => setParams((p) => { p.set("block", value); return p; }, { replace: true });
  const value = params.get("value") ?? "0";
  const setValue = (value: string) => setParams((p) => { p.set("value", value); return p; }, { replace: true });
  const gas = params.get("gas") === "0" ? "" : params.get("gas") ?? "";
  const setGas = (value: string) => setParams((p) => { p.set("gas", value); return p; }, { replace: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tab, setTab] = useState("methods");
  const [mode, setMode] = useState<FunctionMode>("function");
  const [rawText, setRawText] = useState("");
  const [decodeAs, setDecodeAs] = useState<DecodeAs>("call");
  const [activitySource, setActivitySource] = useState<"live" | "history">("live");
  const alive = useRef(true);
  const loadSeq = useRef(0);
  /** A URL write that arrived while the tool was hidden; replayed when the tool is shown again. */
  const skippedWrite = useRef<((p: URLSearchParams) => void) | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** Rewrites the query through the live URL and keeps the hash. The tool stays mounted while hidden, so after an await the render's params are stale. A write that arrives while another tool is on screen is kept and replayed when this one is shown again. */
  function writeUrl(update: (p: URLSearchParams) => void) {
    const live = new URL(window.location.href);
    skippedWrite.current = null;
    if (live.pathname !== "/vara/transactions" || SIBLINGS.includes(live.searchParams.get("tool") ?? "")) { skippedWrite.current = update; return; }
    update(live.searchParams);
    navigate({ pathname: live.pathname, search: live.search, hash: live.hash }, { replace: true });
  }

  const accountHex = useMemo(() => {
    if (!account) return null;
    try { return toHexAccount(account.address); } catch { return null; }
  }, [account]);

  const methods = useMemo(() => idl?.model.services.flatMap((s) => s.methods) ?? [], [idl]);
  const method = methods.find((m) => methodKey(m) === selected) ?? null;
  const values = method ? forms[methodKey(method)] ?? method.params.map((p) => defaultFormValue(p.schema)) : [];
  const queries = methods.filter((m) => m.kind === "query");
  const functions = methods.filter((m) => m.kind === "function");
  const reading = method ? method.kind === "query" : queries.length > 0;
  // ponytail: Radix typeahead stands in for search; add a filter input if a program passes ~30 methods per kind.
  const groups = (idl?.model.services ?? [])
    .map((s) => ({ service: s.name, methods: s.methods.filter((m) => (m.kind === "query") === reading) }))
    .filter((g) => g.methods.length > 0);
  const raw = useMemo(
    () => (mode === "raw" && idl && rawText.trim() ? decodeRaw(rawText, decodeAs, idl.sails, idl.model, methods) : null),
    [mode, idl, rawText, decodeAs, methods],
  );

  // What the action row works on: the form's encoded call, or a pasted call payload.
  let target: { key: string; method: MethodSchema | null; payload: Hex | null; error: string | null } = { key: "", method: null, payload: null, error: null };
  if (mode === "raw") {
    target = { key: `raw:${decodeAs}:${raw?.payload ?? ""}`, method: raw?.method ?? null, payload: decodeAs === "call" ? raw?.payload ?? null : null, error: raw?.error ?? null };
  } else if (method && idl) {
    try {
      const payload = encodeMethod(idl.sails, method, values);
      target = { key: `${methodKey(method)}:${payload}`, method, payload, error: null };
    } catch (err) {
      target = { key: `${methodKey(method)}:`, method, payload: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const wasActive = useRef(false);
  useEffect(() => {
    if (location.pathname !== "/vara/transactions" || (params.get("tool") ?? "program") !== "program") { wasActive.current = false; return; }
    if (!wasActive.current) {
      wasActive.current = true;
      const incoming = params.get("payload");
      if (incoming && incoming !== target.payload) { setRawText(incoming); setMode("raw"); return; }
    }
    if (!target.payload || params.get("payload") === target.payload) return;
    setParams((p) => { p.set("payload", target.payload!); return p; }, { replace: true });
  }, [location.pathname, target.payload, params, setParams]);

  function pickKind(kind: FunctionKind) {
    if (method && (method.kind === "query") === (kind === "read")) return;
    const next = (kind === "read" ? queries : functions)[0];
    if (next) { setSelected(methodKey(next)); setOutcome(null); }
  }

  async function applyIdl(id: Hex, text: string | null, source: IdlSource = "local") {
    setIdlError("");
    if (!text) { setIdlState(null); return; }
    try {
      const loaded = await loadIdlModel(text);
      if (!alive.current) return;
      setIdlState({ ...loaded, text, source });
      const all = loaded.model.services.flatMap((s) => s.methods);
      const first = all.find((m) => m.kind === "query") ?? all[0];
      setSelected((cur) => cur ?? (first ? methodKey(first) : null));
      // Only IDLs the user supplied are remembered; IDEA's copy is fetched again when needed.
      if (source === "local") setIdl(id, text);
    } catch (err) {
      if (alive.current) setIdlError(err instanceof Error ? err.message : String(err));
    }
  }

  async function load(raw: string) {
    const seq = ++loadSeq.current;
    skippedWrite.current = null;
    const parsed = parseVaraInput(raw, "program");
    if (!parsed || parsed.kind !== "program") { setError("Enter a program id (0x…), an SS58 address, or a Gear IDEA / Subscan link to the program"); return; }
    const id = parsed.id;
    setLoading(true);
    setError("");
    setOutcome(null);
    setSelected(null);
    setForms({});
    try {
      const [pi, named] = await Promise.all([loadProgram(id), ideaProgram(id)]);
      // A newer load (another program id) wins over this one.
      if (!alive.current || seq !== loadSeq.current) return;
      handledProgram.current = id;
      setProgramId(id);
      setInfo(pi);
      setIdeaInfo(named);
      writeUrl((p) => { p.set("program", id); });
      const local = getIdl(id);
      if (local) await applyIdl(id, local, "local");
      else {
        // Zero setup: use the IDL the developer published on Gear IDEA, when there is one.
        const resolved = await resolveIdl(id, pi.codeId);
        if (seq !== loadSeq.current) return;
        await applyIdl(id, resolved?.text ?? null, resolved?.source ?? "local");
      }
    } catch (err) {
      if (alive.current && seq === loadSeq.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Only the newest load clears the spinner.
      if (alive.current && seq === loadSeq.current) setLoading(false);
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

  // Replays a write that was skipped while the tool was hidden.
  const shownTool = params.get("tool");
  useEffect(() => {
    if (skippedWrite.current) writeUrl(skippedWrite.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, shownTool]);

  function openTrace(id: string, msg = 0) {
    const next = new URLSearchParams(params);
    next.set("tool", "message"); next.set("id", id); next.set("msg", String(msg)); next.set("tab", "trace");
    navigate(`/vara/transactions?${next}`);
  }

  /** Opens an indexed message: the indexer gives its block, the chain gives the extrinsic and message index. */
  async function openIndexed(m: IndexedMessage): Promise<string | null> {
    try {
      const hit = await findMessage(m.id, { block: m.block, hash: m.hash });
      if (!hit) return `Message ${shortHex(m.id)} was not found in block ${m.block}.`;
      openTrace(`${hit.block}-${hit.index}`, hit.messageIndex);
      return null;
    } catch (err) {
      return explainRpcError(err, m.block);
    }
  }

  function originHex(): Hex {
    const v = origin.trim();
    if (!v) return accountHex ?? ZERO;
    return toHexAccount(v);
  }

  async function act(kind: "run" | "gas" | "send") {
    if (!idl || !programId) return;
    const { key, payload, method: m } = target;
    if (!payload) { setOutcome({ kind: "error", method: key, message: target.error ?? "Enter a call payload to run" }); return; }
    setBusy(kind);
    setOutcome(null);
    try {
      const from = originHex();
      const val = m?.kind === "query" ? "0" : value;
      if (!/^\d+$/.test(val)) throw new Error("Enter a valid VARA amount");
      if (kind === "gas") {
        const g = await estimateGas(from, programId, payload, BigInt(val));
        if (!alive.current) return;
        setGas(g);
        setOutcome({ kind: "gas", method: key, gas: g });
      } else if (kind === "send") {
        if (!account || !accountHex) throw new Error("Connect a Vara wallet first");
        const gasLimit = gas.trim() || (await estimateGas(accountHex, programId, payload, BigInt(val)));
        const input = parseInput({ block: "latest", origin: accountHex, payload, value: val, gasLimit });
        const res = await sendMessage(account, programId, input, () => {});
        if (!alive.current) return;
        setOutcome({ kind: "sent", method: key, ...res });
      } else {
        // gasLimit 0 lets calculateReply use the block gas limit.
        const input = parseInput({ block, origin: from, payload, value: val, gasLimit: gas.trim() || "0" });
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

  const idlFileName = `${(ideaInfo?.name ?? programId ?? "program").replace(/[^\w.-]+/g, "-")}.idl`;
  let walletCommand = "";
  let walletError = "";
  if (method && programId) {
    try {
      walletCommand = varaWalletCall({ programId, service: method.service, method: method.name, args: toArgs(method, values), value: method.kind === "function" ? value : undefined, idlFile: idlFileName });
    } catch (err) {
      walletError = err instanceof Error ? err.message : String(err);
    }
  }

  const signature = method ? `(${method.params.map((p) => `${p.name}: ${typeLabel(p.schema)}`).join(", ")}) -> ${typeLabel(method.returns)}` : "";
  const example = PROGRAM_EXAMPLES.find((p) => p.id === programId);
  const showActions = mode === "function" ? !!method : decodeAs === "call";
  const canSend = mode === "raw" || !reading;

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6">
      <ToolHeader title="Program interaction" source="Vara mainnet" />

      <div className="space-y-2.5">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void load(input); }}>
          <div className="min-w-0 flex-1 basis-60 space-y-1.5">
            <label htmlFor="vara-program-id" className="block text-sm font-medium">Program id</label>
            <Input id="vara-program-id" value={input} disabled={loading || !!busy} onChange={(e) => setInput(e.target.value)} placeholder="0x… or explorer link" className="font-mono" autoComplete="off" spellCheck={false} />
          </div>
          <Button type="submit" className="max-sm:w-full" loading={loading} disabled={!!busy} icon={<MagnifyingGlass size={16} />}>{loading ? "Loading program…" : "Load program"}</Button>
        </form>
        <ProgramExamples expanded={!info && !loading} disabled={loading || !!busy} onSelect={(id) => { setInput(id); void load(id); }} />
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>

      {loading && !info && <Skeleton className="h-28 w-full rounded-lg" />}

      {info && programId && (
        <>
          <section aria-label="Program" className="min-w-0 rounded-lg border border-border/70 bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProgramMark id={programId} />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-lg font-semibold">{example ? `${example.name} · ${example.program}` : ideaInfo?.name ?? "Unnamed program"}</h2>
                    <Badge variant={info.status === "active" ? "success" : info.status === "missing" ? "outline" : "warning"}>{info.status}</Badge>
                  </div>
                  <HexChip value={programId} label="program id" />
                </div>
              </div>
              <ExplorerLinks links={[
                { label: "Gear IDEA", href: ideaProgramUrl(programId) },
                { label: "Subscan", href: subscanAccount(programId) },
              ]} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 px-4 py-2">
              {idl ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant={idl.source === "local" ? "outline" : "teal"}>{IDL_SOURCE_LABEL[idl.source]}</Badge>
                  <span>{idl.model.services.length} service{idl.model.services.length === 1 ? "" : "s"} · {methods.length} methods</span>
                  <span className="inline-flex">
                    <IconAction label="Download IDL" onClick={() => downloadIdl(idl.text, idlFileName)}><DownloadSimple size={16} /></IconAction>
                    <IconAction label="Replace IDL" onClick={() => { if (idl.source === "local") setIdl(programId, null); setIdlState(null); setSelected(null); setOutcome(null); }}><ArrowsClockwise size={16} /></IconAction>
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" role={loading ? "status" : undefined}>{loading ? "Loading interface…" : "No interface loaded"}</p>
              )}
              <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Open this program in another tool">
                {([["simulator", "Simulate message", Play], ["resources", "Gas & vouchers", GasPump], ["events", "Inspect events", Lightning]] as const).map(([tool, label, Icon]) => <Button key={tool} size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => {
                  try {
                    const payload = idl && method ? encodeMethod(idl.sails, method, values) : "0x";
                    navigate(`/vara/${tool === "events" ? "program-tools" : "transactions"}?${new URLSearchParams({ tool, program: programId, origin: origin || accountHex || "", payload, value, gas: gas || "0", block })}`);
                  } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
                }}><Icon size={14} />{label}</Button>)}
              </div>
            </div>

            {!idl && !loading && (
              <div className="space-y-2 border-t border-border/60 p-4">
                <p className="text-xs text-muted-foreground">No interface is available from Gear IDEA. Open an IDL file to call methods; it stays in this browser.</p>
                <IdlDrop onText={(text) => void applyIdl(programId, text)} />
              </div>
            )}
            {idlError && <p role="alert" className="border-t border-border/60 px-4 py-2 text-sm text-red-400">{idlError}</p>}

            <details className="border-t border-border/60 px-4">
            <summary className="min-h-10 cursor-pointer content-center text-xs text-muted-foreground hover:text-foreground">Program details</summary>
            <dl className="grid gap-4 pb-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Balance"><span className="font-mono">{formatVara(info.balance)}</span></Field>
              <Field label="Code id">
                {info.codeId ? <span className="inline-flex flex-wrap items-center gap-1"><HexChip value={info.codeId} label="code id" /><ExplorerLinks links={[{ label: "IDEA", href: ideaCodeUrl(info.codeId), title: "Open the code in Gear IDEA" }]} /></span> : "—"}
              </Field>
              <Field label="Owner">
                {ideaInfo?.owner ? <span className="inline-flex flex-wrap items-center gap-1"><HexChip value={ideaInfo.owner} label="owner" /><ExplorerLinks links={[{ label: "Subscan", href: subscanAccount(ideaInfo.owner), title: "Open the owner in Subscan" }]} /></span> : <span className="text-muted-foreground">Not recorded</span>}
              </Field>
              <Field label="Created">
                {ideaInfo ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="font-mono">#{ideaInfo.createdBlock}</span>
                    <ExplorerLinks links={[{ label: "Subscan", href: subscanBlock(ideaInfo.createdBlock), title: "Open the creation block in Subscan" }]} />
                    <span className="text-xs text-muted-foreground">{new Date(ideaInfo.createdAt).toLocaleDateString()}</span>
                  </span>
                ) : <span className="text-muted-foreground">Unknown</span>}
              </Field>
            </dl>
            <p className="pb-3 text-xs text-muted-foreground">{example ? "Project name from the curated examples; owner and creation from Gear IDEA." : "Name, owner and creation from the Gear IDEA indexer."} Status and balance read live from the chain.</p>
            </details>
          </section>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Program views">
              <TabsTrigger value="methods">Methods</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="methods" className={PANEL}>
              {!idl ? (
                <p className="text-sm text-muted-foreground">Load an IDL to call this program's methods.</p>
              ) : (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <Panel title="Call" footer={showActions && <>
                    <Button loading={busy === "run"} disabled={loading || (!!busy && busy !== "run")}
                      icon={busy !== "run" ? <AnimatedPlayIcon width={16} height={16} /> : undefined} onClick={() => void act("run")}>
                      {busy === "run" ? "Running…" : mode === "function" && reading ? "Run query" : "Simulate call"}
                    </Button>
                    {canSend && (
                      <>
                        <Button variant="outline" loading={busy === "gas"} disabled={loading || (!!busy && busy !== "gas")} onClick={() => void act("gas")}>Estimate gas</Button>
                        <Button variant="outline" loading={busy === "send"} disabled={loading || !account || (!!busy && busy !== "send")} onClick={() => void act("send")}>Send transaction</Button>
                      </>
                    )}
                    {(outcome || busy) && <a href="#vara-program-result" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 lg:hidden">View call result</a>}
                    {canSend && (
                      <p className="basis-full text-xs text-muted-foreground">{account ? `Send transaction submits a real Vara mainnet transaction from ${account.name ?? shortHex(account.address)}.` : "Connect a Vara wallet (top right) to send."}</p>
                    )}
                  </>}>
                    <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(m) => { if (m) { setMode(m as FunctionMode); setOutcome(null); } }} aria-label="Call input mode">
                      <ToggleGroupItem value="function">Typed inputs</ToggleGroupItem>
                      <ToggleGroupItem value="raw">Raw payload</ToggleGroupItem>
                    </ToggleGroup>

                    {mode === "function" ? (
                        <FunctionTypeTabs value={method ? (method.kind === "query" ? "read" : "write") : null} onChange={pickKind}
                          readCount={queries.length} writeCount={functions.length}>
                        <div className="space-y-1.5">
                          <label htmlFor="vara-function" className="block text-xs text-muted-foreground">Select function</label>
                          <Select value={selected ?? undefined} onValueChange={(k) => { setSelected(k); setOutcome(null); }}>
                            <SelectTrigger id="vara-function" className="w-full font-mono text-xs"><SelectValue placeholder="Choose function…" /></SelectTrigger>
                            <SelectContent>
                              {groups.map((g) => (
                                <SelectGroup key={g.service}>
                                  {groups.length > 1 && <SelectLabel>{g.service}</SelectLabel>}
                                  {g.methods.map((m) => (
                                    <SelectItem key={methodKey(m)} value={methodKey(m)} className="font-mono text-xs">{m.name}({m.params.map((p) => typeLabel(p.schema)).join(", ")})</SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {method && (
                          <>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="break-all text-base font-semibold">{method.service}.{method.name}</h3>
                                <Badge variant="outline">{method.kind === "query" ? "query" : "function"}</Badge>
                              </div>
                              <code className="block break-all font-mono text-xs text-muted-foreground">{signature}</code>
                              {method.docs && <p className="max-w-prose text-sm text-muted-foreground">{method.docs}</p>}
                            </div>
                            <section aria-labelledby="vara-params-title" className="space-y-4 border-t border-border/60 pt-4">
                              <h4 id="vara-params-title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Parameters</h4>
                              {method.params.length > 0 ? method.params.map((p, i) => (
                                <FieldEditor key={`${methodKey(method)}.${p.name}`} schema={p.schema} value={values[i]} label={p.name} path={`${method.name}.${p.name}`}
                                  disabled={!!busy}
                                  onChange={(v) => setForms((f) => { const next = [...(f[methodKey(method)] ?? values)]; next[i] = v; return { ...f, [methodKey(method)]: next }; })} />
                              )) : <p className="text-sm text-muted-foreground">No arguments.</p>}
                            </section>
                          </>
                        )}
                        </FunctionTypeTabs>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label htmlFor="vara-raw-payload" className="block text-xs text-muted-foreground">Payload (hex)</label>
                          <Textarea id="vara-raw-payload" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="0x…" disabled={!!busy}
                            className="min-h-24 font-mono text-xs" autoComplete="off" spellCheck={false} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span id="vara-decode-as" className="text-xs text-muted-foreground">Decode as</span>
                          <ToggleGroup type="single" variant="outline" size="sm" value={decodeAs} onValueChange={(v) => { if (v) setDecodeAs(v as DecodeAs); }} aria-labelledby="vara-decode-as">
                            <ToggleGroupItem value="call">Call</ToggleGroupItem>
                            <ToggleGroupItem value="reply">Reply</ToggleGroupItem>
                            <ToggleGroupItem value="event">Event</ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                        <p className="text-xs text-muted-foreground">Paste a message, reply or event payload from Subscan, Gear IDEA or a case file. A call payload can also be dry-run or sent below.</p>
                      </div>
                    )}

                    {showActions && (
                        <details className="border-t border-border/60 pt-3">
                          <summary className="min-h-8 cursor-pointer select-none content-center text-sm">Execution settings <span className="text-xs text-muted-foreground">· block {block || "latest"}{origin.trim() ? " · custom origin" : ""}</span></summary>
                          <div className="grid gap-3 pt-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label htmlFor="vara-origin" className="block text-xs text-muted-foreground">Origin (empty = {account ? "connected wallet" : "zero address"})</label>
                              <Input id="vara-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={accountHex ?? ZERO} className="font-mono" autoComplete="off" spellCheck={false} />
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="vara-block" className="block text-xs text-muted-foreground">Block for dry runs</label>
                              <Input id="vara-block" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="latest" className="font-mono" inputMode="numeric" autoComplete="off" />
                            </div>
                            {!reading || mode === "raw" ? (
                              <>
                                <AmountInput value={value} onChange={setValue} disabled={!!busy} />
                                <div className="space-y-1.5">
                                  <label htmlFor="vara-gas" className="block text-xs text-muted-foreground">Gas limit (empty = estimate)</label>
                                  <Input id="vara-gas" value={gas} onChange={(e) => setGas(e.target.value)} placeholder="estimate" className="font-mono" inputMode="numeric" autoComplete="off" />
                                </div>
                              </>
                            ) : null}
                          </div>
                        </details>
                    )}
                  </Panel>

                  <Panel id="vara-program-result" aria-live="polite" title="Call result" className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                    {outcome && outcome.method === target.key && (
                      <ResultCard outcome={outcome} method={target.method} sails={idl.sails} onOpenTrace={openTrace} />
                    )}
                    {!outcome && <p className="text-xs text-muted-foreground">{busy ? "Running your call…" : "Run a query or dry run to inspect the reply here."}</p>}
                    {mode === "function" ? method && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Encoded payload</p>
                        {target.payload ? (
                          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2.5">
                            <code data-testid="vara-encoded-payload" className="min-w-0 flex-1 break-all font-mono text-xs text-green-400">{target.payload}</code>
                            <CopyButton variant="ghost" size="icon-sm" value={target.payload} ariaLabel="Copy encoded payload" />
                          </div>
                        ) : <p className="text-xs text-muted-foreground">{forms[methodKey(method)] ? <>Fill the parameters to encode the payload: {target.error}</> : "Fill in the parameters to see the encoded payload."}</p>}
                      </div>
                    ) : raw && (
                      raw.node
                        ? <ValueResult title={`Decoded ${decodeAs} · ${raw.route}`} node={raw.node} heading={decodeAs === "call" ? "Decoded parameters" : "Decoded value"} />
                        : <CopyableResult title="Unable to decode" tone="error" plainText={raw.error ?? ""} />
                    )}


                    {mode === "function" && method && (
                      <details className="border-t border-border/60 pt-3">
                        <summary className="min-h-8 cursor-pointer select-none content-center text-sm"><Terminal size={14} className="mr-1.5 inline align-[-2px] text-muted-foreground" aria-hidden />Run from the terminal with vara-wallet</summary>
                        <div className="space-y-2 pt-2">
                          {walletError ? <p className="text-xs text-muted-foreground">Fill the form to build the command: {walletError}</p> : (
                            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2.5">
                              <code data-testid="vara-wallet-command" className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs">{walletCommand}</code>
                              <CopyButton variant="ghost" size="icon-sm" value={walletCommand} ariaLabel="Copy vara-wallet command" />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Gear's vara-wallet CLI needs the IDL as a file: <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => downloadIdl(idl.text, idlFileName)}>download {idlFileName}</button> next to where you run it.
                          </p>
                        </div>
                      </details>
                    )}
                  </Panel>
                </div>
              )}
            </TabsContent>
            <TabsContent value="activity" className={PANEL}>
              <div className="space-y-4">
                <ToggleGroup type="single" variant="outline" size="sm" value={activitySource} onValueChange={(v) => { if (v) setActivitySource(v as "live" | "history"); }} aria-label="Activity source">
                  <ToggleGroupItem value="live">Live (chain)</ToggleGroupItem>
                  <ToggleGroupItem value="history">History (SQD Portal)</ToggleGroupItem>
                </ToggleGroup>
                {activitySource === "live"
                  ? <Activity programId={programId} sails={idl?.sails ?? null} onOpenTrace={openTrace} />
                  : <History programId={programId} createdBlock={ideaInfo?.createdBlock ?? null} onOpen={openIndexed} />}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
