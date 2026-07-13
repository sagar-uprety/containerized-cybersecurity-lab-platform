import { useState } from "react";
import { KeyRound, CircleAlert } from "lucide-react";
import { changePassword } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

interface PasswordChangeProps {
  onChanged: () => void;
  onLogout: () => void;
}

// lab access when the authenticated user has must_change_password set.
export default function PasswordChange({ onChanged, onLogout }: PasswordChangeProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentTitle("Set New Password");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="size-5.5" />
          </div>
          <div className="text-lg font-semibold tracking-tight text-foreground">Set a new password</div>
          <div className="mt-0.5 text-sm text-muted-foreground">Choose a new password before continuing to your labs.</div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4 border-destructive/20 bg-destructive-bg">
            <CircleAlert />
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Update password"}
          </Button>
        </form>

        <Button variant="ghost" className="mt-3 w-full text-muted-foreground" onClick={onLogout}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
