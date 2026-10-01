import { bytesToHex } from "@noble/hashes/utils";
import type { ISailsPrimitiveDef, ISailsTypeDef, Sails } from "sails-js";
import { decodeSs58 } from "./address";
import { loadIdl } from "./decode";
import type { FieldSchema, FormValue, Hex, IdlModel, MethodSchema, PrimitiveName } from "./model";

const primitives: [keyof ISailsPrimitiveDef, PrimitiveName][] = [
  ["isBool", "bool"], ["isChar", "char"], ["isStr", "str"],
  ["isU8", "u8"], ["isU16", "u16"], ["isU32", "u32"], ["isU64", "u64"], ["isU128", "u128"], ["isU256", "u256"],
  ["isI8", "i8"], ["isI16", "i16"], ["isI32", "i32"], ["isI64", "i64"], ["isI128", "i128"],
  ["isNonZeroU8", "nat8"], ["isNonZeroU16", "nat16"], ["isNonZeroU32", "nat32"],
  ["isNonZeroU64", "nat64"], ["isNonZeroU128", "nat128"], ["isNonZeroU256", "nat256"],
  ["isActorId", "actor_id"], ["isCodeId", "code_id"], ["isMessageId", "message_id"], ["isH256", "h256"], ["isH160", "h160"],
];

export async function loadIdlModel(text: string): Promise<{ sails: Sails; model: IdlModel }> {
  const sails = await loadIdl(text);
  const program = sails.program;
  function map(def: ISailsTypeDef, stack: string[] = [], name: string | null = null): FieldSchema {
    if (def.isUserDefined) {
      const name = def.asUserDefined.name;
      if (stack.includes(name)) return { kind: "recursive", name };
      return map(program.getTypeByName(name).def, [...stack, name], name);
    }
    if (def.isPrimitive) {
      if (def.asPrimitive.isNull) return { kind: "null" };
      const primitive = primitives.find(([flag]) => def.asPrimitive[flag]);
      if (!primitive) throw new Error("Unsupported IDL primitive");
      return { kind: "primitive", type: primitive[1] };
    }
    if (def.isStruct) return { kind: "struct", name, tuple: def.asStruct.isTuple, fields: def.asStruct.fields.map((field) => ({ name: field.name, schema: map(field.def, stack) })) };
    if (def.isEnum) return { kind: "enum", name, variants: def.asEnum.variants.map((variant) => ({ name: variant.name, schema: variant.def ? map(variant.def, stack) : null })) };
    if (def.isOptional) return { kind: "option", inner: map(def.asOptional.def, stack) };
    if (def.isResult) return { kind: "result", ok: map(def.asResult.ok.def, stack), err: map(def.asResult.err.def, stack) };
    if (def.isVec) return { kind: "vec", inner: map(def.asVec.def, stack) };
    if (def.isFixedSizeArray) return { kind: "array", inner: map(def.asFixedSizeArray.def, stack), len: def.asFixedSizeArray.len };
    if (def.isMap) return { kind: "map", key: map(def.asMap.key.def, stack), value: map(def.asMap.value.def, stack) };
    throw new Error("Unsupported IDL type");
  }
  return {
    sails,
    model: { services: program.services.map((service) => ({
      name: service.name,
      methods: service.funcs.map((func) => ({
        service: service.name, name: func.name, kind: func.isQuery ? "query" : "function", docs: func.docs || null,
        params: func.params.map((param) => ({ name: param.name, schema: map(param.def) })), returns: map(func.def),
      })),
      events: service.events.map((event) => ({ name: event.name, schema: event.def ? map(event.def) : null })),
    })) },
  };
}

export function defaultFormValue(schema: FieldSchema): FormValue {
  switch (schema.kind) {
    case "primitive": return schema.type === "bool" ? false : schema.type.startsWith("nat") ? "1" : /^(u|i)\d+$/.test(schema.type) ? "0" : "";
    case "null": return null;
    case "struct": return schema.tuple ? schema.fields.map((field) => defaultFormValue(field.schema)) : Object.fromEntries(schema.fields.map((field) => [field.name, defaultFormValue(field.schema)]));
    case "enum": {
      const variant = schema.variants[0];
      return { variant: variant?.name ?? "", value: variant?.schema ? defaultFormValue(variant.schema) : null };
    }
    case "option": return { some: false, value: defaultFormValue(schema.inner) };
    case "result": return { ok: true, value: defaultFormValue(schema.ok) };
    case "vec": return schema.inner.kind === "primitive" && schema.inner.type === "u8" ? "0x" : [];
    case "map": return [];
    case "array": return Array.from({ length: schema.len }, () => defaultFormValue(schema.inner));
    case "recursive": return "null";
  }
}

export function toArg(schema: FieldSchema, v: FormValue, path: string): unknown {
  function fail(message: string): never { throw new Error(`${path}: ${message}`); }
  function list(len?: number): FormValue[] {
    if (!Array.isArray(v)) return fail("expected an array");
    if (len !== undefined && v.length !== len) return fail(`expected ${len} items`);
    return v;
  }
  function record(): { [key: string]: FormValue } {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail("expected an object");
    return v;
  }
  switch (schema.kind) {
    case "primitive": {
      const type = schema.type;
      if (type === "char") return fail("char is not supported by sails-js");
      if (type === "bool") return typeof v === "boolean" ? v : fail("expected a boolean");
      if (typeof v !== "string") return fail("expected a string");
      if (type === "str") return v;
      const text = v.trim();
      if (/^(u|i|nat)\d+$/.test(type)) {
        if (!/^-?\d+$/.test(text)) return fail("expected a decimal integer");
        if (type.startsWith("u") && text.startsWith("-")) return fail("must be unsigned");
        if (type.startsWith("nat") && BigInt(text) <= 0n) return fail("must be greater than zero");
        return text;
      }
      if (type === "actor_id" && !text.startsWith("0x")) {
        try { return `0x${bytesToHex(decodeSs58(text))}`; } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
      }
      const bytes = type === "h160" ? 20 : 32;
      if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(text)) return fail(`expected ${bytes}-byte hex`);
      return text;
    }
    case "null": return v === null ? null : fail("expected null");
    case "struct": {
      if (schema.tuple) return list(schema.fields.length).map((value, i) => toArg(schema.fields[i].schema, value, `${path}[${i}]`));
      const value = record();
      return Object.fromEntries(schema.fields.map((field) => [field.name, toArg(field.schema, value[field.name], `${path}.${field.name}`)]));
    }
    case "enum": {
      const value = record();
      const variant = schema.variants.find((variant) => variant.name === value.variant);
      if (!variant) return fail("unknown enum variant");
      return variant.schema === null ? variant.name : { [variant.name]: toArg(variant.schema, value.value, `${path}.${variant.name}`) };
    }
    case "option": {
      const value = record();
      if (typeof value.some !== "boolean") return fail("expected a boolean some flag");
      return value.some ? toArg(schema.inner, value.value, `${path}.some`) : null;
    }
    case "result": {
      const value = record();
      if (typeof value.ok !== "boolean") return fail("expected a boolean ok flag");
      return value.ok ? { ok: toArg(schema.ok, value.value, `${path}.ok`) } : { err: toArg(schema.err, value.value, `${path}.err`) };
    }
    case "vec":
      if (schema.inner.kind === "primitive" && schema.inner.type === "u8" && typeof v === "string") {
        if (!/^0x([0-9a-fA-F]{2})*$/.test(v)) return fail("expected byte hex");
        return v;
      }
      return list().map((value, i) => toArg(schema.inner, value, `${path}[${i}]`));
    case "array": return list(schema.len).map((value, i) => toArg(schema.inner, value, `${path}[${i}]`));
    case "map": return new Map(list().map((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) return fail(`entry ${i} must be a key/value pair`);
      return [toArg(schema.key, pair[0], `${path}[${i}].key`), toArg(schema.value, pair[1], `${path}[${i}].value`)];
    }));
    case "recursive":
      if (typeof v !== "string") return fail("expected JSON text");
      try { return JSON.parse(v); } catch { return fail("invalid JSON"); }
  }
}

export function toArgs(method: MethodSchema, values: FormValue[]): unknown[] {
  if (values.length !== method.params.length) throw new Error(`${method.name}: expected ${method.params.length} arguments`);
  return method.params.map((param, i) => toArg(param.schema, values[i], param.name));
}

export function encodeMethod(sails: Sails, method: MethodSchema, values: FormValue[]): Hex {
  return sails.services[method.service][method.kind === "query" ? "queries" : "functions"][method.name].encodePayload(...toArgs(method, values));
}
