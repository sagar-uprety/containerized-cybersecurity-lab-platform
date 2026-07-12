interface ProgressBarProps { pct: number }

export default function ProgressBar({ pct }: ProgressBarProps) {
  const color = pct >= 80 ? "var(--green)" : pct >= 40 ? "var(--amber)" : pct > 0 ? "var(--red)" : "var(--border)";
  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track" style={pct === 0 ? { border: "1px solid var(--border)" } : undefined}>
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="progress-bar-label">{pct}%</span>
    </div>
  );
}
