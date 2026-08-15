import { forwardRef, type MouseEvent, type AnchorHTMLAttributes } from "react";
import { navigate } from "../utils/navigate";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  onClick?: () => void;
}

// forwardRef + prop passthrough so Radix `asChild` composition (SidebarMenuButton,
// Button, DropdownMenuTrigger...) can clone its data-*/aria-*/ref onto the real <a>
// instead of having them silently dropped - Radix needs the ref for popper/tooltip
// positioning, and peer-* CSS selectors need the data attributes to land on the DOM node.
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, download, ...rest },
  ref
) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (download) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onClick?.();
    navigate(href);
  }
  return (
    <a ref={ref} href={href} onClick={handleClick} download={download} {...rest} />
  );
});

export default Link;
