import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  running: "bg-success-bg text-success",
  passed: "bg-success-bg text-success",
  stopped: "bg-warning-bg text-warning",
  pending: "bg-warning-bg text-warning",
  error: "bg-destructive-bg text-destructive",
  failed: "bg-destructive-bg text-destructive",
};

const DOT_STYLES: Record<string, string> = {
  running: "bg-success",
  passed: "bg-success",
  stopped: "bg-warning",
  pending: "bg-warning",
  error: "bg-destructive",
  failed: "bg-destructive",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status || status === "not_created") return null;
  const key = status.toLowerCase();
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", STATUS_STYLES[key] ?? "bg-muted text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", DOT_STYLES[key] ?? "bg-muted-foreground")} />
      {status}
    </Badge>
  );
}
