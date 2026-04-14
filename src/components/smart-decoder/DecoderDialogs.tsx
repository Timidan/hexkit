import React from 'react';
import {
  CheckCircle,
  Sparkle,
  UploadSimple,
  MagnifyingGlass,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Field } from '../ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '../ui/input-group';
import { type ExtendedChain, EXTENDED_NETWORKS } from '../shared/NetworkSelector';
import ContractAddressInput from '../contract/ContractAddressInput';
import type { Chain } from '../../types';
import { getChainById } from '../../utils/chains';
import { ETHERSCAN_INSTANCES, BLOCKSCOUT_INSTANCES, type ContractConfirmationState } from './types';
import '../../styles/SignatureDatabase.css';

/* Map ExtendedChain ↔ Chain for ContractAddressInput compatibility */
const extendedToChain = (ext: ExtendedChain): Chain => {
  const registry = getChainById(ext.id);
  if (registry) return registry;
  return {
    id: ext.id,
    name: ext.name,
    rpcUrl: ext.rpcUrl ?? '',
    explorerUrl: ext.blockExplorer,
    blockExplorer: ext.blockExplorer,
    nativeCurrency: (ext as any).nativeCurrency ?? { name: 'ETH', symbol: 'ETH', decimals: 18 },
  };
};

const chainToExtended = (chain: Chain): ExtendedChain | null =>
  EXTENDED_NETWORKS.find((n) => n.id === chain.id) ?? null;

// Restrict the lookup-network dropdown to chains that actually have an
// Etherscan or Blockscout entry — otherwise selecting them in single-chain
// mode immediately fails with "no explorer integration yet".
const CHAINS_WITH_EXPLORER = new Set<number>([
  ...ETHERSCAN_INSTANCES.map((i) => Number(i.chainId)),
  ...BLOCKSCOUT_INSTANCES.map((i) => Number(i.chainId)),
]);

const SUPPORTED_AS_CHAINS: Chain[] = EXTENDED_NETWORKS
  .filter((ext) => CHAINS_WITH_EXPLORER.has(ext.id))
  .map(extendedToChain);

/* ------------------------------------------------------------------ */
/*  Enrich Modal                                                       */
/* ------------------------------------------------------------------ */

interface EnrichModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualABI: string;
  setManualABI: (v: string) => void;
  contractAddress: string;
  setContractAddress: (v: string) => void;
  selectedLookupNetwork: ExtendedChain | null;
  setSelectedLookupNetwork: (v: ExtendedChain | null) => void;
  isFetchingABI: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onApplyManualABI: () => void;
  onFetchABI: () => void;
}

export const EnrichModal: React.FC<EnrichModalProps> = ({
  open,
  onOpenChange,
  manualABI,
  setManualABI,
  contractAddress,
  setContractAddress,
  selectedLookupNetwork,
  setSelectedLookupNetwork,
  isFetchingABI,
  fileInputRef,
  onApplyManualABI,
  onFetchABI,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" />
            Enrich Decode
          </DialogTitle>
          <DialogDescription>
            Provide an ABI to get accurate parameter names
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="paste" className="w-full">
          <TabsList className="tool-pill-tabs h-auto w-auto bg-transparent p-0 mx-auto">
            <TabsTrigger value="paste" className="tool-pill-tab">Paste ABI</TabsTrigger>
            <TabsTrigger value="fetch" className="tool-pill-tab">Fetch by Address</TabsTrigger>
          </TabsList>
          <TabsContent value="paste" className="w-full mt-4">
            <InputGroup className="sigdb-input-group h-auto flex-col">
              <InputGroupTextarea
                value={manualABI}
                onChange={(e) => setManualABI(e.target.value)}
                placeholder='[{"type":"function","name":"transfer","inputs":[...]}]'
                rows={4}
                className="font-mono text-xs break-all"
              />
              <InputGroupAddon align="block-end" className="flex justify-end gap-2 border-t border-border/30 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadSimple className="h-3.5 w-3.5 mr-1.5" />
                  Upload File
                </Button>
                <Button
                  size="sm"
                  onClick={onApplyManualABI}
                  disabled={!manualABI.trim()}
                >
                  Apply
                </Button>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground mt-2">Paste a JSON ABI array, or upload from file</p>
          </TabsContent>
          <TabsContent value="fetch" className="w-full mt-4">
            <ContractAddressInput
              contractAddress={contractAddress}
              onAddressChange={setContractAddress}
              selectedNetwork={selectedLookupNetwork ? extendedToChain(selectedLookupNetwork) : null}
              onNetworkChange={(chain) => {
                const ext = chainToExtended(chain);
                if (ext) setSelectedLookupNetwork(ext);
              }}
              supportedChains={SUPPORTED_AS_CHAINS}
              isLoading={isFetchingABI}
              onFetchABI={onFetchABI}
              fetchLabel="Fetch ABI"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  Contract Confirmation Dialog                                       */
/* ------------------------------------------------------------------ */

interface ContractConfirmationDialogProps {
  state: ContractConfirmationState;
  onOpenChange: (open: boolean) => void;
}

export const ContractConfirmationDialog: React.FC<ContractConfirmationDialogProps> = ({
  state,
  onOpenChange,
}) => {
  return (
    <Dialog open={state?.show ?? false} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-400 flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4" />
            Contract Found
          </DialogTitle>
        </DialogHeader>

        {state && (
          <div className="space-y-3">
            <div className="border border-border/50 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{state.contractInfo.name || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="secondary" size="sm">{state.contractInfo.source}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Address</span>
                <code className="font-mono text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                  {state.contractInfo.address.slice(0, 10)}...{state.contractInfo.address.slice(-8)}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Entries</span>
                <span>{state.contractInfo.functions}f / {state.contractInfo.events}e</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Use this contract or continue searching other explorers.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={state?.onContinueSearch}
          >
            Keep Searching
          </Button>
          <Button
            size="sm"
            onClick={state?.onConfirm}
          >
            Use This
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  Search Progress Display                                            */
/* ------------------------------------------------------------------ */

interface SearchProgressProps {
  steps: string[];
}

export const SearchProgress: React.FC<SearchProgressProps> = ({ steps }) => {
  if (steps.length === 0) return null;

  return (
    <div className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-3 mt-3">
      <div className="flex items-center gap-2 text-xs font-medium text-blue-400 mb-2">
        <MagnifyingGlass className="h-3 w-3 animate-pulse" />
        Searching explorers...
      </div>
      <div className="space-y-0.5">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`text-xs font-mono ${
              step.startsWith('✓') ? 'text-emerald-400' :
              step.startsWith('✗') ? 'text-red-400' :
              'text-muted-foreground'
            }`}
          >
            {step}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Error Display                                                      */
/* ------------------------------------------------------------------ */

interface ErrorDisplayProps {
  error: string | null;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  if (!error) return null;

  return (
    <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-3 mt-3">
      <div className="flex items-start gap-2">
        <WarningCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
        <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
      </div>
    </div>
  );
};
