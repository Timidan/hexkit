import React, { useEffect, useState } from "react";
import {
  networkConfigManager,
  isValidRpcUrl,
  type SolanaRpcMode,
  type SolanaCluster,
} from "../config/networkConfig";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FormState {
  mode: SolanaRpcMode;
  heliusKey: string;
  alchemyKey: string;
  tritonMainnet: string;
  tritonDevnet: string;
  customMainnet: string;
  customDevnet: string;
}

export const RpcSettingsSolanaPanel: React.FC<{ isOpen: boolean }> = ({
  isOpen,
}) => {
  const [form, setForm] = useState<FormState>({
    mode: "PUBLIC_DEFAULT",
    heliusKey: "",
    alchemyKey: "",
    tritonMainnet: "",
    tritonDevnet: "",
    customMainnet: "",
    customDevnet: "",
  });
  const [showHelius, setShowHelius] = useState(false);
  const [showAlchemy, setShowAlchemy] = useState(false);
  const [urlError, setUrlError] = useState<
    Partial<Record<string, string>>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    const c = networkConfigManager.getConfig().solana;
    setForm({
      mode: c?.mode ?? "PUBLIC_DEFAULT",
      heliusKey: c?.heliusKey ?? "",
      alchemyKey: c?.alchemyKey ?? "",
      tritonMainnet: c?.tritonUrls?.["mainnet-beta"] ?? "",
      tritonDevnet: c?.tritonUrls?.devnet ?? "",
      customMainnet: c?.customUrls?.["mainnet-beta"] ?? "",
      customDevnet: c?.customUrls?.devnet ?? "",
    });
    setUrlError({});
  }, [isOpen]);

  const save = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    const tritonUrls: Partial<Record<SolanaCluster, string>> = {};
    if (next.tritonMainnet.trim()) tritonUrls["mainnet-beta"] = next.tritonMainnet.trim();
    if (next.tritonDevnet.trim()) tritonUrls.devnet = next.tritonDevnet.trim();
    const customUrls: Partial<Record<SolanaCluster, string>> = {};
    if (next.customMainnet.trim()) customUrls["mainnet-beta"] = next.customMainnet.trim();
    if (next.customDevnet.trim()) customUrls.devnet = next.customDevnet.trim();
    networkConfigManager.saveSolanaConfig({
      mode: next.mode,
      heliusKey: next.heliusKey.trim() || undefined,
      alchemyKey: next.alchemyKey.trim() || undefined,
      tritonUrls,
      customUrls,
    });
  };

  const validateAndSaveUrl = (field: keyof FormState, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !isValidRpcUrl(trimmed)) {
      setUrlError((p) => ({ ...p, [field]: "Invalid RPC URL." }));
      return;
    }
    setUrlError((p) => ({ ...p, [field]: undefined }));
    save({ [field]: trimmed } as Partial<FormState>);
  };

  return (
    <div className="space-y-3">
      <Tabs value={form.mode} onValueChange={(v) => save({ mode: v as SolanaRpcMode })}>
        <TabsList className="w-full">
          <TabsTrigger value="PUBLIC_DEFAULT" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Public
          </TabsTrigger>
          <TabsTrigger value="HELIUS_KEY" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Helius
          </TabsTrigger>
          <TabsTrigger value="ALCHEMY_KEY" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Alchemy
          </TabsTrigger>
          <TabsTrigger value="TRITON_URL" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Triton
          </TabsTrigger>
          <TabsTrigger value="CUSTOM_URL" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Custom
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {form.mode === "PUBLIC_DEFAULT" && (
        <p className="text-xs text-muted-foreground">
          Using Solana Foundation's public RPC. Aggressive rate limits — pick a
          provider for real use.
        </p>
      )}

      {form.mode === "HELIUS_KEY" && (
        <div className="space-y-2">
          <Label htmlFor="sol-helius">Helius API Key</Label>
          <div className="flex gap-2">
            <Input
              id="sol-helius"
              type={showHelius ? "text" : "password"}
              value={form.heliusKey}
              onChange={(e) => save({ heliusKey: e.target.value })}
              placeholder="Enter API key…"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowHelius((v) => !v)}>
              {showHelius ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {form.mode === "ALCHEMY_KEY" && (
        <div className="space-y-2">
          <Label htmlFor="sol-alchemy">Alchemy API Key</Label>
          <div className="flex gap-2">
            <Input
              id="sol-alchemy"
              type={showAlchemy ? "text" : "password"}
              value={form.alchemyKey}
              onChange={(e) => save({ alchemyKey: e.target.value })}
              placeholder="Enter API key…"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowAlchemy((v) => !v)}>
              {showAlchemy ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {form.mode === "TRITON_URL" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sol-triton-mainnet">Mainnet URL</Label>
            <Input
              id="sol-triton-mainnet"
              type="url"
              value={form.tritonMainnet}
              onChange={(e) => setForm((p) => ({ ...p, tritonMainnet: e.target.value }))}
              onBlur={(e) => validateAndSaveUrl("tritonMainnet", e.target.value)}
              placeholder="https://your-triton-endpoint…"
              className={cn("flex-1", urlError.tritonMainnet && "border-destructive")}
            />
            {urlError.tritonMainnet && (
              <p className="text-xs text-destructive">{urlError.tritonMainnet}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sol-triton-devnet">Devnet URL</Label>
            <Input
              id="sol-triton-devnet"
              type="url"
              value={form.tritonDevnet}
              onChange={(e) => setForm((p) => ({ ...p, tritonDevnet: e.target.value }))}
              onBlur={(e) => validateAndSaveUrl("tritonDevnet", e.target.value)}
              placeholder="https://your-triton-devnet-endpoint…"
              className={cn("flex-1", urlError.tritonDevnet && "border-destructive")}
            />
            {urlError.tritonDevnet && (
              <p className="text-xs text-destructive">{urlError.tritonDevnet}</p>
            )}
          </div>
        </div>
      )}

      {form.mode === "CUSTOM_URL" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sol-custom-mainnet">Mainnet URL</Label>
            <Input
              id="sol-custom-mainnet"
              type="url"
              value={form.customMainnet}
              onChange={(e) => setForm((p) => ({ ...p, customMainnet: e.target.value }))}
              onBlur={(e) => validateAndSaveUrl("customMainnet", e.target.value)}
              placeholder="https://your-solana-rpc.example.com"
              className={cn("flex-1", urlError.customMainnet && "border-destructive")}
            />
            {urlError.customMainnet && (
              <p className="text-xs text-destructive">{urlError.customMainnet}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sol-custom-devnet">Devnet URL</Label>
            <Input
              id="sol-custom-devnet"
              type="url"
              value={form.customDevnet}
              onChange={(e) => setForm((p) => ({ ...p, customDevnet: e.target.value }))}
              onBlur={(e) => validateAndSaveUrl("customDevnet", e.target.value)}
              placeholder="https://your-solana-devnet-rpc.example.com"
              className={cn("flex-1", urlError.customDevnet && "border-destructive")}
            />
            {urlError.customDevnet && (
              <p className="text-xs text-destructive">{urlError.customDevnet}</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Custom URLs must be hosted on an origin allowed by the page CSP.
          </p>
        </div>
      )}
    </div>
  );
};

export default RpcSettingsSolanaPanel;
