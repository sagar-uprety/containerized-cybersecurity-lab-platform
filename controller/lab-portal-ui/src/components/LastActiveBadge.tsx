interface LastActiveBadgeProps { ts?: string | null }

export default function LastActiveBadge({ ts }: LastActiveBadgeProps) {
  if (!ts) return <span className="text-sm-muted">Never</span>;
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  const color = diffDays > 7 ? "var(--red)" : diffDays > 3 ? "var(--amber)" : "var(--green)";
  const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
  return <span style={{ fontSize: "0.82rem", color, fontWeight: 500 }}>{label}</span>;
}
