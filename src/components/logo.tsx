import { useId } from "react";

/** The NimStage mark: a hexagonal record (a nod to Nimiq) with equalizer bars as its label. Matches the app icon. */
export function Logo({ size = 32 }: { size?: number }) {
  const id = useId();
  const hex = [-90, -30, 30, 90, 150, 210].map((a) => `${(256 + 176 * Math.cos((a * Math.PI) / 180)).toFixed(1)},${(256 + 176 * Math.sin((a * Math.PI) / 180)).toFixed(1)}`).join(" ");
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="84 64 344 384" preserveAspectRatio="xMidYMid meet" className="shrink-0">
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fa5d29" />
          <stop offset=".55" stopColor="#c25bff" />
          <stop offset="1" stopColor="#49b3fc" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc06b" />
          <stop offset="1" stopColor="#fa5d29" />
        </linearGradient>
      </defs>
      <polygon points={hex} fill="#12121b" stroke={`url(#${id}r)`} strokeWidth="28" strokeLinejoin="round" />
      <circle cx="256" cy="256" r="84" fill={`url(#${id}l)`} />
      <g stroke="#130a05" strokeWidth="17" strokeLinecap="round">
        <line x1="222" y1="240" x2="222" y2="272" />
        <line x1="239" y1="220" x2="239" y2="292" />
        <line x1="256" y1="200" x2="256" y2="312" />
        <line x1="273" y1="224" x2="273" y2="288" />
        <line x1="290" y1="242" x2="290" y2="270" />
      </g>
    </svg>
  );
}
