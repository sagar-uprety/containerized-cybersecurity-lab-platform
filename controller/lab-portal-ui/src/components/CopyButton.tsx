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
    await navigator.clipboard.writeText(value);
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
