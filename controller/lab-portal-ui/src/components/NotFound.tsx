import Link from "./Link";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "../utils/useDocumentTitle";

export default function NotFound() {
  useDocumentTitle("Page Not Found");
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">404 — Page not found</h1>
      <p className="mb-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
