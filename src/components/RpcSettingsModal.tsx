import React, { useEffect, useRef, useState } from "react";
import {
  networkConfigManager,
  type RpcProviderMode,
  isValidRpcUrl,
} from "../config/networkConfig";
import type { Chain } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RpcSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  currentChain?: Chain | null;
}

type FormState = {
  mode: RpcProviderMode;
  alchemyApiKey: string;
  infuraProjectId: string;
  customRpcUrl: string;
  etherscanApiKey: string;
};

type AutoSaveState = "idle" | "saving" | "saved" | "error";

const RpcSettingsModal: React.FC<RpcSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [formState, setFormState] = useState<FormState>({
    mode: "DEFAULT",
    alchemyApiKey: "",
    infuraProjectId: "",
    customRpcUrl: "",
    etherscanApiKey: "",
  });
  const [errors, setErrors] = useState<Partial<Record<RpcProviderMode, string>>>({});
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [showAlchemyKey, setShowAlchemyKey] = useState(false);
  const [showInfuraKey, setShowInfuraKey] = useState(false);
  const [showEtherscanKey, setShowEtherscanKey] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);
  const initialSyncRef = useRef(true);

  useEffect(() => {
    if (!isOpen) return;
    const config = networkConfigManager.getConfig();
    setFormState({
      mode: config.rpcMode ?? "DEFAULT",
      alchemyApiKey: config.alchemyApiKey ?? "",
      infuraProjectId: config.infuraProjectId ?? "",
      customRpcUrl: config.customRpcUrl ?? "",
      etherscanApiKey: config.etherscanApiKey ?? "",
    });
    setShowAlchemyKey(false);
    setShowInfuraKey(false);
    setShowEtherscanKey(false);
    setErrors({});
    setAutoSaveState("saved");
    initialSyncRef.current = true;
  }, [isOpen]);

  // Flush pending save when modal unmounts / closes (Radix Dialog unmounts content on close,
  // so the flush MUST be in a cleanup function — effect bodies don't run on unmount)
  const formStateRef = useRef(formState);
  formStateRef.current = formState;
  useEffect(() => {
    if (!isOpen) return;
    // Cleanup runs when isOpen flips false OR component unmounts (Dialog close)
    return () => {
      if (autoSaveTimer.current) {
        window.clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
        const fs = formStateRef.current;
        networkConfigManager.saveConfig({
          rpcMode: fs.mode,
          alchemyApiKey: fs.alchemyApiKey.trim(),
          infuraProjectId: fs.infuraProjectId.trim(),
          customRpcUrl: fs.customRpcUrl.trim(),
          etherscanApiKey: fs.etherscanApiKey.trim(),
        });
      }
    };
  }, [isOpen]);

  const computeErrors = (state: FormState) => {
    const nextErrors: typeof errors = {};
    if (state.mode === "ALCHEMY" && !state.alchemyApiKey.trim()) {
      nextErrors.ALCHEMY = "API key required";
    }
    if (state.mode === "INFURA" && !state.infuraProjectId.trim()) {
      nextErrors.INFURA = "Project ID required";
    }
    if (state.mode === "CUSTOM") {
      if (!state.customRpcUrl.trim()) {
        nextErrors.CUSTOM = "RPC URL required";
      } else if (!isValidRpcUrl(state.customRpcUrl)) {
        nextErrors.CUSTOM = "Enter a valid HTTP(s) URL";
      }
    }
    return nextErrors;
  };

  useEffect(() => {
    if (!isOpen) return;

    const nextErrors = computeErrors(formState);
    setErrors(nextErrors);

    if (initialSyncRef.current) {
      initialSyncRef.current = false;
      setAutoSaveState(Object.keys(nextErrors).length ? "error" : "saved");
      return;
    }

    if (autoSaveTimer.current) {
      window.clearTimeout(autoSaveTimer.current);
    }
    setAutoSaveState("saving");

    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null; // Mark as fired so flush cleanup doesn't redundantly save
      networkConfigManager.saveConfig({
        rpcMode: formState.mode,
        alchemyApiKey: formState.alchemyApiKey.trim(),
        infuraProjectId: formState.infuraProjectId.trim(),
        customRpcUrl: formState.customRpcUrl.trim(),
        etherscanApiKey: formState.etherscanApiKey.trim(),
      });
      const hasErrors = Object.keys(nextErrors).length > 0;
      setAutoSaveState(hasErrors ? "error" : "saved");
      if (onSaved) onSaved();
    }, 500);

    return () => {
      if (autoSaveTimer.current) {
        window.clearTimeout(autoSaveTimer.current);
      }
    };
  }, [formState, isOpen, onSaved]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>RPC Provider Settings</DialogTitle>
          <DialogDescription>
            Configure your RPC provider. Settings are stored locally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Provider Tabs */}
          <Tabs
            value={formState.mode}
            onValueChange={(value) => setFormState((prev) => ({ ...prev, mode: value as RpcProviderMode }))}
          >
            <TabsList className="w-full">
              <TabsTrigger
                value="DEFAULT"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Default
              </TabsTrigger>
              <TabsTrigger
                value="ALCHEMY"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Alchemy
              </TabsTrigger>
              <TabsTrigger
                value="INFURA"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Infura
              </TabsTrigger>
              <TabsTrigger
                value="CUSTOM"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Provider Config - constant height */}
          <div className="space-y-2">
            <Label htmlFor="provider-input" className={cn(formState.mode === "DEFAULT" && "text-muted-foreground")}>
              {formState.mode === "DEFAULT" && "No configuration needed"}
              {formState.mode === "ALCHEMY" && "Alchemy API Key"}
              {formState.mode === "INFURA" && "Infura Project ID"}
              {formState.mode === "CUSTOM" && "Custom RPC URL"}
            </Label>
            <div className="flex gap-2">
              {formState.mode === "DEFAULT" ? (
                <Input
                  disabled
                  placeholder="Using public RPC endpoints"
                  className="flex-1"
                />
              ) : formState.mode === "ALCHEMY" ? (
                <Input
                  id="provider-input"
                  type={showAlchemyKey ? "text" : "password"}
                  value={formState.alchemyApiKey}
                  onChange={(e) => setFormState((prev) => ({ ...prev, alchemyApiKey: e.target.value }))}
                  placeholder="Enter API key..."
                  className={cn("flex-1", errors.ALCHEMY && "border-destructive")}
                />
              ) : formState.mode === "INFURA" ? (
                <Input
                  id="provider-input"
                  type={showInfuraKey ? "text" : "password"}
                  value={formState.infuraProjectId}
                  onChange={(e) => setFormState((prev) => ({ ...prev, infuraProjectId: e.target.value }))}
                  placeholder="Enter project ID..."
                  className={cn("flex-1", errors.INFURA && "border-destructive")}
                />
              ) : (
                <Input
                  id="provider-input"
                  type="url"
                  value={formState.customRpcUrl}
                  onChange={(e) => setFormState((prev) => ({ ...prev, customRpcUrl: e.target.value }))}
                  placeholder="https://your-node.example.com"
                  className={cn("flex-1", errors.CUSTOM && "border-destructive")}
                />
              )}
              {formState.mode !== "DEFAULT" && formState.mode !== "CUSTOM" && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (formState.mode === "ALCHEMY") setShowAlchemyKey(!showAlchemyKey);
                    if (formState.mode === "INFURA") setShowInfuraKey(!showInfuraKey);
                  }}
                >
                  {(formState.mode === "ALCHEMY" ? showAlchemyKey : showInfuraKey)
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
            {(errors.ALCHEMY || errors.INFURA || errors.CUSTOM) && (
              <p className="text-xs text-destructive">
                {errors.ALCHEMY || errors.INFURA || errors.CUSTOM}
              </p>
            )}
          </div>

          {/* Etherscan API Key */}
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-center gap-2">
              <Label htmlFor="etherscan-key">Etherscan API Key</Label>
              <Badge variant="outline" className="text-[10px]">Optional</Badge>
            </div>
            <div className="flex gap-2">
              <Input
                id="etherscan-key"
                type={showEtherscanKey ? "text" : "password"}
                value={formState.etherscanApiKey}
                onChange={(e) => setFormState((prev) => ({ ...prev, etherscanApiKey: e.target.value }))}
                placeholder="Enter API key..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowEtherscanKey(!showEtherscanKey)}
              >
                {showEtherscanKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For fetching verified ABIs. Works across all EVM networks.
            </p>
          </div>
        </div>

        {/* Footer with status */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center gap-1.5 text-xs">
            {autoSaveState === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Saving...</span>
              </>
            )}
            {autoSaveState === "saved" && (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">Saved</span>
              </>
            )}
            {autoSaveState === "error" && (
              <>
                <AlertCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive">Check fields</span>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RpcSettingsModal;
