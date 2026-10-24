import { beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeCall, decodeEvent, encodeArgs, loadIdl, type SailsIdl } from "./decode";

let sails: SailsIdl;
const call = "0x304261736b65744d61726b65744846696e616c697a65536574746c656d656e746106000000000000";
const event = "0x304261736b65744d61726b65744c536574746c656d656e7446696e616c697a6564610600000000000001b0c4c5f5a001000010270000000000000000000000000000";

beforeAll(async () => {
  sails = await loadIdl(`type BasketAssetKind = enum { Vara, Bet };
service BasketMarket {
  FinalizeSettlement : (basket_id: u64) -> null;
  events {
    SettlementFinalized: struct { basket_id: u64, asset_kind: BasketAssetKind, finalized_at: u64, payout_per_share: u128 };
  }
};`);
});

it("decodes the fixture call", () => {
  expect(decodeCall(call, sails)).toEqual({ service: "BasketMarket", name: "FinalizeSettlement", value: { basket_id: 1633 }, error: null });
});

it("encodes the fixture call from named args", () => {
  expect(encodeArgs(sails, "BasketMarket", "FinalizeSettlement", "functions", { basket_id: 1633 })).toBe(call);
});

it("decodes the fixture event", () => {
  expect(decodeEvent(event, sails)).toMatchObject({ name: "SettlementFinalized", value: { basket_id: 1633, asset_kind: "Bet" }, error: null });
});

it("reads the route without an IDL", () => {
  expect(decodeCall(call, null)).toEqual({ service: "BasketMarket", name: "FinalizeSettlement", value: null, error: null });
});

it("reports a route missing from the IDL", () => {
  expect(decodeCall("0x0c466f6f0c426172", sails).error).toBe("Foo.Bar not in IDL");
});

it("flags IDL v2 payloads", () => {
  expect(decodeCall("0x474d0102", null).error).toContain("v2");
});

it("round-trips a TinyPoll IDL v2 call and separates malformed payloads", async () => {
  const v2 = await loadIdl(readFileSync(new URL("./fixtures/tinypoll.idl", import.meta.url), "utf8"));
  const vote = encodeArgs(v2, "TinyPoll", "Vote", "functions", { poll_id: 1, option_index: 0, evidence_hash: `0x${"11".repeat(32)}` });
  expect(vote).toBe(`0x474d01106a4830ea7ef29aab04000100010000000000000000${"11".repeat(32)}`);
  expect(decodeCall(vote, v2)).toEqual({ service: "TinyPoll", name: "Vote", value: { poll_id: 1, option_index: 0, evidence_hash: `0x${"11".repeat(32)}` }, error: null });
  expect(decodeCall("0x474d01", v2).error).toMatch(/^Malformed Sails v2 payload/);
  expect(decodeCall("0x1234", v2).error).toMatch(/^Malformed Sails v2 payload/);
  expect(decodeCall(call, v2).error).toBe("Legacy Sails payload, but the loaded IDL is v2");
});

it("reads a legacy constructor payload as its constructor, not raw bytes", async () => {
  const tally = await loadIdl(readFileSync("vara-simulator/fixtures/sails-tally/tally.idl", "utf8"));
  expect(decodeCall("0x0c4e6577", tally)).toEqual({ service: null, name: "New", value: {}, error: null });
});
