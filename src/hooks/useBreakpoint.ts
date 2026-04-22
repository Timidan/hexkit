import { useState, useEffect, useMemo } from "react";

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface BreakpointResult {
  breakpoint: Breakpoint;
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // 768px–1023px
  isDesktop: boolean;  // >= 1024px
  width: number;
}

const BREAKPOINTS: { name: Breakpoint; minWidth: number }[] = [
  { name: "2xl", minWidth: 1536 },
  { name: "xl", minWidth: 1280 },
  { name: "lg", minWidth: 1024 },
  { name: "md", minWidth: 768 },
  { name: "sm", minWidth: 640 },
];

function getBreakpoint(width: number): Breakpoint {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) return bp.name;
  }
  return "xs";
}

export function useBreakpoint(): BreakpointResult {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleChange = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleChange);
    return () => {
      window.removeEventListener("resize", handleChange);
    };
  }, []);

  return useMemo(() => {
    const breakpoint = getBreakpoint(width);
    return {
      breakpoint,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      width,
    };
  }, [width]);
}
