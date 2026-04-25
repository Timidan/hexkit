// Self-contained capture script. Each playwriter `-e` invocation has
// a 10-second cap, so we split the work into discrete phases the
// orchestrator can pipeline:
//
//   buildNavigatePayload    one-shot: open URL + flip inner tab
//   buildWaitPayload        one-shot: poll body for ready signal
//   buildExtractPayload     one-shot: run schema locators
//
// The orchestrator (run.sh) calls these in sequence, looping the
// wait phase until it returns "ready" or the budget expires.

import { SCHEMA, FieldSpec, Extract } from "./schema";

const TOOLKIT_BASE = process.env.HEXKIT_BASE || "http://localhost:5173";
const VOYAGER_BASE = process.env.VOYAGER_BASE || "https://voyager.online";

interface Args {
  side: "ours" | "theirs";
  tab: keyof typeof SCHEMA;
  txHash: string;
}

function urlFor({ side, tab, txHash }: Args): string {
  const spec = SCHEMA[tab];
  if (!spec) throw new Error(`unknown tab ${tab}`);
  return side === "theirs"
    ? `${VOYAGER_BASE}/tx/${txHash}${spec.voyagerHash}`
    : `${TOOLKIT_BASE}/starknet/simulations?tab=trace&txHash=${txHash}`;
}

/** Phase 1: navigate the page. Sets the inner result tab on our side
 *  via localStorage so a single navigate covers every comparison. */
export function buildNavigatePayload(a: Args): string {
  const spec = SCHEMA[a.tab];
  return `
const URL_TO_OPEN = ${JSON.stringify(urlFor(a))};
const SIDE = ${JSON.stringify(a.side)};
const OUR_TAB = ${JSON.stringify(spec.ourTab)};
if (!state.page || state.page.isClosed()) {
  state.page = context.pages().find((p) => p.url() === "about:blank") ?? (await context.newPage());
}
if (SIDE === "ours") {
  await state.page.goto("${TOOLKIT_BASE}/starknet/simulations?tab=trace", { waitUntil: "domcontentloaded" });
  await state.page.evaluate((t) => {
    window.localStorage.setItem("hexkit:starknet-sim:resultTab", t);
  }, OUR_TAB);
}
await state.page.goto(URL_TO_OPEN, { waitUntil: "domcontentloaded" });
console.log("__NAV__" + state.page.url() + "__END__");
`;
}

/** Phase 2: probe whether the page has rendered enough to scrape.
 *  Returns "READY" when content for the *active* tab is present, not
 *  just the page shell. The trace endpoint can take 30s+ on a busy
 *  block, so this needs to be loop-polled by the orchestrator. */
export function buildWaitPayload(a: Args): string {
  // Per-tab ready probes. Each side has its own pattern because layout
  // differs. The "ours" probes deliberately require *data* not chrome
  // — e.g. checking that an actual hash felt or a contract-named row
  // has rendered, not just that the result Card is on screen.
  // Per-tab readiness probe. Voyager probes by visible text. Our side
  // probes via the same data-* anchors the extract phase relies on
  // (count > 0), so an "OK" wait means the schema's locators will find
  // the right elements — no race where text appears via tooltips /
  // localStorage hints before the data-mounted DOM lands.
  if (a.side === "ours") {
    const probe: Record<string, string> = {
      overview: "[data-summary-row=hash]",
      events: "table tbody tr",
      internalCalls: "[data-frame-row]",
      storage: "table tbody tr",
    };
    const sel = probe[a.tab] || "[data-summary-row=hash]";
    return `
const cnt = await state.page.locator(${JSON.stringify(sel)}).count().catch(() => 0);
console.log("__WAIT__" + (cnt > 0 ? "READY" : "WAIT") + "__END__");
`;
  }
  const theirsByTab: Record<string, string> = {
    overview: "/Sender Address[\\s\\S]*0x|Actual Fee/",
    events: "/9\\d{6,}_\\d_\\d/",
    internalCalls: "/More Details/",
    storage: "/CONTRACT ADDRESS|0x[0-9a-f]{6,}…/",
  };
  const re = theirsByTab[a.tab] || "/STARKNET|Starknet/";
  return `
const body = await state.page.locator("body").innerText().catch(() => "");
const ok = ${re}.test(body);
console.log("__WAIT__" + (ok ? "READY" : "WAIT") + "__END__");
`;
}

/** Phase 3: run every field's locator and serialise the result. */
export function buildExtractPayload(a: Args): string {
  const spec = SCHEMA[a.tab];
  const fieldsJson = JSON.stringify(spec.fields);
  return `
const FIELDS = ${fieldsJson};
const SIDE = ${JSON.stringify(a.side)};
const TAB = ${JSON.stringify(a.tab)};
async function runExtract(extract) {
  if (!extract || !extract.locator) return null;
  // Wrap each locator op in a hard 1.5s deadline — playwright's
  // implicit waits accumulate fast and we need to fit every field
  // into a single 10-second relay budget.
  const withTimeout = (p) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("locator-timeout")), 1500)),
  ]);
  try {
    const loc = state.page.locator(extract.locator);
    if (extract.kind === "exists") return (await withTimeout(loc.count())) > 0;
    if (extract.kind === "count") return await withTimeout(loc.count());
    if (extract.kind === "attr") return await withTimeout(loc.first().getAttribute(extract.attr));
    if (extract.kind === "innerText" || extract.kind === "text") {
      const c = await withTimeout(loc.count());
      if (c === 0) return null;
      return (await withTimeout(loc.first().innerText())).trim();
    }
  } catch (err) {
    if (String(err && err.message).includes("locator-timeout")) return null;
    return { __error: String(err && err.message ? err.message : err) };
  }
  return null;
}
const out = { side: SIDE, tab: TAB, fields: {} };
for (const [name, spec] of Object.entries(FIELDS)) {
  out.fields[name] = await runExtract(spec[SIDE]);
}
console.log("__CAPTURE__" + JSON.stringify(out) + "__END__");
`;
}

function main() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, "")] = args[i + 1];
  }
  const a: Args = {
    side: (opts.side as "ours" | "theirs") || "ours",
    tab: (opts.tab as keyof typeof SCHEMA) || "overview",
    txHash:
      opts.tx ||
      "0xd5949557f4ed8aa1c50cd50f97beb7e1c7941f79e65afec49fab9e2e16a7fc",
  };
  const phase = opts.phase || "extract";
  const payload =
    phase === "navigate"
      ? buildNavigatePayload(a)
      : phase === "wait"
        ? buildWaitPayload(a)
        : buildExtractPayload(a);
  process.stdout.write(payload);
}

if (process.argv[1] && process.argv[1].endsWith("capture.ts")) main();
