import React from "react";
import { ArrowLeft, ShareNetwork, ArrowsClockwise, DownloadSimple } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import { DebugPillButton } from "./DebugPillButton";
import type { DebugPrepState } from "../../types/debug";

interface ResultsHeaderProps {
  statusColor: string;
  statusLabel: string;
  statusIcon: string;
  handleBack: () => void;
  handleExportTestData: () => void;
  handleShare: () => void;
  handleOpenDebug: () => void;
  handleReSimulate: () => void;
  closeDebugWindow: () => void;
  isDebugging: boolean;
  isDebugLoading: boolean;
  debugEnabled?: boolean;
  hasLiveDebugSession: boolean;
  debugPrepState: DebugPrepState;
  cancelDebugPrep: () => void;
}

export const ResultsHeader: React.FC<ResultsHeaderProps> = ({
  statusColor,
  statusLabel,
  statusIcon,
  handleBack,
  handleExportTestData,
  handleShare,
  handleOpenDebug,
  handleReSimulate,
  closeDebugWindow,
  isDebugging,
  isDebugLoading,
  debugEnabled,
  hasLiveDebugSession,
  debugPrepState,
  cancelDebugPrep,
}) => {
  return (
    <header className="sim-results-header">
      <div className="sim-results-header__left">
        <Button
          onClick={handleBack}
          variant="outline"
          size="icon"
          aria-label="Back to Builder"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="sim-results-header__title">
          <span>Simulation</span>
          <span
            className="sim-results-status-pill"
            style={{ color: statusColor }}
          >
            {statusIcon} {statusLabel}
          </span>
        </div>
      </div>
      <div className="sim-results-header__actions">
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              onClick={handleExportTestData}
              variant="outline"
              size="icon"
              aria-label="Export test script"
            >
              <DownloadSimple size={18} />
            </Button>
          </HoverCardTrigger>
          <HoverCardContent>Export EDB test script</HoverCardContent>
        </HoverCard>
        <Button
          onClick={handleShare}
          variant="outline"
          size="icon"
          aria-label="Share simulation"
        >
          <ShareNetwork size={18} />
        </Button>
        <DebugPillButton
          debugPrepState={debugPrepState}
          isDebugging={isDebugging}
          isDebugLoading={isDebugLoading}
          debugEnabled={debugEnabled}
          hasLiveDebugSession={hasLiveDebugSession}
          onOpenDebug={handleOpenDebug}
          onCloseDebug={closeDebugWindow}
          onCancelPrep={cancelDebugPrep}
        />
        <Button onClick={handleReSimulate} variant="ghost" className="gap-2">
          <ArrowsClockwise size={16} />
          Re-Simulate
        </Button>
      </div>
    </header>
  );
};
