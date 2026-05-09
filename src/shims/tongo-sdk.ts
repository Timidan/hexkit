/**
 * Stub for the starkzap@2 optional peer dep `@fatsolutions/tongo-sdk`. The
 * confidential-payments module in starkzap imports `Account` from this SDK;
 * we don't use confidential payments, so the code path never runs — but
 * Rollup needs the symbol to resolve at build time.
 */
export class Account {
  constructor() {
    throw new Error("tongo-sdk not installed (confidential payments disabled)");
  }
}
export default { Account };
