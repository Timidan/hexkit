import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/utils";
import { decodeCall, decodeEvent } from "../decode";
import type { Hex, Trace, TraceNode } from "../model";
import { shortHex } from "./HexChip";

const UNKNOWN = "unknown";
const EVENTS = "events";

type Lane = { key: string; title: string; subtitle: string };
type Step = {
  from: string;
  to: string;
  label: string;
  note?: string;
  tone: "message" | "call" | "unproven" | "event" | "reply-ok" | "reply-err";
  /** The root program suspended here (MessageWaited) until the call's reply woke it. */
  pauses?: boolean;
};

const lower = (h: string | null | undefined) => (h ?? "").toLowerCase();

function route(payload: Hex | null, kind: "event" | "call"): string | null {
  if (!payload || payload === "0x") return null;
  const d = kind === "event" ? decodeEvent(payload, null) : decodeCall(payload, null);
  return d.service && d.name ? `${d.service}.${d.name}` : null;
}

function replyLabel(code: string | null): string {
  try {
    const c = JSON.parse(code ?? "null") as Record<string, unknown> | null;
    if (!c) return "reply";
    const [k, v] = Object.entries(c)[0] ?? [];
    const inner = typeof v === "object" && v !== null ? Object.values(v as Record<string, unknown>)[0] : v;
    return `reply · ${k === "success" ? String(inner ?? "ok") : `error ${String(typeof inner === "object" ? Object.keys(inner as object)[0] : inner)}`}`;
  } catch {
    return "reply";
  }
}

/** Turns a trace into lanes and ordered steps (program send order = outgoing nonce order, reply last). */
export function buildFlow(trace: Trace, sender: Hex | null, rootPayload: Hex | null, names: Map<string, string>) {
  const rootId = lower(trace.root);
  const program = lower(trace.programId);
  // Unnamed programs are labelled by the Sails service they speak (seen in routes), e.g. "Pair program".
  const service = new Map<string, string>();
  const noteService = (id: string, r: string | null) => { if (r && !service.has(id)) service.set(id, r.split(".")[0]); };
  noteService(program, route(rootPayload, "call"));
  trace.nodes.forEach((n) => { if ((n.kind === "event" || n.kind === "message") && n.source) noteService(lower(n.source), route(n.payload, "event")); });
  const label = (id: string) => names.get(id) ?? (service.get(id) ? `${service.get(id)} program` : shortHex(id));
  const lanes: Lane[] = [];
  const addLane = (key: string, title: string, subtitle: string) => {
    if (!lanes.some((l) => l.key === key)) lanes.push({ key, title, subtitle });
  };
  const user = sender ? lower(sender) : "user";
  addLane(user, "Sender", sender ? shortHex(sender) : "unknown");
  addLane(program, label(program), shortHex(program));

  const byParent = new Map<string, TraceNode[]>();
  trace.nodes.forEach((n) => { if (n.parent) byParent.set(lower(n.parent), [...(byParent.get(lower(n.parent)) ?? []), n]); });
  const order = (n: TraceNode) => (n.derivation?.salt === "reply" ? Number.MAX_SAFE_INTEGER : n.derivation?.nonce ?? 0);
  const children = (id: string) => [...(byParent.get(id) ?? [])].sort((a, b) => order(a) - order(b));

  const rootWaits = trace.nodes.find((n) => n.kind === "root")?.steps.filter((s) => s.kind === "waited").length ?? 0;
  const steps: Step[] = [{ from: user, to: program, label: route(rootPayload, "call") ?? "message", tone: "message" }];

  for (const n of children(rootId)) {
    if (n.kind === "hidden") {
      const callee = n.destination ? lower(n.destination) : UNKNOWN;
      if (n.destination) addLane(callee, label(callee), shortHex(callee));
      else addLane(UNKNOWN, "Unknown program", "not on-chain");
      steps.push({
        from: program, to: callee, label: `call #${n.derivation?.nonce ?? "?"}`,
        note: rootWaits > 0 ? "awaits reply" : undefined, tone: n.destination ? "call" : "unproven", pauses: rootWaits > 0,
      });
      for (const g of children(lower(n.id))) {
        const emitter = lower(g.source) || callee;
        if (g.kind === "event") {
          addLane(EVENTS, "Events", "0x00…00");
          steps.push({ from: emitter, to: EVENTS, label: route(g.payload, "event") ?? "event", tone: "event" });
        } else if (g.kind === "message") {
          // A callee messaging an actor: give that actor a lane (the sender's when it is the sender).
          const to = lower(g.destination) || user;
          if (to !== user) addLane(to, label(to), shortHex(to));
          steps.push({ from: emitter, to, label: route(g.payload, "call") ?? "message", tone: "message" });
        }
      }
    } else if (n.kind === "event") {
      addLane(EVENTS, "Events", "0x00…00");
      steps.push({ from: lower(n.source) || program, to: EVENTS, label: route(n.payload, "event") ?? "event", tone: "event" });
    } else if (n.kind === "message") {
      const to = lower(n.destination);
      if (to && to !== user) addLane(to, label(to), shortHex(to));
      steps.push({ from: lower(n.source) || program, to: to || user, label: route(n.payload, "call") ?? "message", tone: "message" });
    } else if (n.kind === "reply") {
      steps.push({ from: lower(n.source) || program, to: user, label: replyLabel(n.replyCode), tone: n.replySuccess === false ? "reply-err" : "reply-ok" });
    }
  }
  // Keep the events lane rightmost.
  const ev = lanes.findIndex((l) => l.key === EVENTS);
  if (ev >= 0) lanes.push(...lanes.splice(ev, 1));
  return { lanes, steps };
}

const TONE: Record<Step["tone"], string> = {
  message: "text-foreground",
  call: "text-foreground/80",
  unproven: "text-muted-foreground",
  event: "text-teal-400",
  "reply-ok": "text-green-400",
  "reply-err": "text-red-400",
};

const LANE_W = 168;
const HEAD = 64;
const ROW = 46;

/** Sequence diagram of a traced message: one lane per actor, time flowing down. Phones get a numbered list. */
export function FlowDiagram({ trace, sender, rootPayload, names }: { trace: Trace; sender: Hex | null; rootPayload: Hex | null; names: Map<string, string> }) {
  const reduce = useReducedMotion();
  const { lanes, steps } = buildFlow(trace, sender, rootPayload, names);
  const x = (key: string) => {
    const i = lanes.findIndex((l) => l.key === key);
    return (i < 0 ? 0 : i) * LANE_W + LANE_W / 2;
  };
  const width = lanes.length * LANE_W;
  const height = HEAD + steps.length * ROW + 24;

  return (
    <div className="min-w-0">
      {/* The step list is the phone layout and, on wider screens, the screen-reader version of the diagram. */}
      <ol className="space-y-2 md:sr-only" aria-label="Message flow steps">
        {steps.map((s, i) => {
          const from = lanes.find((l) => l.key === s.from)?.title ?? "?";
          const to = lanes.find((l) => l.key === s.to)?.title ?? "?";
          return (
            <li key={i} className="flex gap-3 rounded-md border border-border/60 p-2.5 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0">
                <span className="block break-words">{from} → {to}</span>
                <span className={cn("block font-mono text-xs", TONE[s.tone])}>{s.label}{s.note ? ` · ${s.note}` : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-x-auto rounded-lg border border-border/60 bg-background/40 md:block">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-flow-diagram="" className="mx-auto block">
          <defs>
            <marker id="vara-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {lanes.map((l, i) => (
            <g key={l.key}>
              <text x={i * LANE_W + LANE_W / 2} y={22} textAnchor="middle" className="fill-foreground text-[12px] font-medium">{l.title.length > 22 ? `${l.title.slice(0, 21)}…` : l.title}</text>
              <text x={i * LANE_W + LANE_W / 2} y={38} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{l.subtitle}</text>
              <line x1={i * LANE_W + LANE_W / 2} x2={i * LANE_W + LANE_W / 2} y1={HEAD - 12} y2={height - 8} className="stroke-border" strokeDasharray="3 4" />
            </g>
          ))}
          {steps.map((s, i) => {
            const y = HEAD + i * ROW + ROW / 2;
            const x1 = x(s.from);
            const x2 = x(s.to);
            const self = x1 === x2;
            const dir = x2 >= x1 ? 1 : -1;
            const d = self ? `M ${x1} ${y - 8} h 34 v 16 h -30` : `M ${x1 + dir * 4} ${y} L ${x2 - dir * 6} ${y}`;
            return (
              <g key={i} className={TONE[s.tone]}>
                {s.pauses && (
                  <rect x={x1 - 3} y={y + 5} width={6} height={ROW - 10} rx={3} className="fill-amber-400/70">
                    <title>Waiting: the program paused here until this call's reply woke it</title>
                  </rect>
                )}
                <motion.path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray={s.tone === "unproven" ? "5 4" : undefined}
                  markerEnd="url(#vara-flow-arrow)"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.35, delay: i * 0.12, ease: [0.23, 1, 0.32, 1] }} />
                <text x={self ? x1 + 40 : (x1 + x2) / 2} y={y - 7} textAnchor={self ? "start" : "middle"} className="fill-current font-mono text-[11px]">
                  <tspan className="fill-muted-foreground">{i + 1}. </tspan>{s.label}{s.note ? ` · ${s.note}` : ""}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-sm bg-amber-400/70" aria-hidden />paused, waiting for a reply</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 border-t border-dashed border-muted-foreground" aria-hidden />call whose destination is not on-chain</span>
          <span>Order follows the program's send order (outgoing nonce); the reply comes last.</span>
        </p>
      </div>
    </div>
  );
}
