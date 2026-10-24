import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowSquareOut, MagnifyingGlass, Play } from "@phosphor-icons/react";
import { fetchCase, findMessage } from "../case";
import type { VaraCase } from "../case";
import { ideaMessageUrl } from "../links";
import { sqdHead, sqdMessagesTo } from "../sqd";
import type { SqdMessage } from "../sqd";
import { PROGRAM_EXAMPLES, ProgramMark } from "../ui/ProgramExamples";
import { shortHex } from "../ui/HexChip";
import { IconAction } from "../ui/IconAction";
import { useProgramNames } from "../ui/useProgramNames";
import type { CallInput } from "./CallComposer";
import { errorText } from "./files";
import { sampleCall } from "./simulation";

/** Recent indexed program calls. With `onPick`, a row hands over its message id instead of building a call to simulate. */
export default function RecentMessages({ onSelect, onPick, onLoading, disabled }: { onSelect?: (input: CallInput, source: VaraCase) => void; onPick?: (messageId: string) => void; onLoading?: (loading: boolean) => void; disabled: boolean }) {
  const verb = onPick ? "Inspect" : "Simulate";
  const [data, setData] = useState<{ head: number; items: SqdMessage[]; checked: Date } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const names = useProgramNames(data?.items.map((m) => m.destination) ?? []);
  async function refresh() {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    const signal = AbortSignal.any([current.signal, AbortSignal.timeout(30_000)]);
    setLoading(true); setError("");
    try {
      const head = await sqdHead(signal);
      if (head === null) throw new Error("The message index is unavailable. Retry, or enter a call below.");
      const messages = await sqdMessagesTo(null, Math.max(0, head - 1999), head, signal);
      if (!current.signal.aborted) setData({ head, items: messages.filter((m) => m.entry === "Handle").slice(0, 4), checked: new Date() });
    } catch (e) {
      if (!current.signal.aborted) setError(e instanceof DOMException && e.name === "TimeoutError" ? "The message index did not answer within 30 seconds. Retry in a moment." : errorText(e));
    }
    finally { if (!current.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  async function select(message: SqdMessage) {
    if (onPick) { onPick(message.id); return; }
    setSelected(message.id); setError(""); onLoading?.(true);
    try {
      const hit = await findMessage(message.id, message);
      if (!hit) throw new Error("This indexed message was not found in its chain block. Open the explorer to inspect it.");
      const source = await fetchCase(hit.block, hit.index, hit.messageIndex);
      const input = sampleCall(source, message.id);
      if (input.origin.toLowerCase() !== message.source) throw new Error("The message sender differs from the transaction signer. Open the explorer to inspect this call.");
      if (alive.current) onSelect?.(input, source);
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) { setSelected(null); onLoading?.(false); } }
  }
  return <section aria-label="Recent message samples" aria-busy={loading || !!selected} className="min-w-0 rounded-lg border border-border/70 bg-card">
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
      <div className="min-w-0"><h2 className="text-sm font-semibold">Recent indexed messages</h2></div>
      <IconAction label={loading ? "Refreshing samples" : "Refresh samples"} disabled={loading || !!selected || disabled} onClick={() => void refresh()}><ArrowClockwise size={16} className={loading ? "animate-spin" : ""} /></IconAction>
    </div>
    <div className="p-2">
    {loading && !data && <p role="status" className="px-2 py-4 text-sm text-muted-foreground">Finding recent program calls…</p>}
    {data && <>
      <ul className="grid gap-1 lg:grid-cols-2">{data.items.map((m) => {
        const project = PROGRAM_EXAMPLES.find((p) => p.id === m.destination);
        const name = project?.name ?? names.get(m.destination) ?? shortHex(m.destination);
        return <li key={m.id} className="flex min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent/30">
          <button type="button" disabled={disabled || !!selected} onClick={() => void select(m)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" aria-label={`${verb} this call · ${name} · ${shortHex(m.id)}`} title={`${verb} this call · ${name} · ${shortHex(m.id)}`}>
            <ProgramMark id={m.destination} small />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-0">
                <span className="min-w-0 truncate text-sm font-medium max-sm:whitespace-normal max-sm:break-words">{name}</span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(m.timestamp).toISOString()} title={new Date(m.timestamp).toLocaleString()}>{new Date(m.timestamp).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </span>
              <span className="block break-words text-xs text-muted-foreground">{project?.program ?? "Program message"} · <span className="font-mono">#{m.block}</span></span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">{onPick ? <MagnifyingGlass size={12} weight="bold" aria-hidden /> : <Play size={12} weight="fill" aria-hidden />}<span className="max-sm:sr-only">{selected === m.id ? "Loading…" : verb}</span></span>
          </button>
          <a className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-8" href={ideaMessageUrl(m.id)} target="_blank" rel="noreferrer" title={`View sample ${shortHex(m.id)} in Gear IDEA`} aria-label={`View sample ${shortHex(m.id)} in Gear IDEA`}><ArrowSquareOut size={14} /></a>
        </li>;
      })}</ul>
      {!data.items.length && <p className="px-2 py-4 text-sm text-muted-foreground">No messages in the last 2,000 indexed blocks. Refresh or enter a call below.</p>}
      <details className="px-2 text-xs text-muted-foreground"><summary className="min-h-9 cursor-pointer content-center hover:text-foreground">Source & freshness · checked {data.checked.toLocaleTimeString()}</summary><p className="pb-2"><a className="underline underline-offset-2" href="https://portal.sqd.dev/datasets/vara" target="_blank" rel="noreferrer">SQD</a> · latest 2,000 indexed blocks through #{data.head}. The index may trail the chain; timestamps are from the original messages.</p></details>
    </>}
    {error && <p role="alert" className="px-2 py-2 text-sm text-red-400">{data ? "Sample request failed. Previous samples remain available. " : ""}{error}</p>}
    </div>
  </section>;
}
