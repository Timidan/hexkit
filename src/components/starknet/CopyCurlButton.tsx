import React, { useState } from "react";
import { Check, Terminal } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { buildBridgeCurl, type CurlOptions } from "./bridgeCurl";

interface Props extends CurlOptions {
  /** Disabled until the form has a valid built request. The button
   *  itself doesn't validate — the caller decides when to enable. */
  disabled?: boolean;
  className?: string;
  label?: string;
}

export const CopyCurlButton: React.FC<Props> = ({
  method,
  path,
  body,
  disabled,
  className,
  label = "Copy as cURL",
}) => {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const cmd = buildBridgeCurl({ method, path, body });
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write blocked — fall back to a manual prompt copy.
      window.prompt("Copy this curl command", cmd);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={copied ? <Check size={14} /> : <Terminal size={14} />}
      onClick={onClick}
      disabled={disabled}
      data-testid="copy-as-curl"
      className={className}
    >
      {copied ? "Copied" : label}
    </Button>
  );
};

export default CopyCurlButton;
