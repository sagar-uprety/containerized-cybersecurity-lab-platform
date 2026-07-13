import type { ComponentType } from "react";
import Link from "./Link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "danger";

interface StatCardProps {
  value: string | number;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
}

const TONE_TEXT: Record<Tone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  danger: "text-destructive",
};

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
};

export default function StatCard({ value, label, description, icon: Icon, tone = "default", href, onClick }: StatCardProps) {
  const content = (
    <>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-1.5 text-sm font-normal", TONE_TEXT[tone])}>
          {Icon && <Icon className="size-3.5" />}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-semibold tracking-tight", TONE_VALUE[tone])}>{value}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      </CardContent>
    </>
  );

  if (href) {
    return (
      <Card asChild className="transition-colors hover:ring-primary/30">
        <Link href={href} onClick={onClick}>{content}</Link>
      </Card>
    );
  }

  return <Card>{content}</Card>;
}
