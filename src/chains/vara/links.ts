import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { decodeSs58, encodeSs58, VARA_SS58_PREFIX } from "./address";
import type { Hex } from "./model";

const IDEA = "https://idea.gear-tech.io";
const NODE = "?node=wss%3A%2F%2Frpc.vara.network";
const ID = /^0x[0-9a-fA-F]{64}$/;

export const subscanExtrinsic = (block: number, index: number): string => `https://vara.subscan.io/extrinsic/${block}-${index}`;
export const subscanBlock = (block: number): string => `https://vara.subscan.io/block/${block}`;
export const subscanAccount = (hexOrSs58: string): string => `https://vara.subscan.io/account/${ID.test(hexOrSs58) ? encodeSs58(hexToBytes(hexOrSs58.slice(2)), VARA_SS58_PREFIX) : hexOrSs58}`;
export const ideaProgramUrl = (id: Hex): string => `${IDEA}/programs/${id}${NODE}`;
export const ideaMessageUrl = (id: Hex): string => `${IDEA}/messages/${id}${NODE}`;
export const ideaCodeUrl = (id: Hex): string => `${IDEA}/code/${id}${NODE}`;
export const ideaBlockUrl = (block: number): string => `${IDEA}/explorer/${block}${NODE}`;

type VaraInput =
  | { kind: "extrinsic"; block: number; index: number; messageIndex?: number }
  | { kind: "message"; id: Hex }
  | { kind: "program"; id: Hex };

function actorId(value: string): Hex | null {
  if (ID.test(value)) return value.toLowerCase() as Hex;
  try { return `0x${bytesToHex(decodeSs58(value))}`; } catch { return null; }
}

function extrinsic(value: string): Extract<VaraInput, { kind: "extrinsic" }> | null {
  const match = /^(\d+)-(\d+)(?:#(\d+))?$/.exec(value);
  if (!match) return null;
  const block = Number(match[1]), index = Number(match[2]);
  const messageIndex = match[3] === undefined ? undefined : Number(match[3]);
  if (![block, index, messageIndex ?? 0].every(Number.isSafeInteger)) return null;
  return { kind: "extrinsic", block, index, ...(messageIndex === undefined ? {} : { messageIndex }) };
}

export function parseVaraInput(input: string, hexAs: "message" | "program"): VaraInput | null {
  const value = input.trim();
  const tx = extrinsic(value);
  if (tx) return tx;
  const id = actorId(value);
  if (id) return { kind: hexAs, id };
  try {
    const url = new URL(/^(vara\.subscan\.io|idea\.gear-tech\.io)\//i.test(value) ? `https://${value}` : value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const [, route, target = ""] = url.pathname.split("/");
    if (url.host === "vara.subscan.io") {
      if (route === "extrinsic") return extrinsic(target);
      const account = route === "account" ? actorId(target) : null;
      return account ? { kind: hexAs, id: account } : null;
    }
    if (url.host === "idea.gear-tech.io" && ID.test(target)) {
      if (route === "programs" || route === "messages") return { kind: route === "programs" ? "program" : "message", id: target.toLowerCase() as Hex };
    }
  } catch { /* not an explorer URL */ }
  return null;
}

const q = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'";

// Values reach a shell when the user pastes these commands, and some come from imported case
// files, so every value is validated and single-quoted.
const HEXBYTES = /^0x([0-9a-fA-F]{2})*$/;
const DIGITS = /^\d+$/;
const NAME = /^[A-Za-z_]\w*$/;
function must(ok: boolean, what: string): void {
  if (!ok) throw new Error(`Invalid ${what} for a vara-wallet command`);
}

export function varaWalletCall({ programId, service, method, args, value, idlFile }: { programId: Hex; service: string; method: string; args: unknown[]; value?: string; idlFile: string }): string {
  must(ID.test(programId), "program id");
  must(NAME.test(service) && NAME.test(method), "service or method name");
  must(value === undefined || value === "" || DIGITS.test(value), "value");
  const json = JSON.stringify(args, (_, v) => typeof v === "bigint" ? v.toString() : v);
  return `vara-wallet --network mainnet call ${q(programId)} ${q(`${service}/${method}`)} --args ${q(json)} --idl ${q(idlFile)}`
    + (value && value !== "0" ? ` --value ${q(value)} --units raw` : "");
}

export function varaWalletCalculateReply({ programId, payload, origin, atHash, value }: { programId: Hex; payload: Hex; origin: Hex; atHash: Hex | null; value: string }): string {
  must(ID.test(programId) && ID.test(origin), "program or origin id");
  must(HEXBYTES.test(payload), "payload");
  must(atHash === null || ID.test(atHash), "block hash");
  must(DIGITS.test(value), "value");
  return `vara-wallet --ws wss://archive-rpc.vara.network message calculate-reply ${q(programId)} --payload ${q(payload)} --origin ${q(origin)}`
    + (atHash ? ` --at ${q(atHash)}` : "") + ` --value ${q(value)} --units raw`;
}
