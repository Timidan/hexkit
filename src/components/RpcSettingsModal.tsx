import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  userRpcManager,
  type RpcProviderMode,
  isValidRpcUrl,
} from "../utils/userRpc";
import type { Chain } from "../types";
import SegmentedControl from "./shared/SegmentedControl";

interface RpcSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  currentChain?: Chain | null;
}

type FormState = {
  mode: RpcProviderMode;
  alchemyKey: string;
  infuraKey: string;
  genericUrl: string;
};

type AutoSaveState = "idle" | "saving" | "saved" | "error";
type SecretField = "alchemy" | "infura";

const EyeIcon: React.FC<{ isRevealed: boolean }> = ({ isRevealed }) =>
  isRevealed ? (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      role="img"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 10c2.2-4 5.3-6 8.5-6s6.3 2 8.5 6c-2.2 4-5.3 6-8.5 6s-6.3-2-8.5-6Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      role="img"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.2c-1.4 1-2.6 2.4-3.5 3.8 2.2 4 5.3 6 8.5 6 1 0 2-.15 2.9-.44" />
      <path d="M7.5 7.5a3 3 0 0 0 4 4" />
      <path d="M18.5 10c-.9-1.6-2.1-3-3.6-4.1" />
      <path d="M2 2l16 16" />
    </svg>
  );

const CloseIcon: React.FC = () => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
    role="img"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 5l10 10" />
    <path d="M15 5l-10 10" />
  </svg>
);

const PROVIDER_DESCRIPTIONS: Record<RpcProviderMode, string> = {
  DEFAULT:
    "Use the application defaults (environment variables or bundled public RPC).",
  ALCHEMY:
    "Use Alchemy endpoints for all supported networks. Requires your personal API key.",
  INFURA:
    "Use Infura endpoints for supported networks. Requires your project ID.",
  GENERIC: "Use a custom RPC URL for every network (advanced).",
};

const PROVIDER_TITLES: Record<RpcProviderMode, string> = {
  DEFAULT: "Default",
  ALCHEMY: "Alchemy",
  INFURA: "Infura",
  GENERIC: "Custom RPC",
};

const SUPPORTED_BY_ALCHEMY = [
  "Ethereum Mainnet",
  "Ethereum Sepolia",
  "Base Mainnet / Sepolia",
  "Polygon Mainnet / Amoy",
  "Arbitrum Mainnet / Sepolia",
  "Optimism Mainnet / Sepolia",
  "Avalanche Mainnet",
];

const SUPPORTED_BY_INFURA = [
  "Ethereum Mainnet / Sepolia",
  "Base Mainnet / Sepolia",
  "Polygon Mainnet / Amoy",
  "Arbitrum Mainnet / Sepolia",
  "Optimism Mainnet / Sepolia",
  "Avalanche Mainnet",
];

const RpcSettingsModal: React.FC<RpcSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  currentChain,
}) => {
  const [formState, setFormState] = useState<FormState>({
    mode: "DEFAULT",
    alchemyKey: "",
    infuraKey: "",
    genericUrl: "",
  });
  const [errors, setErrors] = useState<{ [P in RpcProviderMode]?: string }>({});
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [secretVisibility, setSecretVisibility] = useState<Record<SecretField, boolean>>({
    alchemy: false,
    infura: false,
  });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const initialSyncRef = useRef(true);

  useEffect(() => {
    if (!isOpen) return;
    const settings = userRpcManager.getSettings();
    setFormState({
      mode: settings.mode ?? "DEFAULT",
      alchemyKey: settings.alchemyKey ?? "",
      infuraKey: settings.infuraKey ?? "",
      genericUrl: settings.genericUrl ?? "",
    });
    setSecretVisibility({
      alchemy: false,
      infura: false,
    });
    setErrors({});
    setAutoSaveState("saved");
    initialSyncRef.current = true;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen && autoSaveTimer.current) {
      window.clearTimeout(autoSaveTimer.current);
    }
  }, [isOpen]);

  const handleModeChange = (mode: RpcProviderMode) => {
    setFormState((prev) => ({ ...prev, mode }));
  };

  const handleKeyActivate = (
    event: React.KeyboardEvent<HTMLElement>,
    action: () => void,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const toggleSecretVisibility = (field: SecretField) => {
    setSecretVisibility((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const computeErrors = (state: FormState) => {
    const nextErrors: typeof errors = {};
    if (state.mode === "ALCHEMY" && !state.alchemyKey.trim()) {
      nextErrors.ALCHEMY = "Alchemy API key required.";
    }
    if (state.mode === "INFURA" && !state.infuraKey.trim()) {
      nextErrors.INFURA = "Infura project ID required.";
    }
    if (state.mode === "GENERIC") {
      if (!state.genericUrl.trim()) {
        nextErrors.GENERIC = "Custom RPC URL required.";
      } else if (!isValidRpcUrl(state.genericUrl)) {
        nextErrors.GENERIC = "Enter a valid HTTP(s) RPC URL.";
      }
    }
    return nextErrors;
  };

  const providerHint = useMemo(() => {
    if (!currentChain) {
      return null;
    }

    if (formState.mode === "GENERIC") {
      return `Custom RPC will be expected to serve chain ID ${currentChain.id} (${currentChain.name}).`;
    }

    if (formState.mode === "ALCHEMY") {
      return `Alchemy supports: ${SUPPORTED_BY_ALCHEMY.join(", ")}`;
    }

    if (formState.mode === "INFURA") {
      return `Infura supports: ${SUPPORTED_BY_INFURA.join(", ")}`;
    }

    return null;
  }, [currentChain, formState.mode]);

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
      userRpcManager.saveSettings({
        mode: formState.mode,
        alchemyKey: formState.alchemyKey.trim(),
        infuraKey: formState.infuraKey.trim(),
        genericUrl: formState.genericUrl.trim(),
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

  const providerSegments = useMemo(
    () => [
      {
        value: "DEFAULT" as RpcProviderMode,
        label: (
          <span className="rpc-segment-label">
            <strong>Default</strong>
            <small>Toolkit defaults</small>
          </span>
        ),
      },
      {
        value: "ALCHEMY" as RpcProviderMode,
        label: (
          <span className="rpc-segment-label">
            <strong>Alchemy</strong>
            <small>API key required</small>
          </span>
        ),
      },
      {
        value: "INFURA" as RpcProviderMode,
        label: (
          <span className="rpc-segment-label">
            <strong>Infura</strong>
            <small>Project ID required</small>
          </span>
        ),
      },
      {
        value: "GENERIC" as RpcProviderMode,
        label: (
          <span className="rpc-segment-label">
            <strong>Custom RPC</strong>
            <small>Advanced</small>
          </span>
        ),
      },
    ],
    []
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="rpc-settings-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="rpc-settings-title"
    >
      <div className="rpc-settings-header">
        <div>
          <p className="rpc-settings-eyebrow">Connection</p>
          <h3 id="rpc-settings-title">RPC Provider Settings</h3>
        </div>
        <div className="rpc-settings-actions">
          <span className={`rpc-autosave rpc-autosave--${autoSaveState}`}>
            {autoSaveState === "saving" && "Saving..."}
            {autoSaveState === "saved" && "Saved"}
            {autoSaveState === "error" && "Check required fields"}
            {autoSaveState === "idle" && "Ready"}
          </span>
          <span
            role="button"
            tabIndex={0}
            className="inline-copy-icon rpc-popover-close"
            onClick={onClose}
            onKeyDown={(event) => handleKeyActivate(event, onClose)}
            aria-label="Close RPC settings"
            style={{ "--inline-copy-hit-padding": "6px" } as React.CSSProperties}
          >
            <CloseIcon />
          </span>
        </div>
      </div>

      <p className="rpc-settings-description">
        Configure which RPC provider the toolkit should use. Your preferences are cached
        locally and never leave this browser.
      </p>

      <div className="rpc-settings-card">
        <SegmentedControl
          className="rpc-provider-control"
          ariaLabel="RPC provider selector"
          value={formState.mode}
          onChange={(value) => handleModeChange(value as RpcProviderMode)}
          options={providerSegments}
        />
        <div className="rpc-provider-details">
          <h4>{PROVIDER_TITLES[formState.mode]}</h4>
          <p>{PROVIDER_DESCRIPTIONS[formState.mode]}</p>
          {providerHint && <div className="rpc-provider-hint">{providerHint}</div>}
        </div>
      </div>

      {formState.mode === "ALCHEMY" && (
        <div className="rpc-input-card">
          <label htmlFor="rpc-alchemy-key">Alchemy API Key</label>
          <div className="rpc-input-field">
            <input
              id="rpc-alchemy-key"
              type={secretVisibility.alchemy ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={formState.alchemyKey}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  alchemyKey: e.target.value,
                }))
              }
              placeholder="Paste your Alchemy API key..."
            />
            {formState.alchemyKey && (
              <span
                role="button"
                tabIndex={0}
                className="inline-copy-icon rpc-input-toggle"
                onClick={() => toggleSecretVisibility("alchemy")}
                onKeyDown={(event) =>
                  handleKeyActivate(event, () => toggleSecretVisibility("alchemy"))
                }
                aria-pressed={secretVisibility.alchemy}
                aria-label={`${secretVisibility.alchemy ? "Hide" : "Show"} Alchemy API key`}
                style={{ "--inline-copy-hit-padding": "4px" } as React.CSSProperties}
              >
                <EyeIcon isRevealed={secretVisibility.alchemy} />
              </span>
            )}
          </div>
          {errors.ALCHEMY ? (
            <small className="form-error">{errors.ALCHEMY}</small>
          ) : (
            <small className="form-hint">Saved locally and encrypted at rest.</small>
          )}
          <div className="rpc-support">
            <span>Supported networks</span>
            <div className="rpc-support-grid">
              {SUPPORTED_BY_ALCHEMY.map((network) => (
                <span key={network} className="rpc-support-chip">
                  {network}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {formState.mode === "INFURA" && (
        <div className="rpc-input-card">
          <label htmlFor="rpc-infura-key">Infura Project ID</label>
          <div className="rpc-input-field">
            <input
              id="rpc-infura-key"
              type={secretVisibility.infura ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={formState.infuraKey}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  infuraKey: e.target.value,
                }))
              }
              placeholder="Paste your Infura project ID..."
            />
            {formState.infuraKey && (
              <span
                role="button"
                tabIndex={0}
                className="inline-copy-icon rpc-input-toggle"
                onClick={() => toggleSecretVisibility("infura")}
                onKeyDown={(event) =>
                  handleKeyActivate(event, () => toggleSecretVisibility("infura"))
                }
                aria-pressed={secretVisibility.infura}
                aria-label={`${secretVisibility.infura ? "Hide" : "Show"} Infura project ID`}
                style={{ "--inline-copy-hit-padding": "4px" } as React.CSSProperties}
              >
                <EyeIcon isRevealed={secretVisibility.infura} />
              </span>
            )}
          </div>
          {errors.INFURA ? (
            <small className="form-error">{errors.INFURA}</small>
          ) : (
            <small className="form-hint">Stored only in your browser cache.</small>
          )}
          <div className="rpc-support">
            <span>Supported networks</span>
            <div className="rpc-support-grid">
              {SUPPORTED_BY_INFURA.map((network) => (
                <span key={network} className="rpc-support-chip">
                  {network}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {formState.mode === "GENERIC" && (
        <div className="rpc-input-card">
          <label htmlFor="rpc-generic-url">Custom RPC URL</label>
          <div className="rpc-input-field rpc-input-field--no-toggle">
            <input
              id="rpc-generic-url"
              type="text"
              value={formState.genericUrl}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  genericUrl: e.target.value,
                }))
              }
              placeholder="https://your-node.example.com"
            />
          </div>
          {errors.GENERIC ? (
            <small className="form-error">{errors.GENERIC}</small>
          ) : (
            <small className="form-hint">
              Ensure the endpoint supports trace, impersonation, and archive data.
            </small>
          )}
        </div>
      )}

      {formState.mode === "DEFAULT" && (
        <div className="rpc-input-card">
          <p>
            Toolkit defaults rely on environment variables and bundled public RPCs. No action
            is required, but you can override with a provider at any time.
          </p>
        </div>
      )}
    </div>,
    document.body
  );
};

export default RpcSettingsModal;
