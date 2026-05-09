// Chain-agnostic presentational toolbar for any step debugger.
//
// Splits the original `DebugToolbar` into a pure shell that takes
// props. The EVM toolbar wires `useDebug()`/`useSimulation()` into
// these props; the Starknet (Cairo VM) toolbar feeds Cairo-shaped
// step state in.
//
// Optional capability props (`onStepOut`, `onStepOver`, evaluate,
// breakpoints, …) collapse the corresponding controls when omitted —
// chains that don't have the concept simply don't pass the handler.

import React from "react";
import {
  SkipBack,
  CaretLeft,
  CaretRight,
  SkipForward,
  ArrowLineDown,
  ArrowLineUp,
  ArrowBendRightUp,
  ArrowRight,
  Pause,
  BracketsCurly,
  DotsThree,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "../../ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../../ui/hover-card";
import { Badge } from "../../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

export interface DebugToolbarShellProps {
  className?: string;
  /** Whether a debug session / trace is loaded — disables the toolbar when false. */
  isActive: boolean;
  isLoading?: boolean;

  /** "Step 5 / 200"-style label. Pass a number, a string, or `null` for "-". */
  stepLabel: number | string | null;
  totalSteps: number | null;

  canStepPrev: boolean;
  canStepNext: boolean;
  onStepPrev: () => void;
  onStepNext: () => void;

  /** "Step Out" — exit current call. Omit to hide the button. */
  onStepOut?: () => void;
  canStepOut?: boolean;
  /** "Step Over" — skip nested calls at current depth. Omit to hide. */
  onStepOver?: () => void;
  canStepOver?: boolean;
  /** Jump to the next reverted frame. Omit to hide the button. */
  onJumpToRevert?: () => void;
  canJumpToRevert?: boolean;
  revertButtonLabel?: string;
  /** Jump to first / last step. Omit to hide the dropdown items. */
  onGoToFirst?: () => void;
  onGoToLast?: () => void;
  /** Per-call-frame stepping. Omit to hide the dropdown items. */
  onStepPrevCall?: () => void;
  onStepNextCall?: () => void;
  /** Continue-to-breakpoint backward. Omit to hide. */
  onContinueBackward?: () => void;
  hasBreakpoints?: boolean;

  /** Evaluate-expression button. Omit `onOpenEvaluate` to hide entirely.
   *  When `evaluateDisabledReason` is set, the button stays visible but
   *  greys out and shows the reason on hover. */
  onOpenEvaluate?: () => void;
  evaluateDisabledReason?: string | null;
  evaluateBeta?: boolean;

  /** Right-side label for the runtime ("EVM", "Cairo VM", …). When set,
   *  renders a small chip on the left edge of the toolbar. */
  runtimeLabel?: string;
  runtimeIcon?: React.ReactNode;

  /** Right-edge keyboard shortcut hints. Defaults to "← prev / → next". */
  keyboardHints?: React.ReactNode;
}

export const DebugToolbarShell: React.FC<DebugToolbarShellProps> = React.memo(
  ({
    className,
    isActive,
    isLoading = false,
    stepLabel,
    totalSteps,
    canStepPrev,
    canStepNext,
    onStepPrev,
    onStepNext,
    onStepOut,
    canStepOut,
    onStepOver,
    canStepOver,
    onJumpToRevert,
    canJumpToRevert,
    revertButtonLabel = "→ Revert",
    onGoToFirst,
    onGoToLast,
    onStepPrevCall,
    onStepNextCall,
    onContinueBackward,
    hasBreakpoints = false,
    onOpenEvaluate,
    evaluateDisabledReason,
    evaluateBeta = true,
    runtimeLabel,
    runtimeIcon,
    keyboardHints,
  }) => {
    const showDropdown =
      !!onGoToFirst ||
      !!onGoToLast ||
      !!onStepPrevCall ||
      !!onStepNextCall ||
      (hasBreakpoints && !!onContinueBackward);

    const totalLabel = totalSteps == null ? "∞" : totalSteps;
    const renderedStepLabel = stepLabel == null ? "-" : stepLabel;
    const stepOutEnabled = canStepOut ?? canStepNext;
    const stepOverEnabled = canStepOver ?? canStepNext;
    const jumpToRevertEnabled = canJumpToRevert ?? Boolean(onJumpToRevert);

    return (
      <div
        className={`flex items-center gap-1 px-3 py-1.5 bg-transparent border-b border-border/50 ${
          className || ""
        }`}
      >
        {runtimeLabel && (
          <div className="flex items-center gap-2 pr-2 mr-1 border-r border-border/40">
            {runtimeIcon}
            <span className="text-xs font-medium text-muted-foreground">
              {runtimeLabel}
            </span>
          </div>
        )}

        <div className="flex items-center border border-border/30 rounded-md overflow-hidden divide-x divide-border/20">
          {onStepOut && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onStepOut}
                  disabled={!stepOutEnabled || isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
                >
                  <ArrowBendRightUp className="h-3.5 w-3.5" />
                  <span>Step Out</span>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent side="top">
                <div className="flex flex-col gap-1">
                  <span>Exit current call, return to caller</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] w-fit">
                    u
                  </kbd>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}

          {onStepOver && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onStepOver}
                  disabled={!stepOverEnabled || isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Step Over</span>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent side="top">
                <div className="flex flex-col gap-1">
                  <span>Skip nested calls, stay at current depth</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] w-fit">
                    o
                  </kbd>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={onStepPrev}
                disabled={!canStepPrev || isLoading}
                data-testid="debugger-prev-step"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
              >
                <CaretLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="top">
              <div className="flex items-center gap-2">
                <span>Previous step</span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">←</kbd>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={onStepNext}
                disabled={!canStepNext || isLoading}
                data-testid="debugger-next-step"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
              >
                <CaretRight className="h-3.5 w-3.5" />
                <span>Next</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="top">
              <div className="flex items-center gap-2">
                <span>Next step</span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">→</kbd>
              </div>
            </HoverCardContent>
          </HoverCard>

          {onJumpToRevert && (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onJumpToRevert}
                  disabled={!jumpToRevertEnabled || isLoading}
                  data-testid="debugger-jump-revert"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
                >
                  <Warning className="h-3.5 w-3.5" />
                  <span>{revertButtonLabel}</span>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent side="top">
                <div className="flex flex-col gap-1">
                  <span>Jump to the first step in a reverted frame</span>
                  <span className="text-[10px] text-muted-foreground">
                    Cycles when multiple reverted frames exist
                  </span>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>

        {onOpenEvaluate && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={onOpenEvaluate}
                disabled={!!evaluateDisabledReason}
                className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-stone-400/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <BracketsCurly className="h-3.5 w-3.5 transition-transform group-hover:scale-110 group-hover:rotate-6" />
                <span>Evaluate</span>
                {evaluateBeta && (
                  <span className="text-[8px] text-amber-500/70 font-semibold ml-0.5">
                    beta
                  </span>
                )}
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="top">
              <div className="flex flex-col gap-1">
                {evaluateDisabledReason ? (
                  <span className="text-amber-400 text-xs">
                    {evaluateDisabledReason}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      {evaluateBeta && (
                        <span className="px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded">
                          BETA
                        </span>
                      )}
                      Evaluate expressions
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      May be unstable
                    </span>
                  </>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        )}

        {showDropdown && (
          <DropdownMenu>
            <HoverCard>
              <HoverCardTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!isActive}
                    className="flex items-center px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <DotsThree className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </HoverCardTrigger>
              <HoverCardContent side="top">More navigation options</HoverCardContent>
            </HoverCard>
            <DropdownMenuContent align="start" className="w-52">
              {onGoToFirst && (
                <DropdownMenuItem
                  onClick={onGoToFirst}
                  disabled={!canStepPrev || isLoading}
                >
                  <SkipBack className="h-4 w-4 mr-2" />
                  Go to First
                  <span className="ml-auto text-xs text-muted-foreground">Home</span>
                </DropdownMenuItem>
              )}
              {onGoToLast && (
                <DropdownMenuItem
                  onClick={onGoToLast}
                  disabled={!canStepNext || isLoading}
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Go to Last
                  <span className="ml-auto text-xs text-muted-foreground">End</span>
                </DropdownMenuItem>
              )}
              {(onStepPrevCall || onStepNextCall) && (onGoToFirst || onGoToLast) && (
                <DropdownMenuSeparator />
              )}
              {onStepPrevCall && (
                <DropdownMenuItem
                  onClick={onStepPrevCall}
                  disabled={!canStepPrev || isLoading}
                >
                  <ArrowLineUp className="h-4 w-4 mr-2" />
                  Previous Call
                </DropdownMenuItem>
              )}
              {onStepNextCall && (
                <DropdownMenuItem
                  onClick={onStepNextCall}
                  disabled={!canStepNext || isLoading}
                >
                  <ArrowLineDown className="h-4 w-4 mr-2" />
                  Next Call
                  <span className="ml-auto text-xs text-muted-foreground">F11</span>
                </DropdownMenuItem>
              )}
              {hasBreakpoints && onContinueBackward && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onContinueBackward}
                    disabled={!canStepPrev || isLoading}
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Continue Backward
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {isActive && (
            <Badge
              variant="secondary"
              className="font-mono text-xs h-7 px-3"
              data-testid="debugger-step-counter"
            >
              Step {renderedStepLabel} / {totalLabel}
            </Badge>
          )}

          {isLoading && (
            <Badge variant="outline" className="text-xs animate-pulse">
              Loading...
            </Badge>
          )}
        </div>

        {keyboardHints && (
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground font-mono ml-2">
            {keyboardHints}
          </div>
        )}
      </div>
    );
  },
);

DebugToolbarShell.displayName = "DebugToolbarShell";

export default DebugToolbarShell;
