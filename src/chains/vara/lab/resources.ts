import { getVaraApi } from "../case";
import { dryRun } from "../dryRun";
import { prepareCall } from "./simulation";
import type { CallInput } from "./CallComposer";
import { errorText } from "./files";
import type { PalletGearVoucherInternalVoucherInfo } from "@gear-js/api";
import type { Option } from "@polkadot/types";

export function voucherStatus(expiry: number, block: number, programs: string[] | null, destination: string) {
  if (expiry <= block) return "Expired";
  return programs === null || programs.some((id) => id.toLowerCase() === destination.toLowerCase()) ? "Scope eligible" : "Program excluded";
}

export async function preflight(call: CallInput) {
  const { programId, input } = prepareCall(call);
  const api = await getVaraApi();
  const reply = await dryRun(programId, input, null);
  if (!reply.block) throw new Error(reply.error ?? "Snapshot unavailable");
  const at = await api.at(reply.block.hash);
  const [sender, program] = await Promise.all([at.query.system.account(input.origin), at.query.system.account(programId)]);
  const funds = (account: typeof sender) => ({ free: account.data.free.toString(), frozen: account.data.frozen.toString(), available: (BigInt(account.data.free.toString()) > BigInt(account.data.frozen.toString()) ? BigInt(account.data.free.toString()) - BigInt(account.data.frozen.toString()) : 0n).toString() });
  const senderBalance = funds(sender);
  const warnings: string[] = [];
  let gas: { minLimit: string; burned: string; reserved: string; mayBeReturned: string; waited: boolean; purchase: string; transactionFee: string; limit: string } | null = null;
  let gasError: string | null = null;
  // The installed Gear SDK estimates gas at the current head, not the historical reply snapshot.
  const estimatedAt = new Date().toISOString();
  try {
    const info = await api.program.calculateGas.handle(input.origin, programId, input.payload, input.value, false);
    const limit = input.gasLimit || (BigInt(info.min_limit.toString()) * 110n + 99n) / 100n;
    const tx = api.tx.gear.sendMessage(programId, input.payload, limit, input.value, true);
    const fee = await tx.paymentInfo(input.origin);
    const purchase = limit * BigInt(api.valuePerGas.toString());
    gas = { minLimit: info.min_limit.toString(), burned: info.burned.toString(), reserved: info.reserved.toString(), mayBeReturned: info.may_be_returned.toString(), waited: info.waited.isTrue, purchase: purchase.toString(), transactionFee: fee.partialFee.toString(), limit: limit.toString() };
    if (limit < BigInt(gas.minLimit)) warnings.push("The supplied gas limit is below the current estimate.");
    if (limit > BigInt(api.blockGasLimit.toString())) warnings.push("The proposed gas limit exceeds the current block gas limit.");
    if (BigInt(senderBalance.available) < input.value + purchase + BigInt(gas.transactionFee) + BigInt(api.existentialDeposit.toString())) warnings.push("The sender snapshot does not cover value, gas purchase, the estimated transaction fee, and a keep-alive deposit without sponsorship.");
    if (gas.waited) warnings.push("Execution entered the waitlist. An estimate does not establish that a later reply will arrive.");
  } catch (err) { gasError = errorText(err); }
  let vouchers: { id: string; owner: string; expiry: number; programs: string[] | null; status: string; balance: ReturnType<typeof funds>; estimatedFee: string | null; coversGasAndFee: boolean | null }[] | null = null;
  let voucherError: string | null = null;
  try {
    const entries = await at.query.gearVoucher.vouchers.entries(input.origin);
    if (entries.length > 100) warnings.push("Showing the first 100 vouchers for this sender.");
    vouchers = [];
    for (const [key, value] of entries.slice(0, 100)) {
      const voucher = value as unknown as Option<PalletGearVoucherInternalVoucherInfo>;
      if (voucher.isNone) continue;
      const id = key.args[1].toHex();
      const v = voucher.unwrap();
      const programs = v.programs.isSome ? Array.from(v.programs.unwrap(), (p) => p.toHex()) : null;
      const balance = funds(await at.query.system.account(id));
      let estimatedFee: string | null = null;
      if (gas) {
        try {
          const tx = api.tx.gearVoucher.call(id, { SendMessage: { destination: programId, payload: input.payload, gasLimit: gas.limit, value: input.value, keepAlive: true } });
          estimatedFee = (await tx.paymentInfo(input.origin)).partialFee.toString();
        } catch { /* Fee availability is independent of voucher existence. */ }
      }
      vouchers.push({ id, owner: v.owner.toHex(), expiry: v.expiry.toNumber(), programs, status: voucherStatus(v.expiry.toNumber(), reply.block.number, programs, programId), balance, estimatedFee, coversGasAndFee: gas && estimatedFee !== null ? BigInt(balance.available) >= BigInt(gas.purchase) + BigInt(estimatedFee) : null });
    }
  } catch (err) { voucherError = errorText(err); }
  if (BigInt(senderBalance.available) < input.value) warnings.push("Vouchers do not fund the attached value. The sender snapshot lacks that value.");
  return { input: call, reply, senderBalance, programBalance: funds(program), gas, gasError, estimatedAt, vouchers, voucherError, warnings };
}
