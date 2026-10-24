import { z } from "zod";
import type { VaraCase } from "../case";

const id = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Use a 32-byte actor id");
const bytes = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, "Use hex bytes");
const amount = z.string().regex(/^\d+$/, "Use an unsigned integer").refine((v) => BigInt(v) < 2n ** 128n, "Amount exceeds u128");
const label = z.string().max(120);
const blocks = z.number().int().min(0).max(256);
export const ScenarioSchema = z.object({
  version: z.literal(1), name: label,
  accounts: z.array(z.object({ id, balance: amount }).strict()).min(1).max(32),
  programs: z.array(z.object({ id, name: label, balance: amount, wasm: bytes.max(8 * 1024 * 1024 + 2).nullable(), mock: z.object({ reply: bytes.max(131074), fail: z.boolean() }).nullable(), idl: z.string().max(2 * 1024 * 1024).nullable() }).strict()).min(1).max(8),
  steps: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("send"), label, program: id, sender: id, payload: bytes.max(131074), value: amount, gasLimit: amount, blocks }).strict(),
    z.object({ kind: z.literal("advance"), label, blocks }).strict(),
    z.object({ kind: z.literal("expectReply"), label, message: z.number().int().min(0), payload: bytes.max(131074) }).strict(),
    z.object({ kind: z.literal("expectStatus"), label, message: z.number().int().min(0), status: z.enum(["success", "failed"]) }).strict(),
    z.object({ kind: z.literal("expectBalance"), label, account: id, equals: amount }).strict(),
  ])).min(1).max(128),
}).strict();
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioStep = Scenario["steps"][number];
export type ScenarioProgram = Scenario["programs"][number];
export interface ScenarioReport {
  runtime: string; name: string; block: number; assertions: number; passed: boolean | null;
  steps: { index: number; label: string; block: number; messageId: string | null; status: string; gasBurned: string; detail: string | null;
    balances: { id: string; before: string; after: string }[];
    logs: { block: number; id: string; source: string; destination: string; payload: string; replyTo: string | null; replyCode: string | null; success: boolean | null }[];
  }[];
}

export const SIMULATOR_URL = (import.meta.env.VITE_VARA_SIMULATOR_URL?.trim() || "http://127.0.0.1:5791").replace(/\/+$/, "");
export const IS_LOCAL_SIMULATOR = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(SIMULATOR_URL);
const IS_PROXIED_SIMULATOR = new URL(SIMULATOR_URL, "http://localhost").pathname === "/api/vara-sim";
const PROXY_SIZE_ERROR = "Scenario exceeds the hosted simulator's 4 MiB JSON limit (including hex-encoded WASM and IDL). Use smaller inputs or export JSON and run it with a local HexKit runtime.";
export const actorId = (n: number) => `0x${Array.from({ length: 32 }, (_, i) => i < 4 ? ((n >>> (i * 8)) & 255).toString(16).padStart(2, "0") : "00").join("")}`;
export const DEFAULT_GAS = "200000000000";
export function newScenario(): Scenario {
  return { version: 1, name: "Untitled scenario", accounts: [{ id: actorId(100001), balance: "1000000000000000000" }],
    programs: [{ id: actorId(1), name: "Program A", balance: "10000000000000", wasm: null, mock: null, idl: null }],
    steps: [{ kind: "send", label: "Initialize Program A", program: actorId(1), sender: actorId(100001), payload: "0x", value: "0", gasLimit: DEFAULT_GAS, blocks: 1 }],
  };
}

export function validateScenario(value: unknown): Scenario {
  const parsed = ScenarioSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
  const s = parsed.data, actors = [...s.accounts, ...s.programs].map((a) => a.id.toLowerCase());
  if (new Set(actors).size !== actors.length || actors.includes(actorId(0))) throw new Error("Actor ids must be unique and nonzero");
  for (const p of s.programs) {
    if (!!p.wasm === !!p.mock) throw new Error(`${p.name}: upload WASM or choose a mock dependency`);
    if (p.wasm && !p.wasm.startsWith("0x0061736d01000000")) throw new Error(`${p.name}: invalid WASM header`);
  }
  let count = 0;
  s.steps.forEach((step, i) => {
    if ("blocks" in step) count += step.blocks;
    if (step.kind === "send") {
      if (!s.programs.some((p) => p.id.toLowerCase() === step.program.toLowerCase()) || !s.accounts.some((a) => a.id.toLowerCase() === step.sender.toLowerCase())) throw new Error(`Step ${i + 1}: choose a configured program and sender`);
      if (BigInt(step.gasLimit) < 1n || BigInt(step.gasLimit) > 750000000000n) throw new Error(`Step ${i + 1}: gas must be between 1 and 750000000000`);
    }
    if ("message" in step && (step.message >= i || s.steps[step.message]?.kind !== "send")) throw new Error(`Step ${i + 1}: select an earlier message`);
    if (step.kind === "expectBalance" && !actors.includes(step.account.toLowerCase())) throw new Error(`Step ${i + 1}: unknown account`);
  });
  if (count > 256) throw new Error("A scenario may advance at most 256 blocks");
  return s;
}

export function scenarioFromCase(c: VaraCase): Scenario {
  if (!c.call.destination || !c.call.payload || !c.call.signer) throw new Error("This case does not contain a reconstructable message call");
  const s = newScenario();
  s.name = `Case ${c.block.number}-${c.extrinsicIndex}`;
  s.accounts[0].id = c.call.signer;
  s.programs[0] = { ...s.programs[0], id: c.call.destination, name: "Case program", idl: c.idl };
  s.steps = [
    { ...s.steps[0] as Extract<ScenarioStep, { kind: "send" }>, program: c.call.destination, sender: c.call.signer, label: "Initialize with your constructor payload" },
    { kind: "send", label: "Imported message", program: c.call.destination, sender: c.call.signer, payload: c.call.payload, value: c.call.value ?? "0", gasLimit: c.call.gasLimit ?? DEFAULT_GAS, blocks: 1 },
  ];
  return s;
}

export async function runScenario(s: Scenario, signal: AbortSignal): Promise<ScenarioReport> {
  const payload = JSON.stringify(validateScenario(s));
  // Keep the proxy limit in sync with api/vara-sim-proxy.ts; local runs retain the bridge's 48 MiB limit.
  if (IS_PROXIED_SIMULATOR && new TextEncoder().encode(payload).byteLength > 4 * 1024 * 1024) throw new Error(PROXY_SIZE_ERROR);
  const response = await fetch(`${SIMULATOR_URL}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal });
  if (IS_PROXIED_SIMULATOR && response.status === 413) throw new Error(PROXY_SIZE_ERROR);
  const body = await response.json().catch(() => { throw new Error(`Simulator returned HTTP ${response.status} without a JSON report. Try again or use a local runtime.`); });
  if (!response.ok || body.error) throw new Error(body.error || `Simulator returned HTTP ${response.status}`);
  if (body.runtime !== "gtest 2.0.0" || !Array.isArray(body.steps)) throw new Error("Invalid simulator report");
  return body;
}

export function exportRust(scenario: Scenario): string {
  const s = validateScenario(scenario);
  if (!s.steps.some((step) => step.kind.startsWith("expect"))) throw new Error("Add a reply, status, or balance assertion before exporting a regression test");
  const b = (s: string) => `hex::decode("${s.slice(2)}").unwrap()`;
  const a = (s: string) => `actor("${s.slice(2)}")`;
  const lines = ["// Dependencies: gtest = \"=2.0.0\", hex = \"0.4\"", "// Save under tests/ and run cargo test. Local fixtures; no chain state is imported.", "use gtest::{Program, System};", "fn actor(s: &str) -> [u8; 32] { hex::decode(s).unwrap().try_into().unwrap() }", "#[test]", "fn scenario() {", "    let sys = System::new();", "    let mut blocks = Vec::new();"];
  for (const account of s.accounts) lines.push(`    sys.mint_to(${a(account.id)}, ${account.balance}_u128);`);
  for (const p of s.programs) {
    if (BigInt(p.balance)) lines.push(`    sys.mint_to(${a(p.id)}, ${p.balance}_u128);`);
    if (p.wasm) lines.push(`    Program::from_binary_with_id(&sys, ${a(p.id)}, ${b(p.wasm)});`);
    else lines.push(`    Program::mock_with_id(&sys, ${a(p.id)}, Dependency { reply: ${b(p.mock!.reply)}, fail: ${p.mock!.fail} });`);
  }
  s.steps.forEach((step, i) => {
    if (step.kind === "send") lines.push(`    let m${i} = sys.get_program(${a(step.program)}).unwrap().send_bytes_with_gas(${a(step.sender)}, ${b(step.payload)}, ${step.gasLimit}_u64, ${step.value}_u128);`);
    if ("blocks" in step) lines.push(`    for _ in 0..${step.blocks} { blocks.push(sys.run_next_block()); }`);
    if (step.kind === "expectReply") lines.push(`    assert!(blocks.iter().flat_map(|b| b.log()).any(|l| l.reply_to() == Some(m${step.message}) && l.reply_code().is_some_and(|c| c.is_success()) && l.payload() == ${b(step.payload)}), "Reply assertion, step ${i + 1}");`);
    if (step.kind === "expectStatus") lines.push(step.status === "failed" ? `    assert!(blocks.iter().any(|b| b.failed.contains(&m${step.message})), "Failure assertion, step ${i + 1}");` : `    assert!(!blocks.iter().any(|b| b.failed.contains(&m${step.message})) && blocks.iter().any(|b| b.succeed.contains(&m${step.message})), "Success assertion, step ${i + 1}");`);
    if (step.kind === "expectBalance") lines.push(`    assert_eq!(sys.balance_of(${a(step.account)}), ${step.equals}_u128, "Balance assertion, step ${i + 1}");`);
  });
  lines.push("}");
  if (s.programs.some((p) => p.mock)) lines.push(`
#[derive(Debug, Clone)]
struct Dependency { reply: Vec<u8>, fail: bool }
impl gtest::WasmProgram for Dependency {
    fn init(&mut self, _: Vec<u8>) -> Result<Option<Vec<u8>>, &'static str> { Ok(None) }
    fn handle(&mut self, _: Vec<u8>) -> Result<Option<Vec<u8>>, &'static str> { if self.fail { Err("Injected dependency failure") } else { Ok(Some(self.reply.clone())) } }
    fn state(&mut self) -> Result<Vec<u8>, &'static str> { Ok(vec![]) }
    fn clone_boxed(&self) -> Box<dyn gtest::WasmProgram> { Box::new(self.clone()) }
}`);
  return lines.join("\n");
}
