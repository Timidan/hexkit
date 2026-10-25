import { bytesToHex } from "@noble/hashes/utils";
import { SailsProgram } from "sails-js";
import type { ISailsPrimitiveDef, ISailsTypeDef, IStructField, TypeDecl } from "sails-js";
import { decodeSs58 } from "./address";
import { loadIdl, type SailsIdl } from "./decode";
import type { FieldSchema, FormValue, Hex, IdlModel, MethodSchema, PrimitiveName } from "./model";

const primitives: [keyof ISailsPrimitiveDef, PrimitiveName][] = [
  ["isBool", "bool"], ["isChar", "char"], ["isStr", "str"],
  ["isU8", "u8"], ["isU16", "u16"], ["isU32", "u32"], ["isU64", "u64"], ["isU128", "u128"], ["isU256", "u256"],
  ["isI8", "i8"], ["isI16", "i16"], ["isI32", "i32"], ["isI64", "i64"], ["isI128", "i128"],
  ["isNonZeroU8", "nat8"], ["isNonZeroU16", "nat16"], ["isNonZeroU32", "nat32"],
  ["isNonZeroU64", "nat64"], ["isNonZeroU128", "nat128"], ["isNonZeroU256", "nat256"],
  ["isActorId", "actor_id"], ["isCodeId", "code_id"], ["isMessageId", "message_id"], ["isH256", "h256"], ["isH160", "h160"],
];

const V2_PRIMITIVES: Record<string, PrimitiveName> = {
  bool: "bool", char: "char", String: "str", u8: "u8", u16: "u16", u32: "u32", u64: "u64", u128: "u128", U256: "u256",
  i8: "i8", i16: "i16", i32: "i32", i64: "i64", i128: "i128", ActorId: "actor_id", CodeId: "code_id", MessageId: "message_id", H256: "h256", H160: "h160",
  NonZeroU8: "nat8", NonZeroU16: "nat16", NonZeroU32: "nat32", NonZeroU64: "nat64", NonZeroU128: "nat128", NonZeroU256: "nat256",
};

/** IDL v2: walks `TypeDecl`s, resolving user types in the service's scope. */
function modelV2(program: SailsProgram): IdlModel {
  return { services: Object.entries(program.services).map(([serviceName, service]) => {
    function map(decl: TypeDecl, stack: string[] = [], generics: Record<string, TypeDecl> = {}): FieldSchema {
      if (typeof decl === "string") {
        if (decl === "()") return { kind: "null" };
        const type = V2_PRIMITIVES[decl];
        if (!type) throw new Error(`Unsupported IDL primitive: ${decl}`);
        return { kind: "primitive", type };
      }
      if (decl.kind === "slice") return { kind: "vec", inner: map(decl.item, stack, generics) };
      if (decl.kind === "array") return { kind: "array", inner: map(decl.item, stack, generics), len: decl.len };
      if (decl.kind === "tuple") return decl.types.length ? { kind: "struct", name: null, tuple: true, fields: decl.types.map((t, i) => ({ name: String(i), schema: map(t, stack, generics) })) } : { kind: "null" };
      if (decl.kind === "generic") {
        if (!generics[decl.name]) throw new Error(`Unsupported IDL type: unbound generic ${decl.name}`);
        return map(generics[decl.name], stack, generics);
      }
      const args = decl.generics ?? [];
      if (decl.name === "Option") return { kind: "option", inner: map(args[0], stack, generics) };
      if (decl.name === "Result") return { kind: "result", ok: map(args[0], stack, generics), err: map(args[1], stack, generics) };
      if (V2_PRIMITIVES[decl.name]) return map(decl.name as TypeDecl, stack, generics);
      if (stack.includes(decl.name)) return { kind: "recursive", name: decl.name };
      const type = program.resolveInService(serviceName, { kind: "named", name: decl.name }) ?? program.programTypes.get(decl.name);
      if (!type) throw new Error(`Unknown IDL type: ${decl.name}`);
      const next = [...stack, decl.name];
      // shortcut: nested generic-of-generic user types are unsupported; extend substitution when a real interface needs them.
      const bound: Record<string, TypeDecl> = {};
      (type.type_params ?? []).forEach((p, i) => {
        const arg = args[i] ?? p.ty;
        if (arg) bound[p.name] = typeof arg !== "string" && arg.kind === "generic" ? generics[arg.name] ?? arg : arg;
      });
      if (type.kind === "alias") return map(type.target, next, bound);
      if (type.kind === "struct") return fields(type.fields, next, bound, decl.name) ?? { kind: "struct", name: decl.name, tuple: false, fields: [] };
      return { kind: "enum", name: decl.name, variants: type.variants.map((v) => ({ name: v.name, schema: fields(v.fields, next, bound, null) })) };
    }
    function fields(list: IStructField[], stack: string[], generics: Record<string, TypeDecl>, name: string | null): FieldSchema | null {
      if (!list.length) return null;
      if (list.length === 1 && !list[0].name && name === null) return map(list[0].type, stack, generics);
      const tuple = list.some((f) => !f.name);
      return { kind: "struct", name, tuple, fields: list.map((f, i) => ({ name: f.name ?? String(i), schema: map(f.type, stack, generics) })) };
    }
    type Fn = { args: { name: string; typeDef: TypeDecl }[]; returnTypeDef: TypeDecl; docs?: string };
    const methods = (kind: "function" | "query") => Object.entries<Fn>(kind === "query" ? service.queries : service.functions).map(([name, fn]) => ({
      service: serviceName, name, kind, docs: fn.docs || null,
      params: fn.args.map((arg) => ({ name: arg.name, schema: map(arg.typeDef) })), returns: map(fn.returnTypeDef),
    }));
    return { name: serviceName, methods: [...methods("function"), ...methods("query")],
      events: Object.entries(service.events).map(([name, event]) => ({ name, schema: fields(event.typeDef.fields ?? [], [], {}, null) })) };
  }) };
}

export async function loadIdlModel(text: string): Promise<{ sails: SailsIdl; model: IdlModel }> {
  const sails = await loadIdl(text);
  if (sails instanceof SailsProgram) return { sails, model: modelV2(sails) };
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

export function encodeMethod(sails: SailsIdl, method: MethodSchema, values: FormValue[]): Hex {
  return sails.services[method.service][method.kind === "query" ? "queries" : "functions"][method.name].encodePayload(...toArgs(method, values));
}
