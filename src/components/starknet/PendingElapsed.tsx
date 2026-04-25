// Shared "Verb… Ns elapsed" pill used on long-running bridge calls
// (trace replay, full simulate, estimate-fee). The bridge can take
// 30s+ on busy blocks; without an elapsed counter the user can't tell
// whether to wait or assume the request hung.

import React, { useEffect, useState } from "react";

interface Props {
  /** "Tracing", "Simulating", "Estimating" — verb-form prefix. */
  label: string;
  testId?: string;
}

export const PendingElapsed: React.FC<Props> = ({ label, testId }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const handle = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => window.clearInterval(handle);
  }, []);
  return (
    <span
      className="text-[10px] text-muted-foreground font-mono"
      data-testid={testId}
    >
      {label}… {elapsed}s elapsed
    </span>
  );
};

export default PendingElapsed;
