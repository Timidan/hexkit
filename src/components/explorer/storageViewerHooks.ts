import { useState, useRef, useLayoutEffect } from 'react';

/**
 * Observe a grid header row and compute per-column character limits
 * based on actual rendered column widths and monospace char width.
 * Re-attaches when `viewKey` changes (view mode switch).
 */
export function useGridCharLimits(
  headerRef: React.RefObject<HTMLDivElement | null>,
  viewKey: string,
): number[] {
  const [limits, setLimits] = useState<number[]>([]);
  const charWidthRef = useRef(0);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    // Measure monospace char width once using a hidden probe
    if (charWidthRef.current <= 0) {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
      probe.className = 'font-mono text-xs';
      probe.textContent = '0000000000'; // 10 chars for averaging
      document.body.appendChild(probe);
      charWidthRef.current = probe.getBoundingClientRect().width / 10;
      document.body.removeChild(probe);
    }

    const cw = charWidthRef.current;
    if (cw <= 0) return;

    const compute = () => {
      const spans = Array.from(header.children) as HTMLElement[];
      const next = spans.map((el) =>
        Math.max(6, Math.floor(el.getBoundingClientRect().width / cw)),
      );
      setLimits((prev) => {
        if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
        return next;
      });
    };

    const ro = new ResizeObserver(compute);
    ro.observe(header);
    compute(); // Synchronous initial measurement before paint

    return () => ro.disconnect();
  }, [viewKey]);

  return limits;
}
