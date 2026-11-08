import React, { useState, Suspense, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { AnimatedTabContent } from '../ui/animated-tabs';
import LoadingSpinner from '../shared/LoadingSpinner';
import { MIN_SUBTAB_LOADER_MS, useRouteLoading } from '../../hooks/useRouteLoading';
import ContractExplorer from './ContractExplorer';
import { Code, GitDiff, Database } from '@phosphor-icons/react';

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
  const navigate = useNavigate();
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

  const handleToolChange = useCallback((value: string) => {
    if (!isSourceSubTool(value)) return;

    setActiveTool(value);

    const params = new URLSearchParams(location.search);
    if (params.get('tool') === value) return;

    params.set('tool', value);
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  // Loader on sub-tool changes; the previous view stays mounted while hidden.
  // Prefer the URL value so an external sub-tab click is covered immediately,
  // before the state-sync effect runs.
  const requestedTool = new URLSearchParams(location.search).get('tool');
  const gateTool = isSourceSubTool(requestedTool) ? requestedTool : activeTool;
  const isToolLoading = useRouteLoading(gateTool, MIN_SUBTAB_LOADER_MS);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Sub-tool selector is now in the capsule Navigation — driven via ?tool= URL param */}

      {isToolLoading && <LoadingSpinner text="Loading" fullPage />}

      <div className="tool-content-container flex-1 min-h-0 overflow-hidden" style={{ display: isToolLoading ? "none" : undefined }}>
        {/* Storage tab rendered outside AnimatePresence to avoid react-resizable-panels measurement issues */}
        {activeTool === 'storage' ? (
          <div className="h-full w-full">
            <Suspense fallback={<LoadingSpinner text="Loading storage viewer" />}>
              <StorageLayoutViewer />
            </Suspense>
          </div>
        ) : (
          <AnimatedTabContent activeKey={activeTool} className="h-full w-full">
            {activeTool === 'explorer' && <ContractExplorer />}
            {activeTool === 'diff' && (
              <Suspense fallback={<LoadingSpinner text="Loading diff tool" />}>
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
