// Per-tab field map for the parity harness. Each field has the
// instructions both sides need to extract the same conceptual datum.
//
// `extract` is a tagged action interpreted by capture.ts:
//   {kind: "text", locator}                 — element text content
//   {kind: "count", locator}                — number of matching elements
//   {kind: "exists", locator}               — boolean presence
//   {kind: "innerText", locator}            — multi-line text body
//   {kind: "attr", locator, attr}           — attribute value
//
// Locators are Playwright selector strings (`role=row[name=/foo/i]`,
// `[data-testid=…]`, `text=Sender`). The harness runs each locator
// against the corresponding page session.

export type Extract =
  | { kind: "text"; locator: string }
  | { kind: "count"; locator: string }
  | { kind: "exists"; locator: string }
  | { kind: "innerText"; locator: string }
  | { kind: "attr"; locator: string; attr: string };

export interface FieldSpec {
  /** Voyager-side extraction. */
  theirs: Extract;
  /** Our-side extraction. */
  ours: Extract;
  /** Optional post-processor; runs on the captured value. Useful for
   *  collapsing differing hex / decimal / labelling encodings to a
   *  comparable form. Return null to mark "not present". */
  normalize?: (value: string | number | boolean | null) => string | null;
  /** Higher = more important to fix. 1 = critical, 3 = polish. */
  weight?: 1 | 2 | 3;
}

export interface TabSpec {
  /** Outer page tab to land on. URL hash or query for our side, query
   *  for Voyager (`#overview`, `#events`, `#internalCalls`,
   *  `#storageDiffs`, `#messages`). */
  voyagerHash: string;
  ourTab: "trace" | "events" | "state" | "messages" | "flow" | "dev" | "raw";
  fields: Record<string, FieldSpec>;
}

const norm = {
  /** Drop leading zeros, lowercase, strip whitespace. */
  hex: (v: string | number | boolean | null): string | null => {
    if (typeof v !== "string") return null;
    const m = v.match(/0x[0-9a-fA-F]+/);
    if (!m) return null;
    return "0x" + m[0].slice(2).replace(/^0+/, "").toLowerCase();
  },
  /** Strip token suffixes / commas to compare amounts. */
  amount: (v: string | number | boolean | null): string | null => {
    if (typeof v !== "string") return null;
    const m = v.match(/[\d,]+(\.\d+)?/);
    if (!m) return null;
    return m[0].replace(/,/g, "");
  },
  /** Pull just the digits — handy for block numbers / nonces. */
  digits: (v: string | number | boolean | null): string | null => {
    if (v == null) return null;
    const s = String(v).replace(/[\s,]/g, "");
    const m = s.match(/\d+/);
    return m ? m[0] : null;
  },
  /** Trim + lowercase. */
  text: (v: string | number | boolean | null): string | null =>
    v == null ? null : String(v).trim().toLowerCase(),
  /** Pass-through, just stringify. */
  raw: (v: string | number | boolean | null): string | null =>
    v == null ? null : String(v).trim(),
};

export const SCHEMA: Record<string, TabSpec> = {
  overview: {
    voyagerHash: "#overview",
    ourTab: "trace",
    fields: {
      txHash: {
        theirs: { kind: "text", locator: "text=/^0x[0-9a-f]{60,}/i >> nth=0" },
        ours: { kind: "attr", locator: "[data-testid=explorer-link-voyager]", attr: "href" },
        normalize: norm.hex,
        weight: 1,
      },
      status: {
        theirs: { kind: "text", locator: "text=/TRANSACTION EXECUTED|REVERTED|REJECTED/" },
        ours: { kind: "text", locator: "[data-status]" },
        normalize: norm.text,
        weight: 1,
      },
      blockNumber: {
        theirs: { kind: "text", locator: "text=/^Block Number/i >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-summary-row=block]" },
        normalize: norm.digits,
        weight: 1,
      },
      sender: {
        theirs: { kind: "text", locator: "text=/^Sender Address$/ >> .. >> text=/0x/" },
        ours: { kind: "text", locator: "[data-summary-row=sender]" },
        normalize: norm.hex,
        weight: 1,
      },
      feeAmount: {
        theirs: { kind: "text", locator: "text=Actual Fee >> xpath=following-sibling::* >> text=/STRK|ETH|FRI/" },
        ours: { kind: "text", locator: "[data-summary-row=fee]" },
        normalize: norm.amount,
        weight: 1,
      },
      feeRecipient: {
        theirs: { kind: "text", locator: "text=/^To:$/ >> xpath=following-sibling::* | xpath=parent::*/text()" },
        ours: { kind: "text", locator: "[data-summary-row=fee] >> text=/Sequencer/i" },
        normalize: norm.text,
        weight: 2,
      },
      l1GasConsumed: {
        theirs: { kind: "text", locator: "text=/^L1 Gas$/ >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-summary-row=l1Gas]" },
        normalize: norm.digits,
        weight: 1,
      },
      l1DataGasConsumed: {
        theirs: { kind: "text", locator: "text=/^L1 Data Gas$/ >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-summary-row=l1DataGas]" },
        normalize: norm.digits,
        weight: 1,
      },
      l2GasConsumed: {
        theirs: { kind: "text", locator: "text=/^L2 Gas$/ >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-summary-row=l2Gas]" },
        normalize: norm.digits,
        weight: 1,
      },
      sponsoredBy: {
        theirs: { kind: "text", locator: "text=/^Sponsored by$/ >> .. >> text=/0x/" },
        ours: { kind: "text", locator: "[data-summary-row=sender] >> text=/sponsored/i" },
        normalize: norm.hex,
        weight: 2,
      },
      l1TxHash: {
        theirs: { kind: "text", locator: "text=/^L1 TXN Hash$/ >> xpath=following-sibling::*" },
        ours: { kind: "text", locator: "[data-dev-row=l1TxHash]" },
        normalize: norm.hex,
        weight: 2,
      },
      nonce: {
        theirs: { kind: "text", locator: "text=/^Nonce$/ >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-dev-row=nonce]" },
        normalize: norm.digits,
        weight: 1,
      },
      version: {
        theirs: { kind: "text", locator: "text=/^Version$/ >> .. >> text=/\\d/" },
        ours: { kind: "text", locator: "[data-dev-row=version]" },
        normalize: norm.text,
        weight: 1,
      },
      tip: {
        theirs: { kind: "text", locator: "text=/^Tip$/ >> .. >> text=/0x|\\d/" },
        ours: { kind: "text", locator: "[data-dev-row=tip]" },
        normalize: norm.hex,
        weight: 2,
      },
      signatureCount: {
        theirs: { kind: "count", locator: "text=/^Signature\\(s\\)$/ >> .. >> text=/^0x/" },
        ours: { kind: "count", locator: "[data-dev-row=signature] >> text=/0x/" },
        normalize: norm.digits,
        weight: 2,
      },
    },
  },
  events: {
    voyagerHash: "#events",
    ourTab: "events",
    fields: {
      eventCount: {
        theirs: { kind: "count", locator: "table tbody tr" },
        ours: { kind: "count", locator: "table tbody tr" },
        normalize: norm.digits,
        weight: 1,
      },
      hasIdColumn: {
        theirs: { kind: "exists", locator: "text=/^9\\d{6,}_\\d+_\\d+/" },
        ours: { kind: "exists", locator: "text=/^9\\d{6,}_\\d+_\\d+/" },
        weight: 2,
      },
      hasDecodedTransfer: {
        theirs: { kind: "exists", locator: "text=/^Transfer$/" },
        ours: { kind: "exists", locator: "text=/Transfer/" },
        weight: 1,
      },
      hasDecodedTxExecuted: {
        theirs: { kind: "exists", locator: "text=/TransactionExecuted/" },
        ours: { kind: "exists", locator: "text=/TransactionExecuted/" },
        weight: 1,
      },
    },
  },
  internalCalls: {
    voyagerHash: "#internalCalls",
    ourTab: "trace",
    fields: {
      callCount: {
        theirs: { kind: "count", locator: "text=/^More Details$/" },
        ours: { kind: "count", locator: "[data-frame-row]" },
        normalize: norm.digits,
        weight: 1,
      },
      hasExecuteFn: {
        theirs: { kind: "exists", locator: "text=/^__execute__$/" },
        ours: { kind: "exists", locator: "text=/__execute__/" },
        weight: 1,
      },
      hasContractName: {
        theirs: { kind: "exists", locator: "text=/Ready|AVNU AA Forwarder|StarkGate/" },
        ours: { kind: "exists", locator: "text=/Ready Account|AVNU AA Forwarder|STRK/" },
        weight: 1,
      },
      hasDecodedParams: {
        theirs: { kind: "exists", locator: "text=/^calls$/" },
        ours: { kind: "exists", locator: "text=/calls.*Array/i" },
        weight: 1,
      },
    },
  },
  storage: {
    voyagerHash: "#storageDiffs",
    ourTab: "state",
    fields: {
      writeCount: {
        theirs: { kind: "count", locator: "table tbody tr" },
        ours: { kind: "count", locator: "table tbody tr" },
        normalize: norm.digits,
        weight: 1,
      },
      hasContractLabel: {
        theirs: { kind: "exists", locator: "text=/StarkGate|Focus Tree|Ready|AVNU/" },
        ours: { kind: "exists", locator: "text=/STRK|AVNU|Account/" },
        weight: 2,
      },
      hasBlockColumn: {
        theirs: { kind: "exists", locator: "th:has-text('BLOCK')" },
        ours: { kind: "exists", locator: "th:has-text('Block')" },
        weight: 3,
      },
    },
  },
};
