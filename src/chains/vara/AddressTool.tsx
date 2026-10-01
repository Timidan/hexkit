import { useState } from "react";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import { decodeSs58, encodeSs58, VARA_SS58_PREFIX } from "./address";

export default function AddressTool() {
  const [input, setInput] = useState("");
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
      <div>
        <h1 className="text-xl font-semibold">Address</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Convert an SS58 address or hex ActorId to a Vara address.
        </p>
      </div>
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
        {error && <p id="vara-address-error" role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
      {value && !error && (
        <dl className="space-y-4 rounded-lg border border-border bg-card p-4">
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
    </section>
  );
}
