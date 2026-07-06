import "./BtlBadge.css";

const BTL_URL = "https://runtime.badtheorylabs.com";

interface BtlBadgeProps {
  className?: string;
  showLabel?: boolean;
}

/**
 * "Powered by BTL" strip — shown wherever the app calls the BTL Runtime,
 * mirroring EdbBadge. Uses the official BTL Runtime mark (public/logos).
 */
export function BtlBadge({ className = "", showLabel = true }: BtlBadgeProps) {
  return (
    <a
      href={BTL_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Powered by BTL Runtime → runtime.badtheorylabs.com"
      aria-label="Powered by BTL Runtime · opens runtime.badtheorylabs.com in a new tab"
      className={`btl-badge ${className}`}
    >
      <img
        src="/logos/btl-runtime.svg"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="btl-badge-logo"
      />
      {showLabel && (
        <span className="btl-badge-label">
          Powered by BTL <span aria-hidden="true">↗</span>
        </span>
      )}
    </a>
  );
}

export default BtlBadge;
