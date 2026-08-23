import { describe, expect, it } from "vitest";
import { readQuoteOutputAmount, type IntentQuote } from "./intentsApi";

function quoteWithAmount(amount: unknown): IntentQuote {
  return { preview: { outputs: [{ amount } as never] } } as IntentQuote;
}

describe("readQuoteOutputAmount", () => {
  it("reads a positive amount", () => {
    expect(readQuoteOutputAmount(quoteWithAmount("1000000"))).toBe(1_000_000n);
  });

  // A plain falsy check lets "0" through and builds an order that offers the
  // whole input for nothing.
  it("rejects a zero amount", () => {
    expect(readQuoteOutputAmount(quoteWithAmount("0"))).toBeNull();
  });

  it("rejects a negative amount", () => {
    expect(readQuoteOutputAmount(quoteWithAmount("-1"))).toBeNull();
  });

  it("rejects unparseable or absent amounts", () => {
    expect(readQuoteOutputAmount(quoteWithAmount("abc"))).toBeNull();
    expect(readQuoteOutputAmount(quoteWithAmount(""))).toBeNull();
    expect(readQuoteOutputAmount(quoteWithAmount(null))).toBeNull();
    expect(readQuoteOutputAmount(quoteWithAmount(undefined))).toBeNull();
    expect(readQuoteOutputAmount({} as IntentQuote)).toBeNull();
    expect(readQuoteOutputAmount(null)).toBeNull();
    expect(readQuoteOutputAmount(undefined)).toBeNull();
  });
});
