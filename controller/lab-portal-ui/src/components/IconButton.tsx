import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconButtonProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  size?: number;
}

const dangerClass = "hover:bg-destructive-bg hover:text-destructive";

// Icon-only action button with a required accessible label (title + aria-label).
// Use in place of text buttons like "Remove"/"View" in dense card/row contexts.
export default function IconButton({ icon: Icon, label, onClick, href, danger, disabled, size = 15 }: IconButtonProps) {
  if (href) {
    return (
      <Button asChild variant="ghost" size="icon" className={cn(danger && dangerClass)}>
        <a href={href} target="_blank" rel="noreferrer" title={label} aria-label={label}>
          <Icon size={size} />
        </a>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(danger && dangerClass)}
    >
      <Icon size={size} />
    </Button>
  );
}
