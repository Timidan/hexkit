import React, { useState, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatedTabContent } from '../ui/animated-tabs';
import ContractExplorer from './ContractExplorer';

type SourceSubTool = 'explorer' | 'diff' | 'storage';

const ContractDiff = React.lazy(() => import('./ContractDiff'));
const StorageLayoutViewer = React.lazy(() => import('./StorageLayoutViewer'));

interface SourceToolsProps {
  initialTool?: SourceSubTool;
}

const SOURCE_SUB_TOOLS: SourceSubTool[] = ['explorer', 'diff', 'storage'];

function isSourceSubTool(value: string | null): value is SourceSubTool {
  return value !== null && SOURCE_SUB_TOOLS.includes(value as SourceSubTool);
}

const SourceTools: React.FC<SourceToolsProps> = ({ initialTool = 'explorer' }) => {
  const location = useLocation();
  const [activeTool, setActiveTool] = useState<SourceSubTool>(initialTool);

  useEffect(() => {
    setActiveTool(initialTool);
  }, [initialTool]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTool = params.get('tool');
    if (isSourceSubTool(requestedTool) && requestedTool !== activeTool) {
      setActiveTool(requestedTool);
    }
  }, [location.search, activeTool]);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Sub-tool selector is now in the capsule Navigation — driven via ?tool= URL param */}

      <div className="tool-content-container flex-1 min-h-0 overflow-hidden">
        {/* Storage tab rendered outside AnimatePresence to avoid react-resizable-panels measurement issues */}
        {activeTool === 'storage' ? (
          <div className="h-full w-full">
            <Suspense fallback={<div className="text-xs text-muted-foreground text-center py-12">Loading storage viewer...</div>}>
              <StorageLayoutViewer />
            </Suspense>
          </div>
        ) : (
          <AnimatedTabContent activeKey={activeTool} className="h-full w-full">
            {activeTool === 'explorer' && <ContractExplorer />}
            {activeTool === 'diff' && (
              <Suspense fallback={<div className="text-xs text-muted-foreground text-center py-12">Loading diff tool...</div>}>
                <ContractDiff />
              </Suspense>
            )}
          </AnimatedTabContent>
        )}
      </div>
    </div>
  );
};

export default SourceTools;
