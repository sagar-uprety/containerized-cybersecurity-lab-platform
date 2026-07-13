import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { User } from "../types";
import { login } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { CircleAlert } from "lucide-react";

export interface LoginPageProps {
  mode?: "student" | "instructor";
  onLogin: (user: User) => void;
  onSwitchToSignup?: () => void;
  onSwitchToInstructor?: () => void;
  onSwitchToLogin?: () => void;
}

export default function LoginPage({
  mode = "student",
  onLogin,
  onSwitchToSignup,
  onSwitchToInstructor,
  onSwitchToLogin,
}: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isInstructor = mode === "instructor";

  useDocumentTitle(isInstructor ? "Instructor Login" : "Sign In");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await login(username, password);
      onLogin(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5.5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {isInstructor ? "Instructor login" : "Thesis Lab Portal"}
          </h1>
          <div className="mt-0.5 text-sm text-muted-foreground">Cybersecurity Lab Platform</div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4 border-destructive/20 bg-destructive-bg">
            <CircleAlert />
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Email</Label>
            <Input
              id="username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Portal password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {isInstructor ? (
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); onSwitchToLogin?.(); }}
              className="text-primary hover:underline"
            >
              ← Back to student login
            </a>
          ) : (
            <>
              <div>
                Don't have an account?{" "}
                <a
                  href="/signup"
                  onClick={(e) => { e.preventDefault(); onSwitchToSignup?.(); }}
                  className="text-primary hover:underline"
                >
                  Sign up
                </a>
              </div>
              <div className="mt-2">
                <a
                  href="/instructor/login"
                  onClick={(e) => { e.preventDefault(); onSwitchToInstructor?.(); }}
                  className="text-primary hover:underline"
                >
                  Are you an instructor?
                </a>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
