interface StatusBadgeProps {
  status?: string | null;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status || status === "not_created") return null;
  const cls = `badge badge-${status}`;
  return <span className={cls}>{status}</span>;
}
