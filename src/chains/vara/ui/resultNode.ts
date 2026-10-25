import { createNodeFromValue, type ComplexValueNode } from "../../../utils/complexValueBuilder";
import type { FieldSchema } from "../model";
import { typeLabel } from "./TypedForm";

const INT = /^(u|i|nat)(\d+)$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Polkadot camelCases the variant key of an enum that carries data ({ someVariant: … }).
const sameName = (a: string, b: string) => a.replace(/_/g, "").toLowerCase() === b.replace(/_/g, "").toLowerCase();

/** Turns a decoded Sails value (Polkadot toJSON) into the shared result viewer's node, typed by the IDL. */
export function toNode(schema: FieldSchema, value: unknown, label: string): ComplexValueNode {
  const type = typeLabel(schema);
  const leaf = (v: unknown): ComplexValueNode => ({ label, type, value: v, raw: value });
  const branch = (children: ComplexValueNode[]): ComplexValueNode => ({ label, type, raw: value, children });
  switch (schema.kind) {
    case "primitive": {
      const int = INT.exec(schema.type);
      // Integers above 52 bits arrive as hex (two's complement for signed types).
      if (int && typeof value === "string" && value.startsWith("0x")) {
        const n = BigInt(value);
        return leaf(String(int[1] === "i" ? BigInt.asIntN(Number(int[2]), n) : n));
      }
      return leaf(value);
    }
    case "null":
      return leaf(null);
    case "struct":
      if (schema.tuple && Array.isArray(value)) return branch(schema.fields.map((f, i) => toNode(f.schema, value[i], `[${i}]`)));
      if (!schema.tuple && isObj(value)) return branch(schema.fields.map((f) => toNode(f.schema, value[f.name], f.name)));
      break;
    case "vec":
    case "array":
      // vec u8 arrives as a hex string and stays a leaf.
      if (Array.isArray(value)) return branch(value.map((v, i) => toNode(schema.inner, v, `[${i}]`)));
      break;
    case "option":
      return value === null || value === undefined ? leaf(null) : { ...toNode(schema.inner, value, label), type };
    case "result":
      if (isObj(value) && "ok" in value) return branch([toNode(schema.ok, value.ok, "ok")]);
      if (isObj(value) && "err" in value) return branch([toNode(schema.err, value.err, "err")]);
      break;
    case "enum": {
      if (typeof value === "string") return leaf(schema.variants.find((v) => sameName(v.name, value))?.name ?? value);
      const [key, inner] = isObj(value) ? Object.entries(value)[0] ?? [] : [];
      const variant = key === undefined ? undefined : schema.variants.find((v) => sameName(v.name, key));
      if (variant) return variant.schema ? branch([toNode(variant.schema, inner, variant.name)]) : leaf(variant.name);
      break;
    }
    case "map":
      if (isObj(value)) return branch(Object.entries(value).map(([k, v]) => toNode(schema.value, v, k)));
      break;
    case "recursive":
      break;
  }
  // A shape the IDL did not predict: let the shared builder infer it.
  return createNodeFromValue(value, { label, type });
}
