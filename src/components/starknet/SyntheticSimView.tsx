// Speculative INVOKE v3 simulation form. Builds a minimal request body,
// POSTs to /simulate via the bridge, and renders the rich result panel.
// Use case: previewing a tx the user is about to sign, without
// broadcasting. The UI accepts raw calldata felts; calldata builders
// (selector + decoded args) are a follow-up.

import React, { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import {
  StarknetSimulator,
  StarknetSimulatorBridgeError,
} from "@/chains/starknet/simulatorClient";
import type {
  InvokeV3,
  SimulateRequest,
  SimulateResponse,
  SimulationFlag,
} from "@/chains/starknet/simulatorTypes";
import { StarknetSimulationResults } from "@/components/starknet-simulation-results";

const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;
const HEX_OR_DEC = /^(0x[0-9a-fA-F]+|\d+)$/;

interface FormState {
  blockId: "latest" | "number";
  blockNumber: string;
  senderAddress: string;
  nonce: string;
  calldata: string; // newline / comma / whitespace-separated felts
  signature: string;
  l1MaxAmount: string;
  l1MaxPrice: string;
  l2MaxAmount: string;
  l2MaxPrice: string;
  tip: string;
  skipValidate: boolean;
  skipFeeCharge: boolean;
}

const DEFAULT_FORM: FormState = {
  blockId: "latest",
  blockNumber: "",
  senderAddress: "",
  nonce: "0x0",
  calldata: "",
  signature: "",
  l1MaxAmount: "0x0",
  l1MaxPrice: "0x0",
  l2MaxAmount: "0xffffffff",
  l2MaxPrice: "0xffffffffffff",
  tip: "0x0",
  skipValidate: false,
  skipFeeCharge: false,
};

const SyntheticSimView: React.FC = () => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SimulateResponse | null>(null);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const submit = useCallback(async () => {
    setError(null);
    setResponse(null);
    if (!FELT_HEX.test(form.senderAddress.trim())) {
      setError("senderAddress must be 0x-prefixed hex (≤ 64 nibbles).");
      return;
    }
    if (!HEX_OR_DEC.test(form.nonce.trim())) {
      setError("nonce must be hex (0x…) or decimal.");
      return;
    }
    const calldata = form.calldata
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (calldata.some((c) => !FELT_HEX.test(c))) {
      setError(
        `calldata felts must be 0x-prefixed hex. Bad entries: ${calldata
          .filter((c) => !FELT_HEX.test(c))
          .slice(0, 3)
          .join(", ")}`,
      );
      return;
    }
    const signature = form.signature
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const tx: InvokeV3 = {
      type: "INVOKE",
      version: "0x3",
      senderAddress: form.senderAddress.trim(),
      calldata,
      signature,
      nonce: form.nonce.trim(),
      resourceBounds: {
        l1Gas: { maxAmount: form.l1MaxAmount, maxPricePerUnit: form.l1MaxPrice },
        l2Gas: { maxAmount: form.l2MaxAmount, maxPricePerUnit: form.l2MaxPrice },
      },
      tip: form.tip,
      paymasterData: [],
      nonceDataAvailabilityMode: "L1",
      feeDataAvailabilityMode: "L1",
    };

    const flags: SimulationFlag[] = [];
    if (form.skipValidate) flags.push("SKIP_VALIDATE");
    if (form.skipFeeCharge) flags.push("SKIP_FEE_CHARGE");

    const req: SimulateRequest = {
      blockId:
        form.blockId === "latest"
          ? { tag: "latest" }
          : { blockNumber: parseInt(form.blockNumber, 10) },
      transactions: [tx],
      simulationFlags: flags,
    };

    setPending(true);
    try {
      const res = await simulator.simulate(req);
      setResponse(res);
    } catch (err) {
      if (err instanceof StarknetSimulatorBridgeError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  }, [simulator, form]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Simulate a speculative INVOKE v3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Builds a request body and POSTs to{" "}
            <span className="font-mono">/simulate</span>. The bridge runs the tx against the
            current fork-head (or a pinned block) without broadcasting. Drop your raw
            calldata felts in below; one per line, or comma-separated.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Sender address" htmlFor="sender">
              <Input
                id="sender"
                placeholder="0x…"
                spellCheck={false}
                className="font-mono text-xs"
                value={form.senderAddress}
                onChange={(e) => update("senderAddress", e.target.value)}
              />
            </Field>
            <Field label="Nonce" htmlFor="nonce">
              <Input
                id="nonce"
                placeholder="0x… or decimal"
                spellCheck={false}
                className="font-mono text-xs"
                value={form.nonce}
                onChange={(e) => update("nonce", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Calldata felts" htmlFor="calldata">
            <Textarea
              id="calldata"
              placeholder="0x1&#10;0x5d07d9f6…&#10;0xf82886c4…"
              spellCheck={false}
              className="font-mono text-xs h-32"
              value={form.calldata}
              onChange={(e) => update("calldata", e.target.value)}
            />
          </Field>

          <Field label="Signature felts (optional)" htmlFor="signature">
            <Textarea
              id="signature"
              placeholder="0xabc… 0xdef…"
              spellCheck={false}
              className="font-mono text-xs h-16"
              value={form.signature}
              onChange={(e) => update("signature", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="L1 max amount" htmlFor="l1max">
              <Input
                id="l1max"
                className="font-mono text-xs"
                value={form.l1MaxAmount}
                onChange={(e) => update("l1MaxAmount", e.target.value)}
              />
            </Field>
            <Field label="L1 max price" htmlFor="l1price">
              <Input
                id="l1price"
                className="font-mono text-xs"
                value={form.l1MaxPrice}
                onChange={(e) => update("l1MaxPrice", e.target.value)}
              />
            </Field>
            <Field label="L2 max amount" htmlFor="l2max">
              <Input
                id="l2max"
                className="font-mono text-xs"
                value={form.l2MaxAmount}
                onChange={(e) => update("l2MaxAmount", e.target.value)}
              />
            </Field>
            <Field label="L2 max price" htmlFor="l2price">
              <Input
                id="l2price"
                className="font-mono text-xs"
                value={form.l2MaxPrice}
                onChange={(e) => update("l2MaxPrice", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip-validate"
                checked={form.skipValidate}
                onCheckedChange={(v) => update("skipValidate", Boolean(v))}
              />
              <Label htmlFor="skip-validate" className="text-xs cursor-pointer">
                SKIP_VALIDATE
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip-fee"
                checked={form.skipFeeCharge}
                onCheckedChange={(v) => update("skipFeeCharge", Boolean(v))}
              />
              <Label htmlFor="skip-fee" className="text-xs cursor-pointer">
                SKIP_FEE_CHARGE
              </Label>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={submit}
                disabled={!form.senderAddress.trim() || pending}
                loading={pending}
              >
                Simulate
              </Button>
            </div>
          </div>

          {!simulator.isConfigured && (
            <Alert>
              <AlertTitle className="text-warning">Bridge disabled</AlertTitle>
              <AlertDescription>
                Set <span className="font-mono">VITE_STARKNET_SIM_BRIDGE_URL</span> in{" "}
                <span className="font-mono">.env</span> to enable simulation.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Simulation failed</AlertTitle>
              <AlertDescription className="font-mono text-[11px]">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {response && (
        <StarknetSimulationResults
          response={response}
          source="speculative simulate"
          isResimulating={pending}
          onResimulate={() => void submit()}
          onExplainTransaction={() =>
            alert("LLM whole-tx summary affordance — wire to your endpoint.")
          }
          onExplainFrame={(f) =>
            alert(
              `LLM per-frame explainer for ${f.contractAddress} → ${f.entryPointSelector}`,
            )
          }
        />
      )}
    </div>
  );
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default SyntheticSimView;
