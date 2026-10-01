import { useEffect, useRef, useState } from "react";
import { hexToBytes } from "@noble/hashes/utils";
import type { Sails } from "sails-js";
import { Button } from "../../components/ui/button";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type { RunResultT, Runs, VaraCase } from "./case";
import { decodeCall, decodeReply, encodeArgs } from "./decode";
import { dryRun, parseInput, sendMessage } from "./dryRun";
import { useVaraWallet } from "./wallet";

type Hex = `0x${string}`;
type Slot = "a" | "b";

function failedReply(reply: NonNullable<RunResultT["reply"]>): string {
  let text: string = reply.payload;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(reply.payload.slice(2)));
  } catch { /* keep the raw hex */ }
  return `${reply.code} ${text}`;
}

function replyString(result: RunResultT | null, slotPayload: string, sails: Sails | null): string {
  if (result?.error) return result.error;
  const reply = result?.reply;
  if (!reply) return "—";
  if (!reply.success) return failedReply(reply);
  if (reply.payload === "0x") return "Empty reply";
  if (!sails) return reply.payload;
  const decoded = decodeReply(reply.payload, decodeCall(slotPayload as Hex, sails), sails);
  return decoded.error ?? JSON.stringify(decoded.value);
}

function queryString(result: RunResultT | null, q: Runs["query"], sails: Sails | null): string {
  const query = result?.query;
  if (!query) return "—";
  if ("error" in query) return query.error;
  if (!query.success) return failedReply(query);
  if (!sails || !q) return query.payload;
  try {
    return JSON.stringify(sails.services[q.service].queries[q.name].decodeResult(query.payload));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export default function DryRunPanel({ c, sails, runs, update }: { c: VaraCase; sails: Sails | null; runs: Runs; update: (f: (prev: Runs) => Runs) => void }) {
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
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Dry run</h2>
        <p className="mt-1 text-sm text-muted-foreground">gear_calculateReplyForHandle at a pinned block</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {(["a", "b"] as const).map((slot) => (
          <div key={slot} className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">{slot.toUpperCase()}</h3>
            {(["block", "origin", "value", "gasLimit"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <label htmlFor={`vara-${slot}-${field}`} className="text-xs text-muted-foreground">{{ block: "Block", origin: "Origin", value: "Value", gasLimit: "Gas limit" }[field]}</label>
                <Input id={`vara-${slot}-${field}`} value={runs[slot].input[field]} disabled={busy[slot]} className="font-mono" spellCheck={false} onChange={(event) => {
                  const value = event.target.value;
                  update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, [field]: value } } }));
                }} />
              </div>
            ))}
            <div className="space-y-1">
              <label htmlFor={`vara-${slot}-payload`} className="text-xs text-muted-foreground">Payload</label>
              <Textarea id={`vara-${slot}-payload`} value={runs[slot].input.payload} disabled={busy[slot]} className="break-all font-mono" spellCheck={false} onChange={(event) => {
                const payload = event.target.value;
                update((p) => ({ ...p, [slot]: { ...p[slot], input: { ...p[slot].input, payload } } }));
              }} />
            </div>
            {sails && <div className="space-y-2">
              <label htmlFor={`vara-${slot}-args`} className="text-xs text-muted-foreground">Args (JSON)</label>
              <Textarea id={`vara-${slot}-args`} value={displayedArgs(slot)} disabled={busy[slot]} className="font-mono" spellCheck={false} onChange={(event) => {
                const text = event.target.value;
                setArgsText((p) => ({ ...p, [slot]: text }));
              }} />
              <Button variant="outline" size="sm" disabled={busy[slot]} onClick={() => encode(slot)}>Encode</Button>
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy[slot]} onClick={() => void run(slot)}>Run</Button>
              <Button variant="outline" disabled={!account || busy[slot]} onClick={() => void send(slot)}>Send as transaction</Button>
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
      {account && <p className="text-xs text-muted-foreground">Sends a real Vara mainnet transaction from {account.name ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`}</p>}
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
      <Button variant="outline" disabled={busy.a || busy.b} onClick={() => { void run("a"); void run("b"); }}>Run both</Button>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead><tr className="border-b border-border"><th className="w-28 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">A</th><th className="px-3 py-2 font-medium">B</th></tr></thead>
          <tbody>{["Block", "Spec version", "Reply code", "Reply", "Query result"].map((label, i) => (
            <tr key={label} className="border-b border-border last:border-0">
              <th scope="row" className="py-3 align-top font-medium">{label}{runs.a.result && runs.b.result && columns[0][i] !== columns[1][i] && <span className="mt-1 block w-fit rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">differs</span>}</th>
              {columns.map((column, j) => <td key={j} className="px-3 py-3 align-top"><pre className="whitespace-pre-wrap break-all font-mono text-xs">{column[i]}</pre></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
