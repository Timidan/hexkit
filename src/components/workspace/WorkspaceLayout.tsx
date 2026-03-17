import React, { useState } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ActivityRail, type WorkspaceView } from './ActivityRail';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkspaceStatusBar } from './WorkspaceStatusBar';
import { FileExplorer } from './panels/FileExplorer';
import { ChainControlPanel } from './panels/ChainControlPanel';
import { ConsolePanel } from './panels/ConsolePanel';

export function WorkspaceLayout() {
  const [activeView, setActiveView] = useState<WorkspaceView>('files');

  return (
    <div className="flex flex-col h-screen w-screen">
      <WorkspaceToolbar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityRail activeView={activeView} onViewChange={setActiveView} />
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18%" minSize="15%" maxSize="25%">
            {activeView === 'files' && <FileExplorer />}
            {activeView === 'search' && (
              <div className="p-3 text-sm text-muted-foreground">Search — coming soon</div>
            )}
            {activeView === 'outline' && (
              <div className="p-3 text-sm text-muted-foreground">Outline — coming soon</div>
            )}
            {activeView === 'history' && (
              <div className="p-3 text-sm text-muted-foreground">Deploy history — coming soon</div>
            )}
            {activeView === 'settings' && (
              <div className="p-3 text-sm text-muted-foreground">Settings — coming soon</div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="52%" minSize="40%">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="70%">
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Editor — open a file to begin
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="30%" minSize="15%">
                <ConsolePanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="30%" minSize="20%" maxSize="35%">
            <ChainControlPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <WorkspaceStatusBar />
    </div>
  );
}
