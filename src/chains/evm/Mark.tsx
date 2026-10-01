export function Mark({ size = 18 }: { size?: number }) {
  // Official "eth-diamond-rainbow" from ethereum.org/assets (colorful brand mark).
  // Native viewBox is 1705x2842; we wrap it in a square, centered viewBox so the
  // diamond fills the icon without letterboxing.
  return (
    <svg
      width={size}
      height={size}
      viewBox="-570 0 2842 2842"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M853.5 2146L1705 1612.5L853.5 2840V2146ZM1251 2043L979.326 2215V2437.5L1251 2043Z"
        fill="#5A9DED"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M853.5 2146L2 1612.5L853.5 2840V2146ZM455.998 2043L727.674 2215V2437.5L455.998 2043Z"
        fill="#53D3E0"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M852.324 2000.91L1705 1463.17L852.324 -1.85352V2000.91ZM1534.32 1422L979.324 1772V468.5L1534.32 1422Z"
        fill="#FF9C92"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M854 2000.91L1.3252 1463.17L854 -1.85352V2000.91ZM172 1422L727 1772V468.5L172 1422Z"
        fill="#FFE94D"
      />
      <path
        d="M727 1199.32L246.351 1468.89L172 1422L219.296 1340.74L727 1056V1199.32Z"
        fill="#9FDB6F"
        opacity="0.8"
      />
      <path
        d="M980 1199.32L1460.65 1468.89L1535 1422L1487.7 1340.74L980 1056V1199.32Z"
        fill="#D28ECB"
        opacity="0.8"
      />
    </svg>
  );
}
