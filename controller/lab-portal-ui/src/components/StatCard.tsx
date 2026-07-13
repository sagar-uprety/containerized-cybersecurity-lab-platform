import type { ComponentType } from "react";
import Link from "./Link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger";

interface StatCardProps {
  value: string | number;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
}

const TONE_CARD: Record<Tone, string> = {
  default: "",
  success: "bg-success-bg ring-success/20",
  warning: "bg-warning-bg ring-warning/20",
  danger: "bg-destructive-bg ring-destructive/20",
};

const TONE_TEXT: Record<Tone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export default function StatCard({ value, label, description, icon: Icon, tone = "default", href, onClick }: StatCardProps) {
  const content = (
    <CardContent>
      <div className={cn("flex items-center gap-1.5 text-sm", TONE_TEXT[tone])}>
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tracking-tight", TONE_VALUE[tone])}>{value}</div>
      {description && <div className={cn("mt-1 text-xs", tone === "default" ? "text-muted-foreground" : `${TONE_TEXT[tone]}/80`)}>{description}</div>}
    </CardContent>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "block rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-primary/30",
          TONE_CARD[tone]
        )}
      >
        {content}
      </Link>
    );
  }

  return <Card className={TONE_CARD[tone]}>{content}</Card>;
}
