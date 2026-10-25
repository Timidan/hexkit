import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { decodeCall } from "./decode";
import { defaultFormValue, encodeMethod, loadIdlModel } from "./idlForm";

let loaded: Awaited<ReturnType<typeof loadIdlModel>>;
const method = (name: string) => loaded.model.services[0].methods.find((method) => method.name === name)!;

beforeAll(async () => {
  loaded = await loadIdlModel(`
type Outcome = enum { YES, NO };
type BasketAssetKind = enum { Vara, Bet };
type BasketItem = struct {
  poly_market_id: str, poly_slug: str, weight_bps: u16, selected_outcome: Outcome, end_timestamp: u64
};
type Settlement = struct {
  basket_id: u64, proposer: actor_id, item_resolutions: vec ItemResolution, payout_per_share: u128,
  payload: str, proposed_at: u64, challenge_deadline: u64, finalized_at: opt u64, status: SettlementStatus
};
type ItemResolution = struct {
  item_index: u8, resolved: Outcome, poly_slug: str, poly_condition_id: opt str, poly_price_yes: u16, poly_price_no: u16
};
type SettlementStatus = enum { Proposed, Finalized };
type BasketMarketError = enum { Unauthorized, Paused, BasketNotFound };
service BasketMarket {
  CreateBasket : (name: str, description: str, items: vec BasketItem, asset_kind: BasketAssetKind) -> u64;
  FinalizeSettlement : (basket_id: u64) -> null;
  query GetSettlement : (basket_id: u64) -> result (Settlement, BasketMarketError);
};`);
});

it("models BasketMarket methods and their form defaults", () => {
  expect(loaded.model.services[0].name).toBe("BasketMarket");
  const create = method("CreateBasket");
  expect(create.params).toMatchObject([
    { name: "name", schema: { kind: "primitive", type: "str" } },
    { name: "description", schema: { kind: "primitive", type: "str" } },
    { name: "items", schema: { kind: "vec", inner: { kind: "struct", name: "BasketItem" } } },
    { name: "asset_kind", schema: { kind: "enum", name: "BasketAssetKind" } },
  ]);
  expect(create.params.map((param) => defaultFormValue(param.schema))).toEqual(["", "", [], { variant: "Vara", value: null }]);
  expect(method("GetSettlement")).toMatchObject({ kind: "query", returns: { kind: "result", ok: { kind: "struct", name: "Settlement" } } });
});

it("encodes FinalizeSettlement to the fixture payload", () => {
  expect(encodeMethod(loaded.sails, method("FinalizeSettlement"), ["1633"])).toBe("0x304261736b65744d61726b65744846696e616c697a65536574746c656d656e746106000000000000");
});

it("round-trips a filled CreateBasket form", () => {
  const payload = encodeMethod(loaded.sails, method("CreateBasket"), ["n", "d", [{
    poly_market_id: "a", poly_slug: "b", weight_bps: "5000", selected_outcome: { variant: "YES", value: null }, end_timestamp: "123",
  }], { variant: "Bet", value: null }]);
  expect(decodeCall(payload, loaded.sails)).toMatchObject({ error: null, value: {
    name: "n", description: "d", items: [{ poly_market_id: "a", poly_slug: "b", weight_bps: 5000, selected_outcome: "YES", end_timestamp: 123 }], asset_kind: "Bet",
  } });
});

it("reports the argument path for invalid unsigned input", () => {
  expect(() => encodeMethod(loaded.sails, method("FinalizeSettlement"), ["-1"])).toThrow("basket_id: must be unsigned");
});

it("models and encodes a TinyPoll IDL v2 form", async () => {
  const v2 = await loadIdlModel(readFileSync(new URL("./fixtures/tinypoll.idl", import.meta.url), "utf8"));
  const create = v2.model.services[0].methods.find((m) => m.name === "CreatePoll")!;
  expect(create.params[0].schema).toMatchObject({ kind: "struct", name: "PollInput", fields: [{ name: "question_hash", schema: { kind: "array", len: 32 } }, { name: "option_labels", schema: { kind: "vec" } }, { name: "closes_at" }] });
  const payload = encodeMethod(v2.sails, create, [{ question_hash: Array(32).fill("1"), option_labels: ["yes", "no"], closes_at: "9" }]);
  expect(decodeCall(payload, v2.sails)).toMatchObject({ service: "TinyPoll", name: "CreatePoll", error: null, value: { input: { option_labels: ["yes", "no"], closes_at: 9 } } });
});
