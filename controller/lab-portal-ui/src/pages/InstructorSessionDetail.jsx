import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import CheckResult from "../components/CheckResult.jsx";
import { getInstructorSessionDetail } from "../api.js";

export default function InstructorSessionDetail({ user, labId, studentId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [labId, studentId]);

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <a href={`/instructor/labs/${labId}`} className="back-link">&larr; Back to lab detail</a>
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)" }}>
            {error}
          </div>
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

  const { status, duration_seconds, commands, latest_check, lifecycle_events } = data;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href={`/instructor/labs/${labId}`} className="back-link">&larr; Back to lab detail</a>
        <h1>
          {labId} — {studentId}
        </h1>

        <div className="status-row">
          <span className="status-label">Status</span>
          <span className={`badge badge-${status}`}>{status}</span>
        </div>

        {duration_seconds !== null && (
          <div className="status-row">
            <span className="status-label">Duration</span>
            <span>{Math.round(duration_seconds / 60)} minutes</span>
          </div>
        )}

        {latest_check && (
          <CheckResult result={latest_check} visible={true} />
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

        {lifecycle_events && lifecycle_events.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Lifecycle Events</span>
            </div>
            <div className="event-list">
              {lifecycle_events.map((event, i) => (
                <div key={i} className="event-row">
                  <span className="event-timestamp">{event.timestamp}</span>
                  <span className="event-action">{event.action}</span>
                  <span className={`event-result ${event.result === "success" ? "event-success" : "event-error"}`}>
                    {event.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
