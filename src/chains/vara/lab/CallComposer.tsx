import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowClockwise, FileCode } from "@phosphor-icons/react";
import { Button, buttonVariants } from "../../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import { cn } from "../../../lib/utils";
import { IconAction } from "../ui/IconAction";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { AmountInput } from "../ui/AmountInput";
import { getIdl, setIdl as rememberIdl } from "../idlStore";
import { useVaraWallet } from "../wallet";
import { loadProgram } from "../program";
import { resolveIdl } from "../case";
import { loadIdlModel, defaultFormValue, encodeMethod } from "../idlForm";
import { FieldEditor } from "../ui/TypedForm";
import { parseVaraInput } from "../links";
import type { FormValue } from "../model";
import { errorText, readText } from "./files";
import { selectClass } from "../ui/Panel";

export interface CallInput { program: string; origin: string; payload: string; value: string; gasLimit: string; block: string }
export function useCallInput() {
  const [params, setParams] = useSearchParams();
  const input: CallInput = { program: params.get("program") ?? "", origin: params.get("origin") ?? "", payload: params.get("payload") ?? "0x", value: params.get("value") ?? "0", gasLimit: params.get("gas") ?? "0", block: params.get("block") ?? "latest" };
  function update(next: CallInput) {
    setParams((p) => {
      for (const [key, value] of Object.entries(next)) p.set(key === "gasLimit" ? "gas" : key, value);
      return p;
    }, { replace: true });
  }
  return [input, update] as const;
}

/** A file input's <label> styled as a small outline button. */
export const fileButtonClass = cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer focus-within:ring-2 focus-within:ring-ring max-md:min-h-11 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50");

export default function CallComposer({ input, onChange, disabled, onIdl }: { input: CallInput; onChange: (value: CallInput) => void; disabled?: boolean; onIdl?: (text: string) => void }) {
  const prefix = useId();
  const { account } = useVaraWallet();
  const [raw, setRaw] = useState(false);
  const [idl, setIdl] = useState<Awaited<ReturnType<typeof loadIdlModel>> | null>(null);
  const [methodKey, setMethodKey] = useState("");
  const [values, setValues] = useState<FormValue[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const methods = idl?.model.services.flatMap((s) => s.methods) ?? [];
  const method = methods.find((m) => `${m.service}.${m.name}` === methodKey);
  useEffect(() => {
    const token = ++seq.current; setIdl(null); setMethodKey(""); setLoading(false); setError(""); onIdl?.("");
    const parsed = parseVaraInput(input.program, "program");
    if (parsed?.kind !== "program") return;
    const cached = getIdl(parsed.id);
    if (cached) void apply(cached, token).catch((e) => { if (seq.current === token) setError(errorText(e)); });
    else void load();
    // Loading only follows a destination change, never edits to the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.program]);
  useEffect(() => () => { seq.current++; }, []);
  useEffect(() => {
    if (!idl || !method) return;
    try { if (encodeMethod(idl.sails, method, values) !== input.payload) setMethodKey(""); }
    catch { /* Keep invalid typed fields available for correction. */ }
  }, [input.payload, idl, method, values]);
  async function apply(text: string, token: number, remember = false) {
    const loaded = await loadIdlModel(text);
    if (seq.current !== token) return;
    setIdl(loaded); setMethodKey(""); setValues([]); onIdl?.(text);
    // Recognize no-argument calls carried in from the program workspace.
    const matched = loaded.model.services.flatMap((s) => s.methods).find((m) => !m.params.length && encodeMethod(loaded.sails, m, []) === input.payload);
    if (matched) setMethodKey(`${matched.service}.${matched.name}`);
    const parsed = parseVaraInput(input.program, "program");
    if (remember && parsed?.kind === "program") rememberIdl(parsed.id, text);
  }
  async function load() {
    const token = ++seq.current; setError(""); setLoading(true);
    try {
      const parsed = parseVaraInput(input.program, "program");
      if (!parsed || parsed.kind !== "program") throw new Error("Enter a Vara program id or explorer link");
      const info = await loadProgram(parsed.id);
      const source = await resolveIdl(parsed.id, info.codeId);
      if (!source) throw new Error("No published IDL was found. Load your program's IDL file.");
      await apply(source.text, token);
    } catch (err) { if (seq.current === token) setError(errorText(err)); }
    finally { if (seq.current === token) setLoading(false); }
  }
  function encode(next: FormValue[], key = methodKey) {
    const m = methods.find((m) => `${m.service}.${m.name}` === key);
    setValues(next); setError("");
    if (!idl || !m) return;
    try { onChange({ ...input, payload: encodeMethod(idl.sails, m, next) }); } catch (err) { onChange({ ...input, payload: "" }); setError(errorText(err)); }
  }
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm" htmlFor={`${prefix}-program`}>Program
        <Input id={`${prefix}-program`} value={input.program} disabled={disabled} placeholder="Program id or Gear IDEA link" className="font-mono" onChange={(e) => onChange({ ...input, program: e.target.value })} />
      </label>
      <label className="space-y-1.5 text-sm" htmlFor={`${prefix}-origin`}>Sender
        <Input id={`${prefix}-origin`} value={input.origin} disabled={disabled} placeholder="SS58 address or 32-byte hex" className="font-mono" onChange={(e) => onChange({ ...input, origin: e.target.value })} />
      </label>
    </div>
    {account && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ ...input, origin: account.address })}>Use connected wallet as sender</Button>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ToggleGroup type="single" variant="outline" size="sm" value={raw ? "raw" : "typed"} onValueChange={(v) => { if (v) setRaw(v === "raw"); }} aria-label="Call input mode">
        <ToggleGroupItem value="typed">Typed inputs</ToggleGroupItem>
        <ToggleGroupItem value="raw">Raw payload</ToggleGroupItem>
      </ToggleGroup>
      {!raw && <div className="flex flex-wrap items-center gap-1.5">
        {idl && <span className="mr-1 text-xs text-muted-foreground">{methods.length} methods available</span>}
        {idl
          ? <IconAction variant="outline" label={loading ? "Loading interface…" : "Reload interface"} loading={loading} disabled={disabled || loading || !input.program.trim()} onClick={() => void load()}>{!loading && <ArrowClockwise size={14} />}</IconAction>
          : <Button size="sm" variant="outline" loading={loading} disabled={disabled || loading || !input.program.trim()} onClick={() => void load()}>{loading ? "Loading interface…" : "Load interface"}</Button>}
        <label className={fileButtonClass}><FileCode size={14} aria-hidden />Open IDL
          <input type="file" accept=".idl,.txt" className="sr-only" disabled={disabled || loading} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; const token = ++seq.current; setError(""); try { await apply(await readText(file), token, true); } catch (err) { setError(errorText(err)); } }} />
        </label>
      </div>}
    </div>
    {!raw && !idl && <p className="text-xs text-muted-foreground" role={loading ? "status" : undefined}>{loading ? "Finding the program’s interface…" : "Enter a program to load methods, or open an IDL file."}</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!raw && idl && <div className="space-y-3 rounded-md bg-background/40 p-3">
      {!method && input.payload.length > 2 && <p className="text-xs text-muted-foreground">Encoded call loaded. Choosing a method replaces it.</p>}
      <label htmlFor={`${prefix}-method`} className="block space-y-1.5 text-sm">Method
        <select id={`${prefix}-method`} className={selectClass} value={methodKey} disabled={disabled} onChange={(e) => { const key = e.target.value; setMethodKey(key); const m = methods.find((m) => `${m.service}.${m.name}` === key); if (m) encode(m.params.map((p) => defaultFormValue(p.schema)), key); }}>
          <option value="">Choose a method</option>{methods.map((m) => <option key={`${m.service}.${m.name}`} value={`${m.service}.${m.name}`}>{m.service}.{m.name} · {m.kind === "query" ? "read" : "write"}</option>)}
        </select>
      </label>
      {method?.params.map((p, i) => <FieldEditor key={`${methodKey}.${p.name}`} schema={p.schema} value={values[i]} label={p.name} path={`${prefix}.${p.name}`} disabled={disabled} onChange={(v) => { const next = [...values]; next[i] = v; encode(next); }} />)}
    </div>}
    <details open={raw} className="border-t border-border/60 pt-3"><summary className="min-h-8 cursor-pointer content-center text-xs text-muted-foreground hover:text-foreground">{raw ? "Edit encoded payload" : "Encoded payload · inspect or edit"}</summary>
    <label htmlFor={`${prefix}-payload`} className="mt-2 block space-y-1.5 text-sm">Payload (hex)
      <Textarea id={`${prefix}-payload`} value={input.payload} disabled={disabled} spellCheck={false} className="min-h-24 font-mono text-xs" onChange={(e) => { setMethodKey(""); setError(""); onChange({ ...input, payload: e.target.value }); }} />
    </label></details>
    <AmountInput value={input.value} disabled={disabled} onChange={(value) => onChange({ ...input, value })} />
    <details className="border-t border-border/60 pt-3"><summary className="min-h-8 cursor-pointer content-center text-sm">Execution settings <span className="text-xs text-muted-foreground">· {input.block === "latest" ? "Latest finalized block" : `Block ${input.block}`}</span></summary>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">{([['block','Block'], ['gasLimit','Gas limit (0 = automatic)']] as const).map(([key, label]) => <label className="space-y-1.5 text-sm" key={key} htmlFor={`${prefix}-${key}`}>{label}<Input id={`${prefix}-${key}`} className="font-mono" value={input[key]} disabled={disabled} onChange={(e) => onChange({ ...input, [key]: e.target.value })} /></label>)}</div></details>
  </div>;
}
