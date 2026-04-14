const FLOW_MIN_HEIGHT = 180;
const FLOW_MAX_HEIGHT = 560;
const FLOW_ROW_PADDING = 70;
const ROW_HEIGHT = 110;

/**
 * Compute the FlowDiagram container height in pixels based on the
 * number of visible rows (legs). Clamps between 180px and 560px.
 */
export function computeFlowHeight(rowCount: number): number {
  const raw = rowCount * ROW_HEIGHT + FLOW_ROW_PADDING;
  return Math.max(FLOW_MIN_HEIGHT, Math.min(raw, FLOW_MAX_HEIGHT));
}
