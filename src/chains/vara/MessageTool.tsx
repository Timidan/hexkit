import { useRef, useState } from "react";
import { hexToBytes } from "@noble/hashes/utils";
import type { Sails } from "sails-js";
import { Button } from "../../components/ui/button";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import { encodeSs58, VARA_SS58_PREFIX } from "./address";
import { caseFromJson, explainRpcError, fetchCase } from "./case";
import type { Runs, VaraCase } from "./case";
import { decodeCall, decodeEvent, decodeReply, loadIdl } from "./decode";
import type { Decoded } from "./decode";
import DryRunPanel from "./DryRunPanel";

function defaultRuns(c: VaraCase): Runs | null {
  if (!c.call.destination || !c.call.payload) return null;
  const input = { block: String(c.block.number - 1), origin: c.call.signer ?? `0x${"00".repeat(32)}`, payload: c.call.payload, value: c.call.value ?? "0", gasLimit: c.call.gasLimit ?? "0" };
  return { a: { input, result: null }, b: { input: { ...input, block: "latest" }, result: null }, query: null };
}

function Identity({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">{value ?? "—"}</code>
        {value && <CopyButton variant="ghost" value={value} ariaLabel={`Copy ${label}`} />}
      </dd>
    </div>
  );
}

function Payload({ payload, decoded, hasIdl }: { payload: `0x${string}`; decoded: Decoded; hasIdl: boolean }) {
  return (
    <div className="space-y-2">
      {decoded.service && decoded.name && <p className="text-sm">{decoded.service}.{decoded.name}</p>}
      {hasIdl && !decoded.error
        ? <pre className="whitespace-pre-wrap break-all font-mono text-sm">{JSON.stringify(decoded.value, null, 2)}</pre>
        : <pre className="whitespace-pre-wrap break-all font-mono text-sm">{payload}</pre>}
      {decoded.error && <p className="text-sm text-red-400">{decoded.error}</p>}
    </div>
  );
}

export default function MessageTool() {
  const [input, setInput] = useState("");
  const [c, setCase] = useState<VaraCase | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [idlText, setIdlText] = useState<string | null>(null);
  const [sails, setSails] = useState<Sails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const caseInput = useRef<HTMLInputElement>(null);
  const idlInput = useRef<HTMLInputElement>(null);

  async function fetchExtrinsic() {
    const match = /^(\d+)-(\d+)$/.exec(input.trim());
    if (!match) {
      setError("Use <block>-<index>, e.g. 36589852-1");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fetched = await fetchCase(Number(match[1]), Number(match[2]));
      setCase(fetched);
      setRuns(defaultRuns(fetched));
    } catch (err) {
      setError(explainRpcError(err, match[1]));
    } finally {
      setBusy(false);
    }
  }

  async function importCase(file: File) {
    setBusy(true);
    setError("");
    try {
      const imported = caseFromJson(await file.text());
      setCase(imported);
      setRuns(imported.runs ?? defaultRuns(imported));
      setInput(`${imported.block.number}-${imported.extrinsicIndex}`);
      setIdlText(imported.idl);
      setSails(null);
      if (imported.idl !== null) setSails(await loadIdl(imported.idl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function importIdl(file: File) {
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      setSails(await loadIdl(text));
      setIdlText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function exportCase() {
    if (!c) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...c, idl: idlText ?? null, ...(runs ? { runs } : {}) }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vara-case-${c.block.number}-${c.extrinsicIndex}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let signerAddress = "";
  if (c?.call.signer) {
    try {
      signerAddress = encodeSs58(hexToBytes(c.call.signer.slice(2)), VARA_SS58_PREFIX);
    } catch { /* Imported cases may contain a hex signer that is not an AccountId32. */ }
  }
  const call = c?.call.payload ? decodeCall(c.call.payload, sails) : null;
  const reply = c?.message?.reply;
  let replyText = reply?.payload ?? "";
  if (reply && !reply.success) {
    try {
      replyText = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(reply.payload.slice(2)));
    } catch { /* keep the raw hex */ }
  }

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Message case</h1>
        <p className="mt-1 text-sm text-muted-foreground">Decode a Gear message extrinsic from Vara mainnet and export it as a portable case file.</p>
        <p className="mt-2 text-xs text-muted-foreground">Pinned format: legacy Sails IDL (sails-js-parser 0.5.1). IDL v2 payloads (0x474d) are flagged, not decoded.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="vara-extrinsic" className="text-sm font-medium">Extrinsic id</label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="vara-extrinsic"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="36589852-1"
            className="w-full font-mono sm:w-60"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-describedby={error ? "vara-message-error" : undefined}
          />
          <Button variant="outline" loading={busy} onClick={fetchExtrinsic}>Fetch</Button>
          <Button variant="outline" disabled={busy} onClick={() => caseInput.current?.click()}>Import case</Button>
          <input ref={caseInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importCase(file);
          }} />
          <Button variant="outline" disabled={!c || busy} onClick={exportCase}>Export case</Button>
          <Button variant="outline" disabled={busy} onClick={() => idlInput.current?.click()}>Load IDL</Button>
          <input ref={idlInput} type="file" accept=".idl,.txt" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importIdl(file);
          }} />
        </div>
        {sails && <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>IDL: {Object.keys(sails.services).length} service{Object.keys(sails.services).length === 1 ? "" : "s"}</span>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setSails(null); setIdlText(null); setError(""); }}>Clear</Button>
        </div>}
        {error && <p id="vara-message-error" role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
      {c && <>
        <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
          <Identity label="Extrinsic" value={`${c.block.number}-${c.extrinsicIndex}`} />
          <Identity label="Block hash" value={c.block.hash} />
          <Identity label="Genesis hash" value={c.network.genesisHash} />
          <div><dt className="text-xs text-muted-foreground">Spec version</dt><dd className="mt-1 font-mono text-sm">{c.network.specVersion}</dd></div>
        </dl>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Call</h2>
          <p className="text-sm">{c.call.section}.{c.call.method}</p>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Identity label="Signer" value={c.call.signer} />
            {signerAddress && <Identity label={`Vara SS58 (${VARA_SS58_PREFIX})`} value={signerAddress} />}
            <Identity label="Destination" value={c.call.destination} />
            <div><dt className="text-xs text-muted-foreground">Gas limit</dt><dd className="mt-1 font-mono text-sm">{c.call.gasLimit ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Value</dt><dd className="mt-1 font-mono text-sm">{c.call.value ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Keep alive</dt><dd className="mt-1 text-sm">{c.call.keepAlive === null ? "—" : String(c.call.keepAlive)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Result</dt><dd className="mt-1 text-sm">{c.result.success ? "Success" : `Failed: ${c.result.error}`}</dd></div>
          </dl>
        </section>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Payload</h2>
          {c.call.section === "gear" && c.call.method === "sendMessage" && c.call.payload && call
            ? <Payload payload={c.call.payload} decoded={call} hasIdl={!!sails} />
            : <><pre className="whitespace-pre-wrap break-all font-mono text-sm">{JSON.stringify(c.call.args, null, 2)}</pre><p className="text-sm text-muted-foreground">Only gear.sendMessage payloads are decoded</p></>}
        </section>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Message</h2>
          {c.message ? <dl className="grid gap-4 sm:grid-cols-2">
            <Identity label="Message id" value={c.message.id} />
            <Identity label="Program" value={c.message.programId} />
            <Identity label="Code id" value={c.message.codeId} />
            <div><dt className="text-xs text-muted-foreground">Dispatch status</dt><dd className="mt-1 text-sm">{c.message.dispatchStatus ?? "Not dispatched in this block"}</dd></div>
          </dl> : <p className="text-sm text-muted-foreground">No queued message</p>}
        </section>
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Reply</h2>
          {reply ? <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Identity label="Reply id" value={reply.id} />
              <div><dt className="text-xs text-muted-foreground">Code</dt><dd className="mt-1 break-all text-sm">{reply.code}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Success</dt><dd className="mt-1 text-sm">{String(reply.success)}</dd></div>
            </dl>
            {reply.success
              ? reply.payload === "0x" ? <p className="text-sm">Empty reply</p>
                : <Payload payload={reply.payload} decoded={decodeReply(reply.payload, call ?? { service: null, name: null, value: null, error: null }, sails)} hasIdl={!!sails} />
              : <pre className={`whitespace-pre-wrap break-all text-sm ${replyText === reply.payload ? "font-mono" : "font-sans"}`}>{replyText}</pre>}
          </> : <p className="text-sm text-muted-foreground">No reply in this block</p>}
        </section>
        {runs && <DryRunPanel key={`${c.block.hash}-${c.extrinsicIndex}`} c={c} sails={sails} runs={runs} update={(f) => setRuns((prev) => prev && f(prev))} />}
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Program events <span className="font-normal text-muted-foreground">(same block, same program, not causally linked)</span></h2>
          {c.message?.programEvents.length ? c.message.programEvents.map((event) => (
            <div key={event.id} className="space-y-3 border-t border-border pt-4">
              <dl><Identity label="Event id" value={event.id} /></dl>
              <Payload payload={event.payload} decoded={decodeEvent(event.payload, sails)} hasIdl={!!sails} />
            </div>
          )) : <p className="text-sm text-muted-foreground">No program events in this block</p>}
        </section>
      </>}
    </section>
  );
}
