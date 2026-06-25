import { useState } from "react";

export default function LoginPage({ mode = "student", onLogin, onSwitchToSignup, onSwitchToInstructor, onSwitchToLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isInstructor = mode === "instructor";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Login failed");
      }

      const data = await res.json();
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
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

        <div style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.85rem" }}>
          {isInstructor ? (
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToLogin();
              }}
              style={{ color: "var(--tum-blue, #3070b3)" }}
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
                    onSwitchToSignup();
                  }}
                  style={{ color: "var(--tum-blue, #3070b3)" }}
                >
                  Sign up
                </a>
              </div>
              <div style={{ marginTop: "0.5rem" }}>
                <a
                  href="/instructor/login"
                  onClick={(e) => {
                    e.preventDefault();
                    onSwitchToInstructor();
                  }}
                  style={{ color: "var(--tum-blue, #3070b3)" }}
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
