import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
}

export default function CopyButton({ value, label = "Copy to clipboard" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const succeeded = document.execCommand("copy");
      textarea.remove();
      if (!succeeded) throw new Error("Copy failed");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      onClick={handleCopy}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
