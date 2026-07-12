import { useState } from "react";
import type { User } from "../types";
import { login } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";

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
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-title">
            {isInstructor ? "Instructor Login" : "Thesis Lab Portal"}
          </div>
          <div className="login-logo-sub">Cybersecurity Lab Platform</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Email</label>
            <input
              id="username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="login-footer">
          {isInstructor ? (
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToLogin?.();
              }}
              className="link-tum"
            >
              &larr; Back to student login
            </a>
          ) : (
            <>
              <div>
                Don't have an account?{" "}
                <a
                  href="/signup"
                  onClick={(e) => {
                    e.preventDefault();
                    onSwitchToSignup?.();
                  }}
                  className="link-tum"
                >
                  Sign up
                </a>
              </div>
              <div className="mb-0" style={{ marginTop: "var(--sp-2)" }}>
                <a
                  href="/instructor/login"
                  onClick={(e) => {
                    e.preventDefault();
                    onSwitchToInstructor?.();
                  }}
                  className="link-tum"
                >
                  Are you an instructor?
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
