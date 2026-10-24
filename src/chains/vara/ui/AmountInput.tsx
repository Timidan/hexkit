import { useId, useState } from "react";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/utils";
import { selectClass } from "./Panel";

const SCALE = 10n ** 12n;
export function toPlancks(text: string): string {
  if (!/^\d+(\.\d{0,12})?$/.test(text)) throw new Error("Use a positive amount with up to 12 decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const amount = BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, "0"));
  if (amount >= 2n ** 128n) throw new Error("Amount exceeds the supported balance range.");
  return amount.toString();
}
export function fromPlancks(value: string): string {
  if (!/^\d+$/.test(value)) return value;
  const amount = BigInt(value), fraction = (amount % SCALE).toString().padStart(12, "0").replace(/0+$/, "");
  return `${amount / SCALE}${fraction ? `.${fraction}` : ""}`;
}

/** Thousands separators for the integer part of a displayed amount; the editable text stays unformatted. */
const group = (s: string) => s.replace(/^\d+/, (whole) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

/** Keep editing text separate so decimal points and invalid drafts survive typing. The unit picker sits beside the
 *  input, so the label row is as tall as any other field's and amounts line up with their neighbours. */
export function AmountInput({ value, onChange, label = "Value", disabled }: { value: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  const [raw, setRaw] = useState(false);
  const [draft, setDraft] = useState<{ text: string; emitted: string } | null>(null);
  const text = draft?.emitted === value ? draft.text : raw ? value : fromPlancks(value);
  let error = "";
  try {
    if (raw) { if (!/^\d+$/.test(text) || BigInt(text) >= 2n ** 128n) throw new Error("Enter a whole number of plancks within the balance range."); }
    else toPlancks(text);
  } catch (e) { error = (e as Error).message; }
  return <div className="min-w-0 space-y-1.5 text-sm">
    <label htmlFor={id} className="block">{label}</label>
    <div className="flex gap-2">
    <Input id={id} value={text} disabled={disabled} inputMode={raw ? "numeric" : "decimal"} className="font-mono" aria-invalid={!!error} aria-describedby={`${id}-help`} onChange={(e) => {
      const text = e.target.value; let emitted = "";
      try { emitted = raw ? (/^\d+$/.test(text) && BigInt(text) < 2n ** 128n ? text : "") : toPlancks(text); } catch { /* Invalid drafts cannot be executed. */ }
      setDraft({ text, emitted }); onChange(emitted);
    }} />
    <select aria-label={`${label} unit`} disabled={disabled || !!error} className={cn(selectClass, "w-[6.5rem] shrink-0")} value={raw ? "plancks" : "VARA"} onChange={(e) => { setRaw(e.target.value === "plancks"); setDraft(null); }}><option>VARA</option><option>plancks</option></select>
    </div>
    <p id={`${id}-help`} className={`break-all text-xs ${error ? "text-red-400" : "text-muted-foreground"}`}>{error || (raw ? `${group(fromPlancks(value))} VARA` : `${group(value)} plancks`)}</p>
  </div>;
}
