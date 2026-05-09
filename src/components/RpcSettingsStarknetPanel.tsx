import React, { useEffect, useState } from "react";
import {
  networkConfigManager,
  isValidRpcUrl,
  type StarknetRpcMode,
  type StarknetNetwork,
} from "../config/networkConfig";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FormState {
  mode: StarknetRpcMode;
  alchemyKey: string;
  infuraProjectId: string;
  customUrlMainnet: string;
  customUrlSepolia: string;
}

export const RpcSettingsStarknetPanel: React.FC<{ isOpen: boolean }> = ({
  isOpen,
}) => {
  const [form, setForm] = useState<FormState>({
    mode: "CARTRIDGE_DEFAULT",
    alchemyKey: "",
    infuraProjectId: "",
    customUrlMainnet: "",
    customUrlSepolia: "",
  });
  const [showAlchemy, setShowAlchemy] = useState(false);
  const [showInfura, setShowInfura] = useState(false);
  const [customError, setCustomError] = useState<
    Partial<Record<StarknetNetwork, string>>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    const c = networkConfigManager.getConfig().starknet;
    setForm({
      mode: c?.mode ?? "CARTRIDGE_DEFAULT",
      alchemyKey: c?.alchemyKey ?? "",
      infuraProjectId: c?.infuraProjectId ?? "",
      customUrlMainnet: c?.customUrls?.mainnet ?? "",
      customUrlSepolia: c?.customUrls?.sepolia ?? "",
    });
    setCustomError({});
  }, [isOpen]);

  const save = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    const customUrls: { mainnet?: string; sepolia?: string } = {};
    if (next.customUrlMainnet.trim()) customUrls.mainnet = next.customUrlMainnet.trim();
    if (next.customUrlSepolia.trim()) customUrls.sepolia = next.customUrlSepolia.trim();
    networkConfigManager.saveStarknetConfig({
      mode: next.mode,
      alchemyKey: next.alchemyKey.trim() || undefined,
      infuraProjectId: next.infuraProjectId.trim() || undefined,
      customUrls,
    });
  };

  const validateAndSaveCustom = (network: StarknetNetwork, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !isValidRpcUrl(trimmed)) {
      setCustomError((prev) => ({ ...prev, [network]: "Invalid RPC URL." }));
      return;
    }
    setCustomError((prev) => ({ ...prev, [network]: undefined }));
    save(
      network === "mainnet"
        ? { customUrlMainnet: trimmed }
        : { customUrlSepolia: trimmed },
    );
  };

  return (
    <div className="space-y-3">
      <Tabs value={form.mode} onValueChange={(v) => save({ mode: v as StarknetRpcMode })}>
        <TabsList className="w-full">
          <TabsTrigger value="CARTRIDGE_DEFAULT" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Cartridge
          </TabsTrigger>
          <TabsTrigger value="ALCHEMY_KEY" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Alchemy
          </TabsTrigger>
          <TabsTrigger value="INFURA_KEY" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Infura
          </TabsTrigger>
          <TabsTrigger value="CUSTOM_URL" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Custom
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {form.mode === "CARTRIDGE_DEFAULT" && (
        <p className="text-xs text-muted-foreground">
          Using Cartridge's free public RPC. No configuration needed.
        </p>
      )}

      {form.mode === "ALCHEMY_KEY" && (
        <div className="space-y-2">
          <Label htmlFor="sn-alchemy">Alchemy API Key</Label>
          <div className="flex gap-2">
            <Input
              id="sn-alchemy"
              type={showAlchemy ? "text" : "password"}
              value={form.alchemyKey}
              onChange={(e) => save({ alchemyKey: e.target.value })}
              placeholder="Enter API key…"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowAlchemy((v) => !v)}
            >
              {showAlchemy ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Applies to both Starknet mainnet and Sepolia.
          </p>
        </div>
      )}

      {form.mode === "INFURA_KEY" && (
        <div className="space-y-2">
          <Label htmlFor="sn-infura">Infura Project ID</Label>
          <div className="flex gap-2">
            <Input
              id="sn-infura"
              type={showInfura ? "text" : "password"}
              value={form.infuraProjectId}
              onChange={(e) => save({ infuraProjectId: e.target.value })}
              placeholder="Enter Project ID…"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowInfura((v) => !v)}
            >
              {showInfura ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {form.mode === "CUSTOM_URL" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sn-custom-mainnet">Mainnet URL</Label>
            <Input
              id="sn-custom-mainnet"
              type="url"
              value={form.customUrlMainnet}
              onChange={(e) =>
                setForm((p) => ({ ...p, customUrlMainnet: e.target.value }))
              }
              onBlur={(e) => validateAndSaveCustom("mainnet", e.target.value)}
              placeholder="https://your-starknet-rpc.example.com"
              className={cn("flex-1", customError.mainnet && "border-destructive")}
            />
            {customError.mainnet && (
              <p className="text-xs text-destructive">{customError.mainnet}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sn-custom-sepolia">Sepolia URL</Label>
            <Input
              id="sn-custom-sepolia"
              type="url"
              value={form.customUrlSepolia}
              onChange={(e) =>
                setForm((p) => ({ ...p, customUrlSepolia: e.target.value }))
              }
              onBlur={(e) => validateAndSaveCustom("sepolia", e.target.value)}
              placeholder="https://your-starknet-sepolia-rpc.example.com"
              className={cn("flex-1", customError.sepolia && "border-destructive")}
            />
            {customError.sepolia && (
              <p className="text-xs text-destructive">{customError.sepolia}</p>
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

export default RpcSettingsStarknetPanel;
