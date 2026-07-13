import { cn } from "@/lib/utils";

interface LastActiveBadgeProps { ts?: string | null }

export default function LastActiveBadge({ ts }: LastActiveBadgeProps) {
  if (!ts) return <span className="text-sm text-muted-foreground">Never</span>;
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  const colorClass = diffDays > 7 ? "text-destructive" : diffDays > 3 ? "text-warning" : "text-success";
  const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
  return <span className={cn("text-sm font-medium", colorClass)}>{label}</span>;
}
