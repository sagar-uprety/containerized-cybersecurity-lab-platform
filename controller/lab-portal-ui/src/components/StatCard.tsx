import Link from "./Link";

interface StatCardProps {
  value: string | number;
  label: string;
  color?: string;
  highlight?: boolean;
  href?: string;
  onClick?: () => void;
}

export default function StatCard({ value, label, color, highlight, href, onClick }: StatCardProps) {
  const valueColor = color || (highlight ? "var(--amber)" : "var(--tum-blue)");
  const content = (
    <>
      <div className="stat-card-value" style={{ color: valueColor }}>{value}</div>
      <div className="stat-card-label">{label}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="stat-card stat-card-interactive" onClick={onClick}>
        {content}
      </Link>
    );
  }

  return <div className="stat-card">{content}</div>;
}
