import type { ComponentType } from "react";

interface IconButtonProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  size?: number;
}

// Icon-only action button with a required accessible label (title + aria-label).
// Use in place of text buttons like "Remove"/"View" in dense card/row contexts.
export default function IconButton({ icon: Icon, label, onClick, href, danger, disabled, size = 15 }: IconButtonProps) {
  const className = `icon-btn${danger ? " icon-btn-danger" : ""}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} title={label} aria-label={label}>
        <Icon size={size} />
      </a>
    );
  }
  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon size={size} />
    </button>
  );
}
