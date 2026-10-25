import { useEffect, useRef, useState } from "react";
import { hexToBytes } from "@noble/hashes/utils";
import { Terminal } from "@phosphor-icons/react";
import type { SailsIdl } from "./decode";
import { Button } from "../../components/ui/button";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type { RunResultT, Runs, VaraCase } from "./case";
import { decodeCall, decodeReply, encodeArgs } from "./decode";
import { dryRun, parseInput, sendMessage } from "./dryRun";
import { varaWalletCalculateReply } from "./links";
import { useVaraWallet } from "./wallet";
import { Panel } from "./ui/Panel";

type Hex = `0x${string}`;
type Slot = "a" | "b";
const ROWS = ["Block", "Spec version", "Reply code", "Reply", "Query result"] as const;

function failedReply(reply: NonNullable<RunResultT["reply"]>): string {
  let text: string = reply.payload;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(reply.payload.slice(2)));
  } catch { /* keep the raw hex */ }
  return `${reply.code} ${text}`;
}

function replyString(result: RunResultT | null, slotPayload: string, sails: SailsIdl | null): string {
  if (result?.error) return result.error;
  const reply = result?.reply;
  if (!reply) return "—";
  if (!reply.success) return failedReply(reply);
  if (reply.payload === "0x") return "Empty reply";
  if (!sails) return reply.payload;
  const decoded = decodeReply(reply.payload, decodeCall(slotPayload as Hex, sails), sails);
  return decoded.error ?? JSON.stringify(decoded.value, null, 2);
}

function queryString(result: RunResultT | null, q: Runs["query"], sails: SailsIdl | null): string {
  const query = result?.query;
  if (!query) return "—";
  if ("error" in query) return query.error;
  if (!query.success) return failedReply(query);
  if (!sails || !q) return query.payload;
  try {
    return JSON.stringify(sails.services[q.service].queries[q.name].decodeResult(query.payload), null, 2);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export default function DryRunPanel({ c, sails, runs, update }: { c: VaraCase; sails: SailsIdl | null; runs: Runs; update: (f: (prev: Runs) => Runs) => void }) {
  const { account } = useVaraWallet();
  const [argsText, setArgsText] = useState<Record<Slot, string | null>>({ a: null, b: null });
  const [queryArgs, setQueryArgs] = useState<string | null>(null);
  const [errors, setErrors] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState({ a: false, b: false });
  const [status, setStatus] = useState({ a: "", b: "" });
  const [included, setIncluded] = useState({ a: "", b: "" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function displayedArgs(slot: Slot): string {
    return argsText[slot] ?? (sails ? JSON.stringify(decodeCall(runs[slot].input.payload as Hex, sails).value, null, 2) : "");
  }

  function encode(slot: Slot) {
    if (!sails) return;
    try {
      const route = decodeCall(c.call.payload!, sails);
      const payload = encodeArgs(sails, route.service!, route.name!, "functions", JSON.parse(displayedArgs(slot)));
      update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, payload } } }));
      setArgsText((p) => ({ ...p, [slot]: null }));
      setErrors((p) => ({ ...p, [slot]: "" }));
    } catch (err) {
      setErrors((p) => ({ ...p, [slot]: err instanceof Error ? err.message : String(err) }));
    }
  }

  /** The same dry run from Gear's vara-wallet CLI. A pinned block uses the hash of the last run at that block. */
  function walletCommand(slot: Slot): string {
    const { input, result } = runs[slot];
    const atHash = input.block === "latest" ? null : result?.block && String(result.block.number) === input.block ? result.block.hash : null;
    return varaWalletCalculateReply({ programId: c.call.destination as Hex, payload: input.payload as Hex, origin: input.origin as Hex, atHash, value: input.value || "0" });
  }

  async function run(slot: Slot) {
    setErrors((p) => ({ ...p, [slot]: "" }));
    try {
      const input = parseInput(runs[slot].input);
      let queryPayload: Hex | null = null;
      if (sails && runs.query) {
        const args: unknown = JSON.parse(queryArgs ?? JSON.stringify(runs.query.args));
        if (!Array.isArray(args)) throw new Error("Args must be a JSON array");
        const query = { ...runs.query, args };
        queryPayload = encodeArgs(sails, query.service, query.name, "queries", args);
        update((p) => ({ ...p, query }));
      }
      setBusy((p) => ({ ...p, [slot]: true }));
      const result = await dryRun(c.call.destination!, input, queryPayload);
      if (!alive.current) return;
      update((p) => ({ ...p, [slot]: { ...p[slot], result } }));
    } catch (err) {
      if (!alive.current) return;
      setErrors((p) => ({ ...p, [slot]: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (alive.current) setBusy((p) => ({ ...p, [slot]: false }));
    }
  }

  async function send(slot: Slot) {
    if (!account) return;
    setErrors((p) => ({ ...p, [slot]: "" }));
    setStatus((p) => ({ ...p, [slot]: "" }));
    setIncluded((p) => ({ ...p, [slot]: "" }));
    try {
      const input = parseInput(runs[slot].input);
      setBusy((p) => ({ ...p, [slot]: true }));
      const result = await sendMessage(account, c.call.destination!, input, (s) => {
        if (!alive.current) return;
        setStatus((p) => ({ ...p, [slot]: s }));
      });
      if (!alive.current) return;
      setIncluded((p) => ({ ...p, [slot]: `${result.block}-${result.index}` }));
      setStatus((p) => ({ ...p, [slot]: "" }));
    } catch (err) {
      if (!alive.current) return;
      setErrors((p) => ({ ...p, [slot]: err instanceof Error ? err.message : String(err) }));
      setStatus((p) => ({ ...p, [slot]: "" }));
    } finally {
      if (alive.current) setBusy((p) => ({ ...p, [slot]: false }));
    }
  }

  const columns = (["a", "b"] as const).map((slot) => {
    const { input, result } = runs[slot];
    return [
      result?.block ? `${result.block.number} (${result.block.hash.slice(0, 8)}…${result.block.hash.slice(-6)})` : "—",
      result?.specVersion === null || !result ? "—" : String(result.specVersion),
      result?.reply?.code ?? "—",
      replyString(result, input.payload, sails),
      queryString(result, runs.query, sails),
    ];
  });

  return (
    <Panel title="Dry run" actions={<Button variant="outline" size="sm" disabled={busy.a || busy.b} onClick={() => { void run("a"); void run("b"); }}>Run both</Button>}>
      <p className="max-w-prose text-xs text-muted-foreground"><code className="font-mono">gear_calculateReplyForHandle</code> at a pinned block. Each run replays the message against the state at the end of the chosen block. Messages that ran earlier inside the original block are not included, so a run can succeed where the original failed.</p>
      <div className="grid gap-6 md:grid-cols-2">
        {(["a", "b"] as const).map((slot) => (
          <div key={slot} className="min-w-0 space-y-3 rounded-md bg-background/40 p-3">
            <h3 className="text-sm font-semibold">Snapshot <span className="font-mono">{slot.toUpperCase()}</span></h3>
            <div className="space-y-1">
              <label htmlFor={`vara-${slot}-block`} className="text-xs text-muted-foreground">Block (number or latest)</label>
              <Input id={`vara-${slot}-block`} value={runs[slot].input.block} disabled={busy[slot]} className="font-mono" spellCheck={false} onChange={(event) => {
                const value = event.target.value;
                update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, block: value } } }));
              }} />
            </div>
            {/* Less-used inputs stay one click away so the two slots stay short. */}
            <details open={!sails}>
              <summary className="min-h-8 cursor-pointer select-none content-center text-xs text-muted-foreground hover:text-foreground">More inputs: origin, value, gas{sails ? ", raw payload" : ""}</summary>
              <div className="space-y-3 pt-2">
                {(["origin", "value", "gasLimit"] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <label htmlFor={`vara-${slot}-${field}`} className="text-xs text-muted-foreground">{{ origin: "Origin", value: "Value", gasLimit: "Gas limit" }[field]}</label>
                    <Input id={`vara-${slot}-${field}`} value={runs[slot].input[field]} disabled={busy[slot]} className="font-mono" spellCheck={false} onChange={(event) => {
                      const value = event.target.value;
                      update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, [field]: value } } }));
                    }} />
                  </div>
                ))}
                <div className="space-y-1">
                  <label htmlFor={`vara-${slot}-payload`} className="text-xs text-muted-foreground">Payload (hex)</label>
                  <Textarea id={`vara-${slot}-payload`} value={runs[slot].input.payload} disabled={busy[slot]} className="break-all font-mono" spellCheck={false} onChange={(event) => {
                    const payload = event.target.value;
                    update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, payload } } }));
                  }} />
                </div>
              </div>
            </details>
            {sails && <div className="space-y-2">
              <label htmlFor={`vara-${slot}-args`} className="text-xs text-muted-foreground">Args (JSON)</label>
              <Textarea id={`vara-${slot}-args`} value={displayedArgs(slot)} disabled={busy[slot]} className="font-mono" spellCheck={false} onChange={(event) => {
                const text = event.target.value;
                setArgsText((p) => ({ ...p, [slot]: text }));
              }} />
              <Button variant="outline" size="sm" disabled={busy[slot]} onClick={() => encode(slot)}>Encode</Button>
            </div>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy[slot]} onClick={() => void run(slot)}>Run {slot.toUpperCase()}</Button>
              <Button variant="outline" size="sm" disabled={!account || busy[slot]} onClick={() => void send(slot)}>Send transaction</Button>
              <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border/70 pl-2.5 text-xs text-muted-foreground" title="Copy this dry run as a Gear vara-wallet command">
                <Terminal size={14} aria-hidden />vara-wallet
                <CopyButton variant="ghost" size="icon-sm" ariaLabel={`Copy ${slot.toUpperCase()} as a vara-wallet command`} getValue={() => walletCommand(slot)} />
              </span>
            </div>
            {busy[slot] && !status[slot] && <p role="status" className="text-sm text-muted-foreground">Working…</p>}
            {status[slot] && <p role="status" className="text-sm text-muted-foreground">{status[slot]}</p>}
            {included[slot] && <div role="status" className="flex items-center gap-2 text-sm">
              <span>Included in <span className="font-mono">{included[slot]}</span></span>
              <CopyButton value={included[slot]} ariaLabel={`Copy ${slot.toUpperCase()} extrinsic id`} />
            </div>}
            {errors[slot] && <p role="alert" className="break-all text-sm text-red-400">{errors[slot]}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{account ? `Send transaction submits a real Vara mainnet transaction from ${account.name ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`}` : "Connect a Vara wallet (top right) to send."}</p>
      {sails && <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="vara-query" className="text-xs text-muted-foreground">State query</label>
          <Select value={runs.query ? `${runs.query.service}.${runs.query.name}` : "none"} disabled={busy.a || busy.b} onValueChange={(value) => {
            const [service, name] = value.split(".");
            update((p) => ({ ...p, query: value === "none" ? null : { service, name, args: [] } }));
            setQueryArgs(null);
          }}>
            <SelectTrigger id="vara-query"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {Object.entries(sails.services).flatMap(([service, svc]) => Object.keys(svc.queries).map((name) => (
                <SelectItem key={`${service}.${name}`} value={`${service}.${name}`}>{service}.{name}</SelectItem>
              )))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="vara-query-args" className="text-xs text-muted-foreground">Args (JSON array)</label>
          <Input id="vara-query-args" value={queryArgs ?? JSON.stringify(runs.query?.args ?? [])} disabled={!runs.query || busy.a || busy.b} className="font-mono" spellCheck={false} onChange={(event) => setQueryArgs(event.target.value)} />
        </div>
      </div>}
      {/* Desktop: side-by-side table. Phones: one stacked card per row. */}
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead><tr className="border-b border-border"><th className="w-28 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">A</th><th className="px-3 py-2 font-medium">B</th></tr></thead>
          <tbody>{ROWS.map((label, i) => {
            const differs = !!runs.a.result && !!runs.b.result && columns[0][i] !== columns[1][i];
            return (
              <tr key={label} className="border-b border-border last:border-0">
                <th scope="row" className={`py-3 align-top font-medium ${differs ? "border-l-2 border-l-amber-400/70 pl-2" : ""}`}>{label}{differs && <span className="mt-1 block w-fit rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">differs</span>}</th>
                {columns.map((column, j) => <td key={j} className="px-3 py-3 align-top"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{column[i]}</pre></td>)}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <dl className="space-y-3 sm:hidden">
        {ROWS.map((label, i) => {
          const differs = !!runs.a.result && !!runs.b.result && columns[0][i] !== columns[1][i];
          return (
            <div key={label} className={`space-y-2 rounded-md border p-3 ${differs ? "border-amber-400/50" : "border-border/60"}`}>
              <dt className="flex items-center justify-between text-sm font-medium">{label}{differs && <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">differs</span>}</dt>
              {columns.map((column, j) => (
                <dd key={j} className="min-w-0"><span className="text-xs text-muted-foreground">{j === 0 ? "A" : "B"}</span><pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{column[i]}</pre></dd>
              ))}
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
