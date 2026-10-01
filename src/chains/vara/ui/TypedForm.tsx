import { Minus, Plus } from "@phosphor-icons/react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import type { FieldSchema, FormValue } from "../model";

type Obj = { [key: string]: FormValue };

/** Short type label for a schema, e.g. "vec BasketItem", "opt u64". */
export function typeLabel(s: FieldSchema): string {
  switch (s.kind) {
    case "primitive": return s.type;
    case "null": return "null";
    case "struct": return s.name ?? (s.tuple ? `(${s.fields.map((f) => typeLabel(f.schema)).join(", ")})` : "struct");
    case "enum": return s.name ?? "enum";
    case "option": return `opt ${typeLabel(s.inner)}`;
    case "result": return `result (${typeLabel(s.ok)}, ${typeLabel(s.err)})`;
    case "vec": return `vec ${typeLabel(s.inner)}`;
    case "array": return `[${typeLabel(s.inner)}; ${s.len}]`;
    case "map": return `map (${typeLabel(s.key)}, ${typeLabel(s.value)})`;
    case "recursive": return s.name;
  }
}

/** UI-side default; mirrors idlForm.defaultFormValue so new list items render before the data layer is called. */
function emptyValue(s: FieldSchema): FormValue {
  switch (s.kind) {
    case "primitive": return s.type === "bool" ? false : s.type === "str" || s.type === "char" ? "" : s.type.startsWith("nat") ? "1" : /^[ui]\d+$/.test(s.type) ? "0" : "";
    case "null": return null;
    case "struct": return s.tuple ? s.fields.map((f) => emptyValue(f.schema)) : Object.fromEntries(s.fields.map((f) => [f.name, emptyValue(f.schema)]));
    case "enum": { const v = s.variants[0]; return { variant: v?.name ?? "", value: v?.schema ? emptyValue(v.schema) : null }; }
    case "option": return { some: false, value: emptyValue(s.inner) };
    case "result": return { ok: true, value: emptyValue(s.ok) };
    case "vec": return isBytes(s) ? "0x" : [];
    case "array": return Array.from({ length: s.len }, () => emptyValue(s.inner));
    case "map": return [];
    case "recursive": return "null";
  }
}

function placeholder(type: string) {
  if (type === "actor_id") return "0x… or SS58 address";
  if (type === "h160") return "0x… (20 bytes)";
  if (["code_id", "message_id", "h256"].includes(type)) return "0x… (32 bytes)";
  if (type === "str") return "text";
  if (type === "char") return "one character";
  return type.startsWith("nat") ? "1" : "0";
}

/** `vec u8` is edited as one hex string rather than a list of bytes. */
const isBytes = (s: FieldSchema) => s.kind === "vec" && s.inner.kind === "primitive" && s.inner.type === "u8";

const fieldId = (path: string) => `vara-field-${path.replace(/[^\w-]/g, "_")}`;

function TypeHint({ s }: { s: FieldSchema }) {
  return <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{typeLabel(s)}</span>;
}

export function FieldEditor({ schema, value, onChange, label, path, disabled }: {
  schema: FieldSchema; value: FormValue; onChange: (v: FormValue) => void; label: string; path: string; disabled?: boolean;
}) {
  const id = fieldId(path);

  if (schema.kind === "primitive") {
    if (schema.type === "bool") {
      return (
        <div className="flex min-h-9 items-center justify-between gap-3">
          <label htmlFor={id} className="text-sm">{label}<TypeHint s={schema} /></label>
          <Switch id={id} checked={value === true} disabled={disabled} onCheckedChange={(c) => onChange(c)} />
        </div>
      );
    }
    const numeric = /^(u|i|nat)\d+$/.test(schema.type);
    const mono = schema.type !== "str";
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm">{label}<TypeHint s={schema} /></label>
        <Input id={id} value={typeof value === "string" ? value : ""} disabled={disabled} placeholder={placeholder(schema.type)}
          inputMode={numeric ? "numeric" : undefined} autoComplete="off" spellCheck={false}
          className={mono ? "font-mono" : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  if (schema.kind === "null") {
    return <p className="text-sm text-muted-foreground">{label}<TypeHint s={schema} /></p>;
  }

  if (schema.kind === "recursive") {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm">{label}<TypeHint s={schema} /> <span className="text-xs text-muted-foreground">(JSON)</span></label>
        <Textarea id={id} value={typeof value === "string" ? value : "null"} disabled={disabled} className="min-h-20 font-mono text-sm" onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  if (schema.kind === "struct") {
    const isTuple = schema.tuple;
    const current = value ?? (isTuple ? [] : {});
    return (
      <fieldset className="min-w-0 space-y-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-sm">{label}<TypeHint s={schema} /></legend>
        {schema.fields.map((f, i) => {
          const key = isTuple ? i : f.name;
          const child = isTuple ? (current as FormValue[])[i] : (current as Obj)[f.name];
          return (
            <FieldEditor key={String(key)} schema={f.schema} value={child ?? emptyValue(f.schema)} disabled={disabled}
              label={isTuple ? `#${i}` : f.name} path={`${path}.${key}`}
              onChange={(v) => {
                if (isTuple) { const next = [...(current as FormValue[])]; next[i] = v; onChange(next); }
                else onChange({ ...(current as Obj), [f.name]: v });
              }} />
          );
        })}
      </fieldset>
    );
  }

  if (schema.kind === "enum") {
    const cur = (value as Obj | null) ?? (emptyValue(schema) as Obj);
    const variant = schema.variants.find((v) => v.name === cur.variant) ?? schema.variants[0];
    return (
      <div className="min-w-0 space-y-2">
        <label htmlFor={id} className="block text-sm">{label}<TypeHint s={schema} /></label>
        <Select value={variant?.name} disabled={disabled} onValueChange={(name) => {
          const next = schema.variants.find((v) => v.name === name);
          onChange({ variant: name, value: next?.schema ? emptyValue(next.schema) : null });
        }}>
          <SelectTrigger id={id} className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>{schema.variants.map((v) => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
        {variant?.schema && (
          <div className="border-l border-border/60 pl-3">
            <FieldEditor schema={variant.schema} value={cur.value ?? emptyValue(variant.schema)} disabled={disabled}
              label={variant.name} path={`${path}.${variant.name}`} onChange={(v) => onChange({ variant: variant.name, value: v })} />
          </div>
        )}
      </div>
    );
  }

  if (schema.kind === "option") {
    const cur = (value as Obj | null) ?? (emptyValue(schema) as Obj);
    return (
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <label htmlFor={id} className="text-sm">{label}<TypeHint s={schema} /></label>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {cur.some ? "Some" : "None"}
            <Switch id={id} checked={cur.some === true} disabled={disabled} onCheckedChange={(c) => onChange({ ...cur, some: c })} />
          </span>
        </div>
        {cur.some === true && (
          <div className="border-l border-border/60 pl-3">
            <FieldEditor schema={schema.inner} value={cur.value ?? emptyValue(schema.inner)} disabled={disabled}
              label="value" path={`${path}.some`} onChange={(v) => onChange({ some: true, value: v })} />
          </div>
        )}
      </div>
    );
  }

  if (schema.kind === "result") {
    const cur = (value as Obj | null) ?? (emptyValue(schema) as Obj);
    const ok = cur.ok !== false;
    const inner = ok ? schema.ok : schema.err;
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm">{label}<TypeHint s={schema} /></p>
        <ToggleGroup type="single" variant="outline" size="sm" value={ok ? "ok" : "err"} disabled={disabled}
          onValueChange={(v) => { if (v) onChange({ ok: v === "ok", value: emptyValue(v === "ok" ? schema.ok : schema.err) }); }}>
          <ToggleGroupItem value="ok">Ok</ToggleGroupItem>
          <ToggleGroupItem value="err">Err</ToggleGroupItem>
        </ToggleGroup>
        <div className="border-l border-border/60 pl-3">
          <FieldEditor schema={inner} value={cur.value ?? emptyValue(inner)} disabled={disabled} label={ok ? "ok" : "err"}
            path={`${path}.${ok ? "ok" : "err"}`} onChange={(v) => onChange({ ok, value: v })} />
        </div>
      </div>
    );
  }

  if (isBytes(schema)) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm">{label}<TypeHint s={schema} /> <span className="text-xs text-muted-foreground">(hex bytes)</span></label>
        <Input id={id} value={typeof value === "string" ? value : "0x"} disabled={disabled} placeholder="0x…" autoComplete="off" spellCheck={false}
          className="font-mono" onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  if (schema.kind === "vec" || schema.kind === "array") {
    const items = Array.isArray(value) ? value : [];
    const fixed = schema.kind === "array";
    return (
      <fieldset className="min-w-0 space-y-3 rounded-md border border-border/60 p-3">
        <legend className="px-1 text-sm">{label}<TypeHint s={schema} /> <span className="font-mono text-xs text-muted-foreground">[{items.length}]</span></legend>
        {items.length === 0 && <p className="text-xs text-muted-foreground">Empty list</p>}
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FieldEditor schema={schema.inner} value={item} disabled={disabled} label={`#${i}`} path={`${path}.${i}`}
                onChange={(v) => { const next = [...items]; next[i] = v; onChange(next); }} />
            </div>
            {!fixed && (
              <Button type="button" variant="ghost" size="icon-sm" className="mt-6 shrink-0" aria-label={`Remove item ${i}`} disabled={disabled}
                onClick={() => onChange(items.filter((_, j) => j !== i))}><Minus /></Button>
            )}
          </div>
        ))}
        {!fixed && (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...items, emptyValue(schema.inner)])}>
            <Plus /> Add item
          </Button>
        )}
      </fieldset>
    );
  }

  // map
  const pairs = (Array.isArray(value) ? value : []) as FormValue[][];
  return (
    <fieldset className="min-w-0 space-y-3 rounded-md border border-border/60 p-3">
      <legend className="px-1 text-sm">{label}<TypeHint s={schema} /> <span className="font-mono text-xs text-muted-foreground">[{pairs.length}]</span></legend>
      {pairs.map(([k, v], i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <FieldEditor schema={schema.key} value={k} disabled={disabled} label="key" path={`${path}.${i}.key`}
              onChange={(nk) => { const next = [...pairs]; next[i] = [nk, v]; onChange(next); }} />
            <FieldEditor schema={schema.value} value={v} disabled={disabled} label="value" path={`${path}.${i}.value`}
              onChange={(nv) => { const next = [...pairs]; next[i] = [k, nv]; onChange(next); }} />
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="mt-6 shrink-0" aria-label={`Remove entry ${i}`} disabled={disabled}
            onClick={() => onChange(pairs.filter((_, j) => j !== i))}><Minus /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...pairs, [emptyValue(schema.key), emptyValue(schema.value)]])}>
        <Plus /> Add entry
      </Button>
    </fieldset>
  );
}
