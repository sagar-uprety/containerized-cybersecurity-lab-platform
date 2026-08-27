import { forwardRef, type MouseEvent, type AnchorHTMLAttributes } from "react";
import { navigate } from "../utils/navigate";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  onClick?: () => void;
}

// Preserve props and refs required by Radix asChild composition.
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
