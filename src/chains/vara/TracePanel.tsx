import { useEffect, useRef, useState } from "react";
import { ArrowRight, GitBranch } from "@phosphor-icons/react";
import type { Sails } from "sails-js";
import AnimatedProgressBar from "../../components/smoothui/ui/AnimatedProgressBar";
import AnimatedTooltip from "../../components/smoothui/ui/AnimatedTooltip";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { StepStatusIcon } from "../../components/ui/step-status-icon";
import type { StepVisualStatus } from "../../components/ui/step-status-icon";
import { cn } from "../../lib/utils";
import type { VaraCase } from "./case";
import { decodeCall, decodeEvent, decodeReply, loadIdl } from "./decode";
import { getIdl } from "./idlStore";
import type { Decoded } from "./decode";
import type { Hex, Trace, TraceNode, TraceStep } from "./model";
import { traceMessage } from "./trace";
import { Field, HexChip, shortHex } from "./ui/HexChip";
import { ValueTree } from "./ui/ValueTree";

const ZERO = `0x${"00".repeat(32)}`;
const RANGES = [20, 100, 600] as const;
const MAX_DEPTH = 4;

function utf8(hex: string): string | null {
  try {
    const bytes = new Uint8Array((hex.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

/** Human wording for gear wait/wake reasons and dispatch statuses. */
function describe(step: TraceStep): string {
  const d = parseJson(step.detail);
  const reason = typeof d === "object" && d !== null ? Object.values(d as Record<string, unknown>)[0] : d;
  switch (step.kind) {
    case "queued": return "Queued by the extrinsic";
    case "waited": return reason === "WaitUpToCalledFull" ? "Paused, waiting for replies (wait_up_to)" : reason === "WaitForCalled" || reason === "WaitCalled" ? "Paused, waiting for a reply (wait)" : `Paused (${String(reason ?? "wait")})`;
    case "woken": return reason === "WakeCalled" ? "Woken by an incoming reply" : `Woken (${String(reason ?? "wake")})`;
    case "dispatched": return `Dispatched: ${String(d)}`;
    case "read": return reason === "OutOfRent" ? "Removed from the mailbox (out of rent)" : reason === "Claimed" ? "Claimed from the mailbox" : `Mailbox: ${String(reason ?? "read")}`;
  }
}

function stepStatus(step: TraceStep): StepVisualStatus {
  if (step.kind === "dispatched") return step.detail === "Success" ? "done" : "failed";
  if (step.kind === "waited") return "active";
  return "done";
}

const KIND_LABEL: Record<TraceNode["kind"], string> = { root: "Message", reply: "Reply", event: "Event", message: "Message to actor", hidden: "Hidden call" };

function Derivation({ node, parentShort }: { node: TraceNode; parentShort: string }) {
  if (!node.derivation) return null;
  const text = node.derivation.salt === "reply" ? `reply(${parentShort})` : `outgoing(${parentShort}, ${node.derivation.nonce})`;
  const formula = node.derivation.salt === "reply"
    ? `blake2b_256("reply" ‖ parent id)`
    : `blake2b_256("outgoing" ‖ parent id ‖ u32_le(${node.derivation.nonce}))`;
  return (
    <AnimatedTooltip content={<span className="block max-w-xs text-xs">Proven link: this id equals <code className="font-mono">{formula}</code>, so the parent message produced it.</span>}>
      <span className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        <GitBranch size={12} aria-hidden /> {text}
      </span>
    </AnimatedTooltip>
  );
}

function NodePayload({ node, rootCall, sails, programId, calleeIdls }: { node: TraceNode; rootCall: Decoded; sails: Sails | null; programId: Hex; calleeIdls: Map<string, Sails> }) {
  if (!node.payload) return null;
  if (node.payload === "0x") return <p className="text-sm text-muted-foreground">Empty payload</p>;
  if (node.kind === "reply" && node.replySuccess === false) {
    const text = utf8(node.payload);
    return <pre className="whitespace-pre-wrap break-all rounded-md border border-red-500/30 bg-red-500/5 p-3 font-mono text-sm text-red-300">{text ?? node.payload}</pre>;
  }
  // The root comes from a user; any other node emitted by a different program cannot use
  // this program's IDL, but its Sails route (service.method) still decodes from the prefix.
  const foreign = node.kind !== "root" && node.source !== null && node.source.toLowerCase() !== programId.toLowerCase();
  // A callee's own event decodes with the IDL remembered for that callee, when there is one.
  const idl = foreign ? calleeIdls.get(node.source!.toLowerCase()) ?? null : sails;
  const decoded = node.kind === "reply" ? decodeReply(node.payload, rootCall, idl) : node.kind === "event" ? decodeEvent(node.payload, idl) : decodeCall(node.payload, idl);
  return (
    <div className="space-y-2">
      {decoded.service && decoded.name && <p className="text-sm">{decoded.service}.{decoded.name}</p>}
      {idl && !decoded.error && decoded.value !== null
        ? <ValueTree value={decoded.value} rootLabel={decoded.name ?? "value"} />
        : <code className="block break-all rounded-md border border-border/60 bg-background/40 p-3 font-mono text-xs">{node.payload}</code>}
      {foreign && !idl && sails && <p className="text-xs text-muted-foreground">Emitted by another program; the loaded IDL describes {shortHex(programId)}, so only the route is decoded. Load this program's IDL in its workspace to decode it.</p>}
      {decoded.error && <p className="text-xs text-muted-foreground">{decoded.error}</p>}
    </div>
  );
}

function NodeCard({ node, byParent, depth, ...ctx }: { node: TraceNode; byParent: Map<string, TraceNode[]>; depth: number; rootCall: Decoded; sails: Sails | null; programId: Hex; calleeIdls: Map<string, Sails> }) {
  // Traces are one level deep by construction; the cap guards against cycles in imported files.
  const children = depth < MAX_DEPTH ? byParent.get(node.id.toLowerCase()) ?? [] : [];
  const hidden = node.kind === "hidden";
  return (
    <li className="min-w-0">
      <div className={cn("min-w-0 space-y-3 rounded-lg border bg-card p-3 sm:p-4", hidden ? "border-dashed border-border" : "border-border/70")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={hidden ? "outline" : node.kind === "reply" ? (node.replySuccess === false ? "error" : "success") : node.kind === "event" ? "teal" : "secondary"}>
            {KIND_LABEL[node.kind]}
          </Badge>
          {node.parent && <Derivation node={node} parentShort={shortHex(node.parent, 4, 3)} />}
          {node.block !== null && <span className="font-mono text-xs text-muted-foreground">block {node.block}</span>}
        </div>
        {hidden ? (
          node.destination ? (
            <div className="space-y-2">
              <p className="text-sm">
                Call into <HexChip value={node.destination} label="callee program" /> (nonce {node.derivation?.nonce}).
              </p>
              <p className="text-xs text-muted-foreground">Destination proven by the callee's own event below, whose id derives from this call's id. The call's payload is not on-chain.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Call into another program (nonce {node.derivation?.nonce}). Its id is known, but the destination and payload never appear in on-chain events.
            </p>
          )
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Id"><HexChip value={node.id} label="message id" /></Field>
              {(node.source || node.destination) && (
                <Field label="Route">
                  <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-sm">
                    {node.source ? shortHex(node.source) : "?"} <ArrowRight size={12} aria-hidden /> {node.destination === ZERO ? "event (0x0)" : node.destination ? shortHex(node.destination) : "?"}
                  </span>
                </Field>
              )}
              {node.replyCode && <Field label="Reply code"><code className="break-all font-mono text-sm">{node.replyCode}</code></Field>}
              {node.value && node.value !== "0" && <Field label="Value"><code className="font-mono text-sm">{node.value}</code></Field>}
            </dl>
            <NodePayload node={node} {...ctx} />
          </>
        )}
        {node.kind !== "root" && node.steps.length > 0 && (
          <ul className="space-y-1.5">
            {node.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <StepStatusIcon status={stepStatus(s)} />{describe(s)} <span className="font-mono">#{s.block}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {children.length > 0 && (
        <ul className={cn("mt-3 space-y-3 border-l border-border/60", depth < 3 ? "pl-3 sm:pl-5" : "pl-2")}>
          {children.map((c) => <NodeCard key={c.id} node={c} byParent={byParent} depth={depth + 1} {...ctx} />)}
        </ul>
      )}
    </li>
  );
}

export default function TracePanel({ c, sails, trace, onTrace }: { c: VaraCase; sails: Sails | null; trace: Trace | null; onTrace: (t: Trace | null) => void }) {
  const [range, setRange] = useState<number>(RANGES[0]);
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // IDLs remembered for programs that emitted events in this trace (callees), keyed lowercase.
  const [calleeIdls, setCalleeIdls] = useState<Map<string, Sails>>(new Map());
  useEffect(() => {
    if (!trace) return;
    let cancelled = false;
    const sources = [...new Set(trace.nodes.map((n) => n.source?.toLowerCase()).filter((s): s is string => !!s && s !== trace.programId.toLowerCase()))];
    void Promise.all(sources.map(async (s) => {
      const text = getIdl(s as Hex);
      if (!text) return null;
      try { return [s, await loadIdl(text)] as const; } catch { return null; }
    })).then((loaded) => {
      if (!cancelled) setCalleeIdls(new Map(loaded.filter((e): e is readonly [string, Sails] => e !== null)));
    });
    return () => { cancelled = true; };
  }, [trace]);

  const message = c.message;
  if (!message) return <p className="text-sm text-muted-foreground">This extrinsic queued no message, so there is nothing to trace.</p>;

  async function run(maxBlocks: number) {
    if (!message) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError("");
    setProgress({ scanned: 0, total: maxBlocks + 1 });
    try {
      const t = await traceMessage({ id: message.id, programId: message.programId, block: c.block.number }, { maxBlocks, maxNonce: 32 },
        (scanned, total) => { if (!ctl.signal.aborted) setProgress({ scanned, total }); }, ctl.signal);
      // Stop returns the partial trace; only a newer run supersedes it.
      if (abort.current === ctl) onTrace(t);
    } catch (err) {
      if (!ctl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abort.current === ctl) { abort.current = null; setProgress(null); }
    }
  }

  const traced = trace?.nodes.find((n) => n.kind === "root");
  const root = traced ? { ...traced, source: traced.source ?? c.call.signer, payload: traced.payload ?? c.call.payload } : undefined;
  const byParent = new Map<string, TraceNode[]>();
  // Keys are lowercased: imported case files may mix hex case.
  trace?.nodes.forEach((n) => { if (n.parent) { const k = n.parent.toLowerCase(); byParent.set(k, [...(byParent.get(k) ?? []), n]); } });
  // Chronological: outgoing messages in nonce order, the reply last.
  const order = (n: TraceNode) => (n.derivation?.salt === "reply" ? Number.MAX_SAFE_INTEGER : n.derivation?.nonce ?? 0);
  byParent.forEach((list) => list.sort((a, b) => order(a) - order(b)));
  const proven = trace ? trace.nodes.filter((n) => n.kind !== "root" && n.kind !== "hidden").length : 0;
  // Hidden calls made by the traced message itself (grandchild calls belong to callees).
  const rootHidden = trace ? trace.nodes.filter((n) => n.kind === "hidden" && n.parent?.toLowerCase() === trace.root.toLowerCase()).length : 0;
  const provenCallees = trace ? trace.nodes.filter((n) => n.kind === "hidden" && n.destination).length : 0;
  const rootCall = c.call.payload ? decodeCall(c.call.payload, sails) : { service: null, name: null, value: null, error: null };
  const pct = progress ? Math.round((progress.scanned / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="vara-trace-range" className="block text-xs text-muted-foreground">Scan window</label>
          <Select value={String(range)} onValueChange={(v) => setRange(Number(v))} disabled={!!progress}>
            <SelectTrigger id="vara-trace-range" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r} value={String(r)}>{r} blocks (~{Math.round((r * 3) / 60) || 1} min)</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" loading={!!progress} onClick={() => void run(range)}>{trace ? "Re-trace" : "Trace message"}</Button>
        {progress && <Button variant="ghost" onClick={() => abort.current?.abort()}>Stop</Button>}
      </div>

      {progress && (
        <div className="max-w-md space-y-1">
          <AnimatedProgressBar value={pct} color="var(--foreground)" />
          <p className="font-mono text-xs text-muted-foreground">Scanned {progress.scanned} / {progress.total} blocks from #{c.block.number}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {!trace && !progress && !error && (
        <p className="max-w-prose text-sm text-muted-foreground">
          Follows message <span className="font-mono">{shortHex(message.id)}</span> forward from block {c.block.number}. Every child is matched by its derived id, so each link shown is proven rather than guessed.
        </p>
      )}

      {trace && root && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={trace.complete ? "success" : "warning"}>{trace.complete ? "Complete" : "Incomplete"}</Badge>
            <Badge variant="outline">{proven} proven link{proven === 1 ? "" : "s"}</Badge>
            {rootHidden > 0 && <Badge variant="outline">{rootHidden} hidden call{rootHidden === 1 ? "" : "s"}</Badge>}
            {provenCallees > 0 && <Badge variant="teal">{provenCallees} callee{provenCallees === 1 ? "" : "s"} proven</Badge>}
            <span className="font-mono text-xs text-muted-foreground">blocks {trace.fromBlock}–{trace.toBlock}</span>
          </div>
          {!trace.complete && (
            <p className="max-w-prose text-sm text-muted-foreground">
              The message had not finished by block {trace.toBlock}. Widen the scan window to keep following it.
            </p>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Lifecycle</h3>
            {(() => {
              const pauses = root.steps.filter((s) => s.kind === "waited").length;
              if (pauses === 0) return null;
              return (
                <p className="max-w-prose text-sm text-muted-foreground">
                  {pauses === rootHidden
                    ? `Paused ${pauses} time${pauses === 1 ? "" : "s"}, once per hidden call: the program called another program and waited for its reply before continuing.`
                    : `Paused ${pauses} time${pauses === 1 ? "" : "s"} waiting for replies from other programs.`}
                </p>
              );
            })()}
            <ol className="relative space-y-3 border-l border-border/60 pl-4">
              {root.steps.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="-ml-[26px] flex h-5 w-5 items-center justify-center rounded-full bg-background"><StepStatusIcon status={stepStatus(s)} /></span>
                  <span>{describe(s)}</span>
                  <span className="font-mono text-xs text-muted-foreground">#{s.block}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Causal tree</h3>
            <ul className="space-y-3">
              <NodeCard node={root} byParent={byParent} depth={0} rootCall={rootCall} sails={sails} programId={trace.programId} calleeIdls={calleeIdls} />
            </ul>
          </section>

          {trace.stateChanges.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Programs whose state changed</h3>
              <ul className="space-y-1.5">
                {trace.stateChanges.map((s) => (
                  <li key={s.block} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">#{s.block}</span>
                    {s.programs.map((p) => <HexChip key={p} value={p} label="program" />)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
