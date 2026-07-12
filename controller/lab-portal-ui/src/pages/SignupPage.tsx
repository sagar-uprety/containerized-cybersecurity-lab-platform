import { useState } from "react";
import type { User } from "../types";
import { register } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";

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
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 420 }}>
        <div className="login-logo">
          <div className="login-logo-title">Create Account</div>
          <div className="login-logo-sub">Cybersecurity Lab Platform</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">
              University Email
            </label>
            <input
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

          <div className="form-group">
            <label className="form-label" htmlFor="signup-semester">
              Semester
            </label>
            <select
              id="signup-semester"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              required
            >
              <option value="">Select semester...</option>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-program">
              Study Program
            </label>
            <select
              id="signup-program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              required
            >
              <option value="">Select program...</option>
              {PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {password.length > 0 && (
              <ul className="password-rules">
                {PASSWORD_RULES.map((rule) => (
                  <li
                    key={rule.label}
                    style={{
                      color: rule.test(password)
                        ? "var(--green, #22c55e)"
                        : "var(--muted, #6b7280)",
                    }}
                  >
                    {rule.test(password) ? "✓" : "○"} {rule.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-confirm">
              Confirm Password
            </label>
            <input
              id="signup-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm.length > 0 && password !== confirm && (
              <div className="field-error">
                Passwords do not match
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading || !allValid}
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <div className="login-footer">
          Already have an account?{" "}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onSwitchToLogin();
            }}
            className="link-tum"
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
