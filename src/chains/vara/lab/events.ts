import type { FieldSchema, IdlModel } from "../model";

export function parseMapping(text: string): Record<string, string> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 32) throw new Error("Mapping must be an object with at most 32 output columns");
  for (const [key, path] of Object.entries(value)) {
    if (!key || typeof path !== "string" || !/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(path) || path.split(".").some((p) => ["__proto__", "constructor", "prototype"].includes(p))) throw new Error("Use dot paths such as decoded.value.amount; executable expressions are not supported");
  }
  return value as Record<string, string>;
}
export function transformEvent(event: unknown, mapping: Record<string, string>) {
  return Object.fromEntries(Object.entries(mapping).map(([key, path]) => {
    let value = event;
    for (const part of path.split(".")) value = value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, part) ? (value as Record<string, unknown>)[part] : null;
    return [key, value ?? null];
  }));
}

function tsType(s: FieldSchema | null): string {
  if (!s || s.kind === "null") return "null";
  switch (s.kind) {
    case "primitive": return s.type === "bool" ? "boolean" : /^(u|i|nat)\d+$/.test(s.type) ? "number | string" : "string";
    case "struct": return s.tuple ? `[${s.fields.map((f) => tsType(f.schema)).join(", ")}]` : `{ ${s.fields.map((f) => `${JSON.stringify(f.name)}: ${tsType(f.schema)}`).join("; ")} }`;
    case "enum": return s.variants.map((v) => v.schema ? `{ ${JSON.stringify(v.name)}: ${tsType(v.schema)} }` : JSON.stringify(v.name)).join(" | ") || "never";
    case "option": return `${tsType(s.inner)} | null`;
    case "result": return `{ ok: ${tsType(s.ok)} } | { err: ${tsType(s.err)} }`;
    case "vec": case "array": return s.inner.kind === "primitive" && s.inner.type === "u8" ? "string | number[]" : `Array<${tsType(s.inner)}>`;
    case "map": return `Array<[${tsType(s.key)}, ${tsType(s.value)}]>`;
    case "recursive": return "unknown";
  }
}

export function exportEventHandler(programId: string, idl: string, model: IdlModel, mapping: Record<string, string>) {
  const union = model.services.flatMap((s) => s.events.map((e) => `  | { service: ${JSON.stringify(s.name)}; name: ${JSON.stringify(e.name)}; value: ${tsType(e.schema)} }`)).join("\n") || "  never";
  return `// Generated from the supplied Sails IDL v1. Requires sails-js and sails-js-parser.\n// Feed finalized Gear.UserMessageSent events from your existing indexer.\n// Deduplicate by block hash + message id and handle indexer rollbacks upstream.\nimport { Sails, getServiceNamePrefix, getFnNamePrefix } from "sails-js";\nimport { SailsIdlParser } from "sails-js-parser";\n\nexport type ProgramEvent =\n${union};\nexport interface IndexedMessage { block: number; hash: string; timestamp: number; id: string; source: string; destination: string; payload: \`0x\${string}\`; value: string; details?: unknown }\nconst program = ${JSON.stringify(programId.toLowerCase())};\nconst idl = ${JSON.stringify(idl)};\nconst mapping: Record<string, string> = ${JSON.stringify(mapping, null, 2)};\nlet loaded: Promise<Sails> | undefined;\n\nexport async function handleEvent(message: IndexedMessage): Promise<{ event: ProgramEvent; row: Record<string, unknown> } | null> {\n  if (message.source.toLowerCase() !== program || message.destination !== "0x" + "00".repeat(32) || message.details != null) return null;\n  const sails = await (loaded ??= SailsIdlParser.new().then(parser => new Sails(parser).parseIdl(idl)));\n  const { service } = getServiceNamePrefix(message.payload, true);\n  const { fn: name } = getFnNamePrefix(message.payload, true);\n  const decoder = sails.services[service]?.events[name];\n  if (!decoder) throw new Error(\`Unknown event \${service}.\${name}\`);\n  const decoded = { service, name, value: decoder.decode(message.payload) };\n  const input = { ...message, decoded };\n  const row = Object.fromEntries(Object.entries(mapping).map(([key, path]) => {\n    let value: unknown = input;\n    for (const part of path.split(".")) value = value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, part) ? (value as Record<string, unknown>)[part] : null;\n    return [key, value ?? null];\n  }));\n  return { event: decoded as ProgramEvent, row };\n}\n`;
}
