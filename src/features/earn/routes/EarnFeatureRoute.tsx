import React, { Suspense } from "react";
import LoadingSpinner from "../../../components/shared/LoadingSpinner";
import { useActiveChainFamily } from "../../../hooks/useActiveChainFamily";
import { EarnAdapterProvider } from "../context/EarnAdapterContext";
import { EvmEarnAdapterProvider } from "../adapters/evm/EvmEarnAdapterProvider";
import { SvmEarnAdapterProvider } from "../adapters/svm/SvmEarnAdapterProvider";
import { UnsupportedFamilyCard } from "../shell/UnsupportedFamilyCard";

const LifiEarnPage = React.lazy(
  () => import("../../../components/integrations/lifi-earn/LifiEarnPage"),
);

export const EarnFeatureRoute: React.FC = () => {
  const family = useActiveChainFamily();

  if (family === "evm") {
    return (
      <EvmEarnAdapterProvider>
        <Suspense fallback={<LoadingSpinner text="Loading integration" />}>
          <LifiEarnPage />
        </Suspense>
      </EvmEarnAdapterProvider>
    );
  }

  if (family === "svm") {
    return (
      <SvmEarnAdapterProvider>
        <UnsupportedFamilyCard />
      </SvmEarnAdapterProvider>
    );
  }

  return (
    <EarnAdapterProvider family={family} adapter={null}>
      <UnsupportedFamilyCard />
    </EarnAdapterProvider>
  );
};

export default EarnFeatureRoute;
