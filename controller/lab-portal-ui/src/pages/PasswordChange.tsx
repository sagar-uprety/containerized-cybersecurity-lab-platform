import { useState } from "react";
import { changePassword } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";

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
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-title">Set a new password</div>
          <div className="login-logo-sub">
            Choose a new password before continuing to your labs.
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="current">Current password</label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="next">New password</label>
            <input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Saving..." : "Update password"}
          </button>
        </form>

        <button
          className="btn btn-ghost-dark btn-sm btn-block"
          style={{ marginTop: "var(--sp-3)" }}
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
