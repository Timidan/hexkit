// Estimate-fee form. Builds the same INVOKE v3 body SyntheticSimView
// uses (via buildInvokeRequest) but POSTs to /estimate-fee, which runs
// blockifier with SKIP_FEE_CHARGE and returns just the fee + execution
// resources block. No call tree, no events — much faster, used for
// "what's the fee on this tx" preflights before signing.

import React, { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { CopyButton } from "../ui/copy-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { StarknetSimulator } from "@/chains/starknet/simulatorClient";
import type { EstimateFeeResponse } from "@/chains/starknet/simulatorTypes";
import {
  formatFriAmount,
  formatHexGasAmount,
} from "@/components/starknet-simulation-results/decoders";
import BridgeErrorAlert from "./BridgeErrorAlert";
import {
  applyEstimatedBounds,
  buildInvokeRequest,
  buildInvokeWireRequest,
  DEFAULT_INVOKE_FORM,
  type InvokeFormState,
} from "./invokeRequestBuilder";
import CopyCurlButton from "./CopyCurlButton";

interface EstimateFeeViewProps {
  /** Page-level handler that flips to the Speculative tab and rehydrates
   *  the form with the just-estimated bounds applied. Wired in iter 14
   *  so the user can preview, then run, in two clicks. */
  onUseEstimatedBounds?: (form: InvokeFormState) => void;
}

const EstimateFeeView: React.FC<EstimateFeeViewProps> = ({
  onUseEstimatedBounds,
}) => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const [form, setForm] = useState<InvokeFormState>(DEFAULT_INVOKE_FORM);
  const [pending, setPending] = useState(false);
  // string = local validation, Error = bridge throw — see BridgeErrorAlert.
  const [error, setError] = useState<string | Error | null>(null);
  const [response, setResponse] = useState<EstimateFeeResponse | null>(null);

  const update = <K extends keyof InvokeFormState>(k: K, v: InvokeFormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const submit = useCallback(async () => {
    setError(null);
    setResponse(null);
    const built = buildInvokeRequest(form);
    if (!built.ok || !built.request) {
      setError(built.error ?? "Invalid request");
      return;
    }
    setPending(true);
    try {
      const res = await simulator.estimateFee(built.request);
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPending(false);
    }
  }, [simulator, form]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Estimate fee for an INVOKE v3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Builds a request body and POSTs to{" "}
            <span className="font-mono">/estimate-fee</span>. Blockifier runs the tx with
            SKIP_FEE_CHARGE so the response is just the fee + execution resources — much
            cheaper than a full simulate.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Sender address" htmlFor="ef-sender">
              <Input
                id="ef-sender"
                placeholder="0x…"
                spellCheck={false}
                className="font-mono text-xs"
                value={form.senderAddress}
                onChange={(e) => update("senderAddress", e.target.value)}
              />
            </Field>
            <Field label="Nonce" htmlFor="ef-nonce">
              <Input
                id="ef-nonce"
                placeholder="0x… or decimal"
                spellCheck={false}
                className="font-mono text-xs"
                value={form.nonce}
                onChange={(e) => update("nonce", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Calldata felts" htmlFor="ef-calldata">
            <Textarea
              id="ef-calldata"
              placeholder="0x1&#10;0x5d07d9f6…&#10;0xf82886c4…"
              spellCheck={false}
              className="font-mono text-xs h-32"
              value={form.calldata}
              onChange={(e) => update("calldata", e.target.value)}
            />
          </Field>

          <Field label="Signature felts (optional)" htmlFor="ef-signature">
            <Textarea
              id="ef-signature"
              placeholder="0xabc… 0xdef…"
              spellCheck={false}
              className="font-mono text-xs h-16"
              value={form.signature}
              onChange={(e) => update("signature", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="L1 max amount" htmlFor="ef-l1max">
              <Input
                id="ef-l1max"
                className="font-mono text-xs"
                value={form.l1MaxAmount}
                onChange={(e) => update("l1MaxAmount", e.target.value)}
              />
            </Field>
            <Field label="L1 max price" htmlFor="ef-l1price">
              <Input
                id="ef-l1price"
                className="font-mono text-xs"
                value={form.l1MaxPrice}
                onChange={(e) => update("l1MaxPrice", e.target.value)}
              />
            </Field>
            <Field label="L2 max amount" htmlFor="ef-l2max">
              <Input
                id="ef-l2max"
                className="font-mono text-xs"
                value={form.l2MaxAmount}
                onChange={(e) => update("l2MaxAmount", e.target.value)}
              />
            </Field>
            <Field label="L2 max price" htmlFor="ef-l2price">
              <Input
                id="ef-l2price"
                className="font-mono text-xs"
                value={form.l2MaxPrice}
                onChange={(e) => update("l2MaxPrice", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ef-skip-validate"
                checked={form.skipValidate}
                onCheckedChange={(v) => update("skipValidate", Boolean(v))}
              />
              <Label htmlFor="ef-skip-validate" className="text-xs cursor-pointer">
                SKIP_VALIDATE
              </Label>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <CopyCurlButton
                method="POST"
                path="/estimate-fee"
                body={buildInvokeWireRequest(form).body}
                disabled={!form.senderAddress.trim()}
              />
              <Button
                variant="outline"
                onClick={submit}
                disabled={!form.senderAddress.trim() || pending}
                loading={pending}
              >
                Estimate fee
              </Button>
            </div>
          </div>

          {!simulator.isConfigured && (
            <Alert>
              <AlertTitle className="text-warning">Bridge disabled</AlertTitle>
              <AlertDescription>
                Set <span className="font-mono">VITE_STARKNET_SIM_BRIDGE_URL</span> in{" "}
                <span className="font-mono">.env</span> to enable fee estimation.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            typeof error === "string" ? (
              <Alert variant="destructive">
                <AlertTitle>Check the form</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : (
              <BridgeErrorAlert error={error} context="Estimate" />
            )
          )}
        </CardContent>
      </Card>

      {response && response.estimates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm">Estimate</CardTitle>
            <div className="flex items-center gap-2">
              {onUseEstimatedBounds && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const est = response.estimates[0]?.feeEstimate;
                    const bc = response.blockContext;
                    if (!est) return;
                    onUseEstimatedBounds(
                      applyEstimatedBounds(form, {
                        l1GasConsumed: est.l1GasConsumed,
                        l1DataGasConsumed: est.l1DataGasConsumed,
                        l2GasConsumed: est.l2GasConsumed,
                        l1GasPrice: bc.l1GasPrice?.priceInFri,
                        l1DataGasPrice: bc.l1DataGasPrice?.priceInFri,
                        // /estimate-fee blockContext doesn't carry l2 price;
                        // bumpHex in applyEstimatedBounds keeps the user's
                        // current l2MaxPrice when the estimate is missing
                        // it, but we explicitly pass null here so it can
                        // fall back to the form's existing value.
                        l2GasPrice: null,
                      }),
                    );
                  }}
                  data-testid="use-estimated-bounds"
                >
                  Use these bounds in Speculative
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground">
                block {response.blockContext.blockNumber.toLocaleString()} ·{" "}
                {response.blockContext.starknetVersion}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {response.estimates.map((est, i) => (
              <div key={i} className="space-y-2">
                {response.estimates.length > 1 && (
                  <div className="text-[10px] uppercase text-muted-foreground">
                    tx #{i}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <FeeStat
                    label="Overall fee"
                    primary={formatFriAmount(est.feeEstimate.overallFee)}
                    secondary={est.feeEstimate.overallFee}
                    copyValue={est.feeEstimate.overallFee}
                  />
                  <FeeStat
                    label="L1 gas consumed"
                    primary={formatHexGasAmount(est.feeEstimate.l1GasConsumed)}
                    secondary={est.feeEstimate.l1GasConsumed}
                    copyValue={est.feeEstimate.l1GasConsumed}
                  />
                  <FeeStat
                    label="L1 data gas consumed"
                    primary={formatHexGasAmount(est.feeEstimate.l1DataGasConsumed)}
                    secondary={est.feeEstimate.l1DataGasConsumed}
                    copyValue={est.feeEstimate.l1DataGasConsumed}
                  />
                  <FeeStat
                    label="L2 gas consumed"
                    primary={formatHexGasAmount(est.feeEstimate.l2GasConsumed)}
                    secondary={est.feeEstimate.l2GasConsumed}
                    copyValue={est.feeEstimate.l2GasConsumed}
                  />
                  <FeeStat
                    label="VM steps"
                    primary={est.executionResources.steps.toLocaleString()}
                  />
                  <FeeStat
                    label="L2 gas (raw decimal)"
                    primary={est.executionResources.l2Gas.toLocaleString()}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
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

function FeeStat({
  label,
  primary,
  secondary,
  copyValue,
}: {
  label: string;
  /** Human-readable line — e.g. "0.001234 STRK" or "12,345". */
  primary: string;
  /** Optional raw value (typically the bridge's hex), shown muted under
   *  the primary line so power users can still see the canonical form. */
  secondary?: string;
  /** Value the CopyButton hands to the clipboard — defaults to primary
   *  when omitted, but for hex fields we want the raw bridge value. */
  copyValue?: string;
}) {
  const copy = copyValue ?? secondary ?? primary;
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="uppercase text-muted-foreground text-[10px]">{label}</div>
      <div className="mt-0.5 text-foreground font-mono flex items-center gap-1">
        <span className="truncate">{primary}</span>
        <CopyButton value={copy} className="ml-auto h-5 w-5" iconSize={12} />
      </div>
      {secondary && secondary !== primary && (
        <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
          {secondary}
        </div>
      )}
    </div>
  );
}

export default EstimateFeeView;
