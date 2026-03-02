import React from 'react';
import {
  Settings2,
  Globe,
  Sparkles,
  Search,
  Building2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Switch } from '../ui/switch';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import type { LookupMode } from './types';

interface DecoderSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookupMode: LookupMode;
  setLookupMode: (v: LookupMode) => void;
  enableHeuristics: boolean;
  setEnableHeuristics: (v: boolean) => void;
  enableSignatureLookup: boolean;
  setEnableSignatureLookup: (v: boolean) => void;
  showAlternativeResults: boolean;
  setShowAlternativeResults: (v: boolean) => void;
}

const DecoderSettingsDialog: React.FC<DecoderSettingsDialogProps> = ({
  open,
  onOpenChange,
  lookupMode,
  setLookupMode,
  enableHeuristics,
  setEnableHeuristics,
  enableSignatureLookup,
  setEnableSignatureLookup,
  showAlternativeResults,
  setShowAlternativeResults,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Advanced Settings
          </DialogTitle>
          <DialogDescription>
            Configure decoding behaviour and lookup preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Explorer Mode Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Explorer Mode
            </div>
            <RadioGroup
              value={lookupMode}
              onValueChange={(value) => setLookupMode(value as LookupMode)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="mode-multi"
                className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                  lookupMode === 'multi'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="multi" id="mode-multi" />
                  <span className="font-medium text-sm">Auto</span>
                </div>
                <span className="text-xs text-muted-foreground pl-6">
                  Search all explorers
                </span>
              </Label>
              <Label
                htmlFor="mode-single"
                className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                  lookupMode === 'single'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="single" id="mode-single" />
                  <span className="font-medium text-sm">Single</span>
                </div>
                <span className="text-xs text-muted-foreground pl-6">
                  Target one network
                </span>
              </Label>
            </RadioGroup>
          </div>

          <Separator />

          {/* Toggle Settings */}
          <div className="space-y-4">
            {/* Heuristic Decoding */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="heuristics" className="text-sm font-medium cursor-pointer">
                    Heuristic decoding
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pattern-based decoding when ABI is missing
                  </p>
                </div>
              </div>
              <Switch
                id="heuristics"
                checked={enableHeuristics}
                onCheckedChange={setEnableHeuristics}
              />
            </div>

            {/* Signature Databases */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Search className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="signatures" className="text-sm font-medium cursor-pointer">
                    Signature databases
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Query public registries when ABI unavailable
                  </p>
                </div>
              </div>
              <Switch
                id="signatures"
                checked={enableSignatureLookup}
                onCheckedChange={setEnableSignatureLookup}
              />
            </div>

            {/* Alternative Attempts */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="alternatives" className="text-sm font-medium cursor-pointer">
                    Alternative attempts
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show lower-confidence matches for inspection
                  </p>
                </div>
              </div>
              <Switch
                id="alternatives"
                checked={showAlternativeResults}
                onCheckedChange={setShowAlternativeResults}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DecoderSettingsDialog;
