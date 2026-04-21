import React, { useEffect, useRef, useState } from "react";
import {
  networkConfigManager,
  type ExplorerKeyMode,
  type RpcProviderMode,
  isValidRpcUrl,
} from "../../config/networkConfig";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Checkbox } from "../ui/checkbox";
import { Eye, EyeSlash, CheckCircle, WarningCircle, CircleNotch } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface RpcSettingsPanelProps {
  onClose: () => void;
  onSaved?: () => void;
}

type FormState = {
  mode: RpcProviderMode;
  alchemyApiKey: string;
  infuraProjectId: string;
  customRpcUrl: string;
  etherscanKeyMode: ExplorerKeyMode;
  rememberPersonalEtherscanKey: boolean;
  etherscanApiKey: string;
};

type ErrorKey = RpcProviderMode | "ETHERSCAN";
type AutoSaveState = "idle" | "saving" | "saved" | "error";

const RpcSettingsPanel: React.FC<RpcSettingsPanelProps> = ({ onClose, onSaved }) => {
  const [formState, setFormState] = useState<FormState>(() => {
    const config = networkConfigManager.getConfig();
    return {
      mode: config.rpcMode ?? "DEFAULT",
      alchemyApiKey: config.alchemyApiKey ?? "",
      infuraProjectId: config.infuraProjectId ?? "",
      customRpcUrl: config.customRpcUrl ?? "",
      etherscanKeyMode: config.etherscanKeyMode ?? "default",
      rememberPersonalEtherscanKey: config.rememberPersonalEtherscanKey ?? false,
      etherscanApiKey: config.etherscanApiKey ?? "",
    };
  });
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("saved");
  const [showAlchemyKey, setShowAlchemyKey] = useState(false);
  const [showInfuraKey, setShowInfuraKey] = useState(false);
  const [showEtherscanKey, setShowEtherscanKey] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);
  const initialSyncRef = useRef(true);

  const formStateRef = useRef(formState);
  formStateRef.current = formState;
  useEffect(() => {
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
          etherscanKeyMode: fs.etherscanKeyMode,
          rememberPersonalEtherscanKey: fs.rememberPersonalEtherscanKey,
          etherscanApiKey: fs.etherscanApiKey.trim(),
        });
      }
    };
  }, []);

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
    if (state.etherscanKeyMode === "personal" && !state.etherscanApiKey.trim()) {
      nextErrors.ETHERSCAN = "Personal API key required";
    }
    return nextErrors;
  };

  useEffect(() => {
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
      autoSaveTimer.current = null;
      networkConfigManager.saveConfig({
        rpcMode: formState.mode,
        alchemyApiKey: formState.alchemyApiKey.trim(),
        infuraProjectId: formState.infuraProjectId.trim(),
        customRpcUrl: formState.customRpcUrl.trim(),
        etherscanKeyMode: formState.etherscanKeyMode,
        rememberPersonalEtherscanKey: formState.rememberPersonalEtherscanKey,
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
  }, [formState, onSaved]);

  return (
    <div className="space-y-3 pt-3">
      <p className="text-xs text-muted-foreground">
        Personal settings stay in your browser; the app default explorer key stays server-side.
      </p>

      <Tabs
        value={formState.mode}
        onValueChange={(value) =>
          setFormState((prev) => ({ ...prev, mode: value as RpcProviderMode }))
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="DEFAULT" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Default
          </TabsTrigger>
          <TabsTrigger value="ALCHEMY" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Alchemy
          </TabsTrigger>
          <TabsTrigger value="INFURA" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Infura
          </TabsTrigger>
          <TabsTrigger value="CUSTOM" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Custom
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <Label
          htmlFor="provider-input"
          className={cn(formState.mode === "DEFAULT" && "text-muted-foreground")}
        >
          {formState.mode === "DEFAULT" && "No configuration needed"}
          {formState.mode === "ALCHEMY" && "Alchemy API Key"}
          {formState.mode === "INFURA" && "Infura Project ID"}
          {formState.mode === "CUSTOM" && "Custom RPC URL"}
        </Label>
        <div className="flex gap-2">
          {formState.mode === "DEFAULT" ? (
            <Input disabled placeholder="Using public RPC endpoints" className="flex-1" />
          ) : formState.mode === "ALCHEMY" ? (
            <Input
              id="provider-input"
              type={showAlchemyKey ? "text" : "password"}
              value={formState.alchemyApiKey}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, alchemyApiKey: e.target.value }))
              }
              placeholder="Enter API key..."
              className={cn("flex-1", errors.ALCHEMY && "border-destructive")}
            />
          ) : formState.mode === "INFURA" ? (
            <Input
              id="provider-input"
              type={showInfuraKey ? "text" : "password"}
              value={formState.infuraProjectId}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, infuraProjectId: e.target.value }))
              }
              placeholder="Enter project ID..."
              className={cn("flex-1", errors.INFURA && "border-destructive")}
            />
          ) : (
            <Input
              id="provider-input"
              type="url"
              value={formState.customRpcUrl}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, customRpcUrl: e.target.value }))
              }
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
              {(formState.mode === "ALCHEMY" ? showAlchemyKey : showInfuraKey) ? (
                <EyeSlash className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {(errors.ALCHEMY || errors.INFURA || errors.CUSTOM) && (
          <p className="text-xs text-destructive">
            {errors.ALCHEMY || errors.INFURA || errors.CUSTOM}
          </p>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t">
        <div className="flex items-center gap-2">
          <Label>Etherscan-Style Explorer Key</Label>
          <Badge variant="outline" className="text-[10px]">
            Optional
          </Badge>
        </div>
        <RadioGroup
          value={formState.etherscanKeyMode}
          onValueChange={(value) =>
            setFormState((prev) => ({ ...prev, etherscanKeyMode: value as ExplorerKeyMode }))
          }
          className="gap-2"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2">
            <RadioGroupItem value="default" id="etherscan-mode-default" className="mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Use app default key</span>
              <p className="text-xs text-muted-foreground">
                Requests go through the app proxy.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2">
            <RadioGroupItem value="personal" id="etherscan-mode-personal" className="mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Use my own key</span>
              <p className="text-xs text-muted-foreground">
                Your browser sends the key to the same-origin proxy for explorer lookups.
              </p>
            </div>
          </label>
        </RadioGroup>

        {formState.etherscanKeyMode === "personal" ? (
          <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
            <div className="flex gap-2">
              <Input
                id="etherscan-key"
                type={showEtherscanKey ? "text" : "password"}
                value={formState.etherscanApiKey}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, etherscanApiKey: e.target.value }))
                }
                placeholder="Enter API key..."
                className={cn("flex-1", errors.ETHERSCAN && "border-destructive")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowEtherscanKey(!showEtherscanKey)}
              >
                {showEtherscanKey ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={formState.rememberPersonalEtherscanKey}
                onCheckedChange={(checked) =>
                  setFormState((prev) => ({
                    ...prev,
                    rememberPersonalEtherscanKey: checked === true,
                  }))
                }
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                Remember personal key on this device. If unchecked, it stays session-scoped and
                clears when the tab closes.
              </span>
            </label>
            {errors.ETHERSCAN && (
              <p className="text-xs text-destructive">{errors.ETHERSCAN}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Personal keys stored in the browser are still visible to browser scripts and
              extensions on this device.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Default mode keeps the shared explorer key off the client and works across supported
            Etherscan-style networks.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-1.5 text-xs">
          {autoSaveState === "saving" && (
            <>
              <CircleNotch className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Saving...</span>
            </>
          )}
          {autoSaveState === "saved" && (
            <>
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-500">Saved</span>
            </>
          )}
          {autoSaveState === "error" && (
            <>
              <WarningCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">Check fields</span>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
};

export default RpcSettingsPanel;
