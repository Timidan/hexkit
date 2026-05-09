// Per-arg detail modal for the Starknet trace (Voyager-parity).
//
// Originally this opened the full FunctionInvocation envelope
// (function/selector/caller/target/classHash/calldata/result/events).
// Voyager scopes its modal to a single composite argument instead —
// frame-level metadata stays in the CONTRACTS-tab right-rail
// FrameDetailPane. This component is the parallel surface to the
// per-arg modal: same DOM/CSS shape as EDB's `selectedTraceDetail`
// popover so the visuals stay byte-identical to EDB's modal chrome.
//
// Caller passes pre-computed `{title, value}` (with `value` already
// JSON-stringified) so this component is purely presentational.

import { useEffect } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";

export interface StarknetArgDetailModalProps {
  /** `null` keeps the modal closed. `value` is a pre-stringified JSON
   *  body — caller is responsible for formatting. Title typically
   *  reads `argName · fully::qualified::TypeName`. */
  detail: { title: string; value: string } | null;
  onClose: () => void;
}

/** Pretty-printed JSON tree modal. Mirrors EDB's `selectedTraceDetail`
 *  popover layout (toolbar with title + copy + close, `<pre>` body)
 *  by reusing its CSS classes — the dark popover chrome stays
 *  byte-identical to EDB and updates centrally if EDB refreshes its
 *  theme. */
export function StarknetArgDetailModal({
  detail,
  onClose,
}: StarknetArgDetailModalProps) {
  // Esc-to-close. Hooked at window level so the modal closes
  // regardless of which element holds focus when the key is pressed.
  useEffect(() => {
    if (!detail) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detail, onClose]);

  if (!detail) return null;

  return (
    <>
      <div className="exec-event-backdrop" onClick={onClose} />
      <div
        className="exec-event-popover exec-event-popover--modal"
        data-testid="starknet-arg-detail-modal"
        // Stop bubbling so a click on the modal body never reaches
        // the backdrop's onClick. (The backdrop sits beneath via
        // z-index.)
        onClick={(e) => e.stopPropagation()}
      >
        <div className="exec-event-popover-toolbar">
          <div className="exec-event-popover-title">{detail.title}</div>
          <CopyButton value={detail.value} />
          <Button
            type="button"
            variant="icon-borderless"
            size="icon-inline"
            className="exec-event-popover-close"
            onClick={onClose}
            aria-label="Close"
          >
            {"×"}
          </Button>
        </div>
        <pre className="exec-event-json">{detail.value}</pre>
      </div>
    </>
  );
}

/** Backwards-compatible alias — many imports still reference the old
 *  name and the new component exposes the same `{title, value}` API
 *  the caller now provides. */
export const StarknetFrameDetailModal = StarknetArgDetailModal;

export default StarknetArgDetailModal;
