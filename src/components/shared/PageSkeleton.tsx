import React from "react";

/**
 * Full-page shimmer skeleton shown while lazy-loaded route chunks are fetched.
 * Mimics the app's typical two-column grid layout with cards.
 *
 * `fullWidth` is for tools that render a single wide workspace
 * (`/builder`, `/explorer`, `/integrations`) so the placeholder does not
 * promise a two-column layout the page will never use.
 */

export type PageSkeletonVariant = "default" | "fullWidth";

const shimmerKeyframes = `
@keyframes page-skeleton-shimmer {
  0% { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-page-skeleton] [data-skeleton-bar] {
    animation: none !important;
  }
}
`;

const shimmerBg =
  "linear-gradient(90deg, #1a1a1a 25%, #242424 38%, #1a1a1a 55%)";

const Bar: React.FC<{
  w?: string;
  h?: number;
  mt?: number;
  radius?: number;
}> = ({ w = "100%", h = 14, mt = 0, radius = 6 }) => (
  <div
    data-skeleton-bar=""
    style={{
      width: w,
      height: h,
      marginTop: mt,
      borderRadius: radius,
      background: shimmerBg,
      backgroundSize: "1200px 100%",
      animation: "page-skeleton-shimmer 1.8s infinite linear",
    }}
  />
);

const Card: React.FC<{ children: React.ReactNode; minH?: number }> = ({
  children,
  minH = 180,
}) => (
  <div
    style={{
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10,
      padding: 20,
      minHeight: minH,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    {children}
  </div>
);

const PageSkeleton: React.FC<{ variant?: PageSkeletonVariant }> = ({
  variant = "default",
}) => (
  <>
    <style>{shimmerKeyframes}</style>
    <div
      data-page-skeleton=""
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      style={{
        width: "100%",
        maxWidth: 1800,
        margin: "0 auto",
        padding: "32px 24px",
        opacity: 0.55,
      }}
    >
      {/* Page title */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Bar w="220px" h={28} />
        <Bar w="140px" h={14} mt={12} />
      </div>

      {variant === "fullWidth" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Wide workspace card */}
          <Card minH={280}>
            <Bar w="30%" h={16} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr",
                gap: 20,
                marginTop: 4,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Bar w="100%" h={42} radius={8} />
                <Bar w="80%" h={14} />
                <Bar w="60%" h={14} />
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <Bar w="120px" h={36} radius={8} />
                  <Bar w="120px" h={36} radius={8} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Bar w="100%" h={64} radius={8} />
                <Bar w="100%" h={64} radius={8} />
                <Bar w="70%" h={14} />
              </div>
            </div>
          </Card>

          {/* Secondary wide card */}
          <Card minH={200}>
            <Bar w="24%" h={16} />
            <Bar w="100%" h={38} radius={8} />
            <Bar w="100%" h={38} radius={8} />
            <Bar w="64%" h={14} />
          </Card>
        </div>
      ) : (
        /* Two-column grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 0.65fr",
            gap: 28,
          }}
        >
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Main card */}
            <Card minH={260}>
              <Bar w="45%" h={16} />
              <Bar w="100%" h={40} mt={4} radius={8} />
              <Bar w="70%" h={14} mt={8} />
              <Bar w="55%" h={14} mt={4} />
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <Bar w="100px" h={34} radius={8} />
                <Bar w="100px" h={34} radius={8} />
              </div>
            </Card>

            {/* Secondary card */}
            <Card minH={160}>
              <Bar w="35%" h={16} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <Bar w="100%" h={38} radius={8} />
                <Bar w="100%" h={38} radius={8} />
                <Bar w="80%" h={38} radius={8} />
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card minH={200}>
              <Bar w="60%" h={16} />
              <Bar w="100%" h={14} mt={4} />
              <Bar w="90%" h={14} mt={2} />
              <Bar w="75%" h={14} mt={2} />
              <Bar w="100%" h={34} mt={12} radius={8} />
            </Card>

            <Card minH={120}>
              <Bar w="50%" h={16} />
              <Bar w="100%" h={14} mt={4} />
              <Bar w="65%" h={14} mt={2} />
            </Card>
          </div>
        </div>
      )}
    </div>
  </>
);

export default PageSkeleton;
