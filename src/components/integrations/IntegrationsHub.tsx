import React, { Suspense } from "react";
import { useLocation, Navigate } from "react-router-dom";
import LoadingSpinner from "../shared/LoadingSpinner";

const LifiEarnPage = React.lazy(
  () => import("./lifi-earn/LifiEarnPage")
);
const SparkleShowcase = React.lazy(
  () => import("./lifi-earn/SparkleShowcase")
);

const IntegrationsHub: React.FC = () => {
  const { pathname } = useLocation();

  // PersistentTools keeps this component mounted (within a TTL) after the user
  // navigates to a different top-level tool. Bail before the redirect check
  // so we don't bounce the user back to /integrations/lifi-earn from /database
  // (or any other route) just because they once visited Integrations.
  if (!pathname.startsWith("/integrations")) return null;

  const segment = pathname.replace(/^\/integrations\/?/, "").split("/")[0] || "";

  // Default: redirect bare /integrations to /integrations/lifi-earn
  if (!segment) {
    return <Navigate to="/integrations/lifi-earn" replace />;
  }

  return (
    <Suspense fallback={<LoadingSpinner text="Loading integration" />}>
      {segment === "sparkle-test" && <SparkleShowcase />}
      {segment === "lifi-earn" && <LifiEarnPage />}
    </Suspense>
  );
};

export default IntegrationsHub;
