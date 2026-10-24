import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { decodeSs58, encodeSs58, VARA_SS58_PREFIX } from "./address";
import { Panel, ToolHeader } from "./ui/Panel";
import example from "./fixtures/case-36589852-1.json";

export default function AddressTool() {
  const [params] = useSearchParams();
  const incoming = params.get("address");
  const [input, setInput] = useState(incoming ?? "");
  useEffect(() => { if (incoming) setInput(incoming); }, [incoming]);
  const value = input.trim();
  let actorId = "";
  let address = "";
  let error = "";

  if (value) {
    try {
      const publicKey = /^0x[0-9a-fA-F]{64}$/.test(value)
        ? hexToBytes(value.slice(2))
        : decodeSs58(value);
      actorId = `0x${bytesToHex(publicKey)}`;
      address = encodeSs58(publicKey, VARA_SS58_PREFIX);
    } catch (err) {
      error = err instanceof Error ? err.message : "Invalid address";
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6">
      <ToolHeader title="Address converter" aside={<Button variant="outline" size="sm" onClick={() => setInput(example.call.signer)}>Try an example</Button>} />
      <Panel>
      <div className="space-y-2">
        <label htmlFor="vara-address" className="text-sm font-medium">SS58 address or ActorId</label>
        <Input
          id="vara-address"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="SS58 address or 0x…"
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? "vara-address-error" : undefined}
        />
        {error && <p id="vara-address-error" className="max-w-md break-words text-sm text-red-400">{error}</p>}
      </div>
      {value && !error && (
        <dl className="space-y-4 border-t border-border/60 pt-4">
          <div>
            <dt className="text-xs text-muted-foreground">ActorId</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-sm">{actorId}</code>
              <CopyButton value={actorId} ariaLabel="Copy ActorId" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vara SS58 ({VARA_SS58_PREFIX})</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-sm">{address}</code>
              <CopyButton value={address} ariaLabel="Copy Vara address" />
            </dd>
          </div>
        </dl>
      )}
      </Panel>
    </section>
  );
}
