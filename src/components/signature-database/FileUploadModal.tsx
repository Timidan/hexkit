import React from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import type { ParsedContracts } from "./types";

interface FileUploadModalProps {
  showFileModal: boolean;
  setShowFileModal: (v: boolean) => void;
  selectedFiles: File[];
  parsedContracts: ParsedContracts;
  selectedContracts: string[];
  isExtracting: boolean;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleContractSelection: (contractName: string, isSelected: boolean) => void;
  selectAllContracts: () => void;
  deselectAllContracts: () => void;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  showFileModal,
  setShowFileModal,
  selectedFiles,
  parsedContracts,
  selectedContracts,
  isExtracting,
  handleFileSelect,
  handleContractSelection,
  selectAllContracts,
  deselectAllContracts,
}) => {
  return (
    <Dialog open={showFileModal} onOpenChange={setShowFileModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple size={16} />
            Import Contract Artifacts
          </DialogTitle>
          <DialogDescription>
            Select your Hardhat{" "}
            <code className="text-xs bg-muted/30 px-1 py-0.5 rounded">
              artifacts/
            </code>{" "}
            or Foundry{" "}
            <code className="text-xs bg-muted/30 px-1 py-0.5 rounded">
              out/
            </code>{" "}
            directory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="contract-files"
            className="flex flex-col items-center justify-center w-full py-8 border-2 border-dashed border-border/50 rounded-lg cursor-pointer bg-muted/5 hover:bg-primary/5 hover:border-primary/30 transition-all"
          >
            <UploadSimple className="w-8 h-8 mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click to browse or drag files here
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              JSON and ABI files supported
            </p>
            <input
              type="file"
              id="contract-files"
              multiple
              accept=".json,.abi"
              onChange={handleFileSelect}
              className="hidden"
              {...({ webkitdirectory: "" } as any)}
            />
          </label>

          {Object.keys(parsedContracts).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Found {Object.keys(parsedContracts).length} contracts
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllContracts}
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllContracts}
                  >
                    None
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {Object.entries(parsedContracts).map(
                    ([contractName, contractData]) => (
                      <div
                        key={contractName}
                        className="flex items-center gap-2.5 py-2 px-2.5 rounded-md bg-muted/10 hover:bg-muted/20 border border-transparent hover:border-border/30 transition-colors"
                      >
                        <Checkbox
                          checked={selectedContracts.includes(contractName)}
                          onCheckedChange={(checked) =>
                            handleContractSelection(
                              contractName,
                              checked as boolean,
                            )
                          }
                        />
                        <span className="font-medium text-sm truncate flex-1">
                          {contractName}
                        </span>
                        <Badge variant="info" size="sm">
                          {contractData.functions.length} fn
                        </Badge>
                        <Badge variant="secondary" size="sm">
                          {contractData.events.length} ev
                        </Badge>
                      </div>
                    ),
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {selectedFiles.length > 0 &&
            Object.keys(parsedContracts).length === 0 &&
            isExtracting && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Processing {selectedFiles.length} files...
              </p>
            )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFileModal(false)}
          >
            Cancel
          </Button>
          {Object.keys(parsedContracts).length > 0 && (
            <Button size="sm" onClick={() => setShowFileModal(false)}>
              Import {selectedContracts.length} Contracts
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FileUploadModal;
