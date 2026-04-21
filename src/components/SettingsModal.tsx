import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { GlobeHemisphereWest, Robot } from "@phosphor-icons/react";
import RpcSettingsPanel from "./settings/RpcSettingsPanel";
import LlmSettingsPanel from "./settings/LlmSettingsPanel";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "network" | "llm";
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "network",
}) => {
  const [tab, setTab] = useState<"network" | "llm">(initialTab);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure network providers and the LLM that powers analysis.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "network" | "llm")}>
          <TabsList className="w-full">
            <TabsTrigger value="network" className="flex-1">
              <GlobeHemisphereWest className="h-4 w-4" />
              Network
            </TabsTrigger>
            <TabsTrigger value="llm" className="flex-1">
              <Robot className="h-4 w-4" />
              LLM
            </TabsTrigger>
          </TabsList>

          <TabsContent value="network">
            <RpcSettingsPanel onClose={onClose} />
          </TabsContent>
          <TabsContent value="llm">
            <LlmSettingsPanel onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
