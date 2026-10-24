import { useId, useState } from "react";
import { Input } from "../../../components/ui/input";

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

/** Keep editing text separate so decimal points and invalid drafts survive typing. */
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
    <div className="flex items-center justify-between gap-2"><label htmlFor={id}>{label}</label><select aria-label={`${label} unit`} disabled={disabled || !!error} className="rounded border border-input bg-background px-2 py-1 text-xs" value={raw ? "plancks" : "VARA"} onChange={(e) => { setRaw(e.target.value === "plancks"); setDraft(null); }}><option>VARA</option><option>plancks</option></select></div>
    <Input id={id} value={text} disabled={disabled} inputMode={raw ? "numeric" : "decimal"} className="font-mono" aria-invalid={!!error} aria-describedby={`${id}-help`} onChange={(e) => {
      const text = e.target.value; let emitted = "";
      try { emitted = raw ? (/^\d+$/.test(text) && BigInt(text) < 2n ** 128n ? text : "") : toPlancks(text); } catch { /* Invalid drafts cannot be executed. */ }
      setDraft({ text, emitted }); onChange(emitted);
    }} />
    <p id={`${id}-help`} className={`break-all text-xs ${error ? "text-red-400" : "text-muted-foreground"}`}>{error || (raw ? `${fromPlancks(value)} VARA` : `${value} plancks`)}</p>
  </div>;
}
