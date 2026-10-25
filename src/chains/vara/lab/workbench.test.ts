import { fromPlancks, toPlancks } from "../ui/AmountInput";
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { loadIdl } from "../decode";
import { parseInput } from "../dryRun";
import type { VaraCase } from "../case";
import { compareInterfaces } from "./compatibility";
import { parseMapping, transformEvent } from "./events";
import { diagnoseCase } from "./incident";
import { voucherStatus } from "./resources";
import { isReplyFor, MIRROR_ABI } from "./settlement";
import { actorId, exportRust, validateScenario } from "./scenario";
import fixture from "../../../../public/vara/scenario.json";
import { sampleCall } from "./simulation";

const idl = "service Counter { Add : (amount: u32) -> u32; };";
const id = actorId(1) as `0x${string}`;
const c: VaraCase = { format: "hexkit.vara.case", version: 1, network: { genesisHash: id, endpoint: "fixture", specVersion: 1 }, block: { hash: id, number: 1 }, extrinsicIndex: 0,
  call: { section: "gear", method: "sendMessage", signer: id, args: null, destination: id, payload: "0x", gasLimit: "1", value: "0", keepAlive: true },
  result: { success: true, error: null }, message: { id, programId: id, codeId: null, dispatchStatus: "Success", reply: null, programEvents: [] }, idl: null };

it("preserves evidence and encodings across the lab's main workflow", async () => {
  const sails = await loadIdl(idl), payload = sails.services.Counter.functions.Add.encodePayload(7);
  const compared = await compareInterfaces(idl, idl, [payload]);
  expect(compared.changes).toEqual([]);
  expect(compared.payloads[0].after.ok).toBe(true);
  const map = parseMapping('{"amount":"decoded.value.amount","missing":"decoded.value.absent"}');
  expect(transformEvent({ decoded: { value: { amount: 7 } } }, map)).toEqual({ amount: 7, missing: null });
  expect(voucherStatus(20, 10, [id], id)).toBe("Scope eligible");
  expect(diagnoseCase(c, null).statuses.map((s) => s.status)).toEqual(["Block 1 · extrinsic accepted", "Success", "Not observed", "Outcome not evaluated"]);
  const log = { topics: encodeEventTopics({ abi: MIRROR_ABI, eventName: "Reply", args: { replyCode: "0x00000000" } }), data: encodeAbiParameters([{ type: "bytes" }, { type: "uint128" }, { type: "bytes32" }], ["0x1234", 0n, id]) };
  expect(isReplyFor(log, id)).toBe(true);
  expect(isReplyFor(log, actorId(2))).toBe(false);
  const scenario = validateScenario(fixture);
  expect(exportRust(scenario)).toContain("Reply assertion, step 3");
});

it("fails closed on changed payload layouts and invalid bounds", async () => {
  const payload = (await loadIdl(idl)).services.Counter.functions.Add.encodePayload(7);
  const compared = await compareInterfaces(idl, idl.replaceAll("u32", "u64"), [payload, `${payload}ff`]);
  expect(compared.changes[0].kind).toBe("changed");
  expect(compared.payloads.every((p) => !p.after.ok)).toBe(true);
  expect(compared.payloads[1].before.ok).toBe(false);
  expect(() => parseMapping('{"x":"decoded.__proto__.x"}')).toThrow();
  expect(voucherStatus(10, 10, null, id)).toBe("Expired");
  expect(voucherStatus(20, 10, [actorId(2)], id)).toBe("Program excluded");
  expect(() => parseInput({ block: "latest", origin: id, payload: "0x", value: (2n ** 128n).toString(), gasLimit: "0" })).toThrow("u128");
  expect(() => validateScenario({ ...fixture, steps: [{ kind: "advance", label: "too far", blocks: 257 }] })).toThrow();
});

describe("VARA amount entry", () => {
  it("converts decimal VARA exactly, including one planck and the largest balance", () => {
    expect(toPlancks("1.5")).toBe("1500000000000");
    expect(toPlancks("0.000000000001")).toBe("1");
    const maximum = (2n ** 128n - 1n).toString();
    expect(toPlancks(fromPlancks(maximum))).toBe(maximum);
  });
  it("rejects excess precision instead of rounding a user's amount", () => {
    expect(() => toPlancks("1.0000000000001")).toThrow("12 decimal places");
  });
});

it("loads a real sample's exact call against the preceding block", () => {
  const source = { ...c, block: { ...c.block, number: 100 }, call: { ...c.call, payload: "0xabcd" as const, value: "1234567890123456789" } };
  expect(sampleCall(source, id)).toEqual({ program: id, origin: id, payload: "0xabcd", value: "1234567890123456789", gasLimit: "1", block: "99" });
});

it("refuses a sample when the queued message cannot be matched to its call", () => {
  expect(() => sampleCall(c, actorId(2))).toThrow("cannot be reconstructed");
  expect(() => sampleCall({ ...c, call: { ...c.call, payload: null } }, id)).toThrow("cannot be reconstructed");
});
