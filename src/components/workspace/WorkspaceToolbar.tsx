import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { FolderOpen, Hammer, Rocket, Command, ChevronDown } from 'lucide-react';

export function WorkspaceToolbar() {
  const {
    isConnected, nodeType, openProject, projectRoot,
    isCompiling, compile, deploy, artifacts, isDeploying,
  } = useWorkspace();

  const [showDeployMenu, setShowDeployMenu] = useState(false);
  const deployMenuRef = useRef<HTMLDivElement>(null);

  // Close deploy menu on outside click
  useEffect(() => {
    if (!showDeployMenu) return;
    const handler = (e: MouseEvent) => {
      if (deployMenuRef.current && !deployMenuRef.current.contains(e.target as Node)) {
        setShowDeployMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDeployMenu]);

  const handleDeploy = (contractName: string) => {
    setShowDeployMenu(false);
    deploy(contractName);
  };

  return (
    <div className="flex items-center h-11 px-3 gap-1.5 border-b border-border/50 bg-zinc-900 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => openProject()}
      >
        <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
        {projectRoot || 'Open Project'}
      </Button>

      <div className="h-4 w-px bg-border/40" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        disabled={isCompiling || !projectRoot}
        loading={isCompiling}
        onClick={() => compile()}
      >
        <Hammer className="h-3.5 w-3.5" strokeWidth={1.5} />
        Compile
      </Button>

      <div className="relative" ref={deployMenuRef}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          disabled={!isConnected || artifacts.length === 0 || isDeploying}
          loading={isDeploying}
          onClick={() => {
            if (artifacts.length === 1) {
              deploy(artifacts[0].contractName);
            } else {
              setShowDeployMenu((v) => !v);
            }
          }}
        >
          <Rocket className="h-3.5 w-3.5" strokeWidth={1.5} />
          Deploy
          {artifacts.length > 1 && (
            <ChevronDown className="h-3 w-3 opacity-50" strokeWidth={1.5} />
          )}
        </Button>

        {showDeployMenu && artifacts.length > 1 && (
          <div className="absolute top-full left-0 mt-1 min-w-[180px] rounded-md border border-border/40 bg-zinc-900 shadow-lg z-50">
            <div className="p-1">
              {artifacts.map((a) => (
                <button
                  key={a.contractName}
                  className="flex items-center w-full px-2.5 py-1.5 rounded text-[11px] text-foreground/70 hover:bg-muted/40 hover:text-foreground transition-colors"
                  onClick={() => handleDeploy(a.contractName)}
                >
                  {a.contractName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Connection status pill */}
      <div className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-muted/30 border border-border/30">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isConnected
              ? 'bg-emerald-400'
              : 'bg-zinc-500'
          }`}
        />
        <span className="text-[11px] text-muted-foreground">
          {isConnected ? `${nodeType}` : 'Not connected'}
        </span>
      </div>

      <div className="h-4 w-px bg-border/40" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground/60 hover:text-foreground"
      >
        <Command className="h-3 w-3" strokeWidth={1.5} />
        <span className="text-[10px] tracking-wider opacity-60">K</span>
      </Button>
    </div>
  );
}
