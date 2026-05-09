import "./EdbBadge.css";

const EDB_REPO = "https://github.com/edb-rs/EDB";

function gearPath(teeth: number, outer: number, inner: number): string {
  const period = (Math.PI * 2) / teeth;
  const rootHalf = period * 0.26;
  const tipHalf = period * 0.18;
  const cmds: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const c = i * period - Math.PI / 2;
    const rL = c - rootHalf;
    const rR = c + rootHalf;
    const tL = c - tipHalf;
    const tR = c + tipHalf;
    const next = (i + 1) * period - Math.PI / 2;
    const nrL = next - rootHalf;
    const at = (a: number, r: number) =>
      [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
    const p1 = at(rL, inner);
    const p2 = at(tL, outer);
    const p3 = at(tR, outer);
    const p4 = at(rR, inner);
    const pN = at(nrL, inner);
    if (i === 0) cmds.push(`M ${p1[0]} ${p1[1]}`);
    cmds.push(`L ${p2[0]} ${p2[1]}`);
    cmds.push(`A ${outer} ${outer} 0 0 1 ${p3[0]} ${p3[1]}`);
    cmds.push(`L ${p4[0]} ${p4[1]}`);
    cmds.push(`A ${inner} ${inner} 0 0 1 ${pN[0]} ${pN[1]}`);
  }
  cmds.push("Z");
  return cmds.join(" ");
}

const BIG_D = gearPath(12, 14, 11);
const SMALL_D = gearPath(8, 9, 6);

interface EdbBadgeProps {
  className?: string;
  showLabel?: boolean;
}

export function EdbBadge({ className = "", showLabel = true }: EdbBadgeProps) {
  return (
    <a
      href={EDB_REPO}
      target="_blank"
      rel="noopener noreferrer"
      title="Powered by EDB → github.com/edb-rs/EDB"
      aria-label="Powered by EDB · opens github.com/edb-rs/EDB in a new tab"
      className={`edb-badge ${className}`}
    >
      <svg
        width="40"
        height="20"
        viewBox="-26 -13 52 26"
        aria-hidden="true"
        focusable="false"
      >
        <g transform="translate(-10 0)">
          <g className="edb-cog edb-cog-big">
            <path
              d={BIG_D}
              fill="#d4a574"
              stroke="#6b4f30"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
            <circle r="2.6" fill="#6b4f30" stroke="#e8dfd0" strokeWidth="0.4" />
            <circle r="0.5" fill="#e8dfd0" />
          </g>
        </g>
        <g transform="translate(10 0)">
          <g className="edb-cog edb-cog-small">
            <path
              d={SMALL_D}
              fill="#d4a574"
              stroke="#6b4f30"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
            <circle r="1.6" fill="#6b4f30" stroke="#e8dfd0" strokeWidth="0.4" />
            <circle r="0.5" fill="#e8dfd0" />
          </g>
        </g>
      </svg>
      {showLabel && (
        <span className="edb-badge-label">
          Powered by EDB <span aria-hidden="true">↗</span>
        </span>
      )}
    </a>
  );
}

export default EdbBadge;
