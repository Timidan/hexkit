import React, { Suspense } from "react";
import { useLocation, Navigate } from "react-router-dom";
import LoadingSpinner from "../shared/LoadingSpinner";
import { stripFamilyPrefix, buildFamilyPath } from "../../routes/familyRoutes";
import { useActiveChainFamily } from "../../hooks/useActiveChainFamily";

// LI.FI Earn now goes through the feature route so the EVM adapter provider
// is mounted above the page. Shell content inside the page is unchanged.
const EarnFeatureRoute = React.lazy(
  () => import("../../features/earn/routes/EarnFeatureRoute")
);
const SparkleShowcase = React.lazy(
  () => import("./lifi-earn/SparkleShowcase")
);

const IntegrationsHub: React.FC = () => {
  const { pathname } = useLocation();
  const family = useActiveChainFamily();
  const strippedPath = stripFamilyPrefix(pathname);
  const segment = strippedPath.replace(/^\/integrations\/?/, "").split("/")[0] || "";

  // Default: redirect bare /evm/integrations to /evm/integrations/lifi-earn
  if (!segment) {
    return <Navigate to={buildFamilyPath(family, "/integrations/lifi-earn")} replace />;
  }

  return (
    <Suspense fallback={<LoadingSpinner text="Loading integration" />}>
      {segment === "sparkle-test" && <SparkleShowcase />}
      {segment === "lifi-earn" && <EarnFeatureRoute />}
    </Suspense>
  );
};

export default IntegrationsHub;
