import { Loader2 } from "lucide-react";

export default function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}
