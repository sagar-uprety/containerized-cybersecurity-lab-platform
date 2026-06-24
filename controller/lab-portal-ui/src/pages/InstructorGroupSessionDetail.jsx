import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import CheckResult from "../components/CheckResult.jsx";
import { getInstructorSessionDetail } from "../api.js";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function InstructorGroupSessionDetail({ user, groupId, studentId, labId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [labId, studentId]);

  const backPath = groupId
    ? `/instructor/groups/${groupId}/students/${studentId}`
    : `/instructor`;

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <a href={backPath} className="back-link" onClick={(e) => { e.preventDefault(); nav(backPath); }}>
            &larr; Back
          </a>
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)" }}>{error}</div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      </>
    );
  }

  const { status, duration_seconds, commands, latest_check, scenario } = data;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href={backPath} className="back-link" onClick={(e) => { e.preventDefault(); nav(backPath); }}>
          &larr; Back to student
        </a>

        <h1>{scenario?.title || labId}</h1>
        <div style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
          {studentId}
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <div className="panel" style={{ flex: "0 0 auto", marginBottom: 0, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="status-label">Status</span>
            <span className={`badge badge-${status === "running" ? "running" : status === "error" ? "error" : "stopped"}`}>
              {status?.replace("_", " ").toUpperCase()}
            </span>
          </div>
          {duration_seconds != null && (
            <div className="panel" style={{ flex: "0 0 auto", marginBottom: 0, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="status-label">Duration</span>
              <span>{Math.round(duration_seconds / 60)} min</span>
            </div>
          )}
        </div>

        {latest_check && (
          <CheckResult result={latest_check} visible={true} checkerChecks={scenario?.checker?.checks} />
        )}

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Commands</span>
          </div>
          {commands && commands.length > 0 ? (
            <div className="command-list">
              {commands.map((cmd, i) => (
                <div key={i} className="command-row">
                  <span className="command-timestamp">{cmd.timestamp}</span>
                  <code className="command-text">{cmd.command}</code>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No commands recorded.</p>
          )}
        </div>
      </div>
    </>
  );
}
