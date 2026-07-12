import type { MouseEvent, ReactNode } from "react";
import { navigate } from "../utils/navigate";

interface LinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  onClick?: () => void;
  download?: boolean;
}

export default function Link({ href, className, style, children, onClick, download }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (download) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onClick?.();
    navigate(href);
  }
  return (
    <a href={href} className={className} style={style} onClick={handleClick} download={download}>
      {children}
    </a>
  );
}
