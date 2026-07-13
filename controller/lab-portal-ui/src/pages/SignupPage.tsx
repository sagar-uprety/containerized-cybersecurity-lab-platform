import { useState } from "react";
import { ShieldCheck, Check, Circle } from "lucide-react";
import type { User } from "../types";
import { register } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const SEMESTERS = ["SS 2026", "WS 2026/27"];
const PROGRAMS = ["Information Systems", "Informatics"];

interface PasswordRule {
  test: (p: string) => boolean;
  label: string;
}

const PASSWORD_RULES: PasswordRule[] = [
  { test: (p) => p.length >= 8, label: "At least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), label: "One uppercase letter" },
  { test: (p) => /[a-z]/.test(p), label: "One lowercase letter" },
  { test: (p) => /[0-9]/.test(p), label: "One digit" },
  { test: (p) => /[^A-Za-z0-9]/.test(p), label: "One special character" },
];

interface SignupPageProps {
  onSignup: (user: User) => void;
  onSwitchToLogin: () => void;
}

export default function SignupPage({ onSignup, onSwitchToLogin }: SignupPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [semester, setSemester] = useState("");
  const [program, setProgram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentTitle("Sign Up");

  const passwordErrors = PASSWORD_RULES.filter((r) => !r.test(password));
  const allValid =
    password.length > 0 &&
    passwordErrors.length === 0 &&
    password === confirm &&
    !!semester &&
    !!program;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passwordErrors.length > 0) {
      setError(passwordErrors.map((r) => r.label).join("; "));
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!semester) {
      setError("Please select a semester");
      return;
    }
    if (!program) {
      setError("Please select a study program");
      return;
    }

    setLoading(true);
    try {
      const data = await register(email, password, semester, program);
      onSignup(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 py-10">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5.5" />
          </div>
          <div className="text-lg font-semibold tracking-tight text-foreground">Create account</div>
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
            <Label htmlFor="signup-email">University email</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="student@tum.de"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="signup-semester">Semester</Label>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger id="signup-semester" className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-program">Study program</Label>
              <Select value={program} onValueChange={setProgram}>
                <SelectTrigger id="signup-program" className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {PROGRAMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li key={rule.label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : "text-muted-foreground")}>
                      {ok ? <Check className="size-3" /> : <Circle className="size-3" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-confirm">Confirm password</Label>
            <Input
              id="signup-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm.length > 0 && password !== confirm && (
              <div className="text-xs text-destructive">Passwords do not match</div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || !allValid}>
            {loading ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); onSwitchToLogin(); }}
            className="text-primary hover:underline"
          >
            Sign in
          </a>
        </div>
      </Card>
    </div>
  );
}
