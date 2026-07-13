interface ProgressRingProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function colorFor(pct: number): string {
  if (pct >= 80) return "var(--success)";
  if (pct > 0) return "var(--primary)";
  return "var(--border)";
}

export default function ProgressRing({ pct, size = 56, strokeWidth = 5, label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = colorFor(clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <div className="absolute text-xs font-semibold text-foreground">{label ?? `${Math.round(clamped)}%`}</div>
    </div>
  );
}
