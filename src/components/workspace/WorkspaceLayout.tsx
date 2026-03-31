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
import { CodeViewer } from './panels/CodeViewer';
import { SearchPanel } from './panels/SearchPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { SettingsPanel } from './panels/SettingsPanel';

export function WorkspaceLayout() {
  const [activeView, setActiveView] = useState<WorkspaceView>('files');

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950">
      <WorkspaceToolbar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityRail activeView={activeView} onViewChange={setActiveView} />
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18%" minSize="15%" maxSize="25%">
            <div className="h-full bg-zinc-950">
              {activeView === 'files' && <FileExplorer />}
              {activeView === 'search' && <SearchPanel />}
              {activeView === 'outline' && <OutlinePanel />}
              {activeView === 'history' && <HistoryPanel />}
              {activeView === 'settings' && <SettingsPanel />}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="52%" minSize="40%">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="70%">
                <CodeViewer />
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
