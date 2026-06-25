import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import CheckResult from "../components/CheckResult.jsx";
import { getInstructorSessionDetail } from "../api.js";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function fmtTimestamp(ts) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InstructorGroupSessionDetail({ user, groupId, studentId, labId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const sessionNum = params.get("session");

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [labId, studentId]);

  const backPath = groupId
    ? `/instructor/groups/${groupId}/students/${studentId}`
    : `/instructor`;
  const backLabel = groupId ? `Back to ${studentId}` : "Back to Dashboard";

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <a href={backPath} className="back-link" onClick={(e) => { e.preventDefault(); nav(backPath); }}>
            &larr; {backLabel}
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

  const { status, duration_seconds, commands, latest_check, scenario, lifecycle_events } = data;

  let sessionCommands = commands || [];
  let sessionCheck = latest_check;
  let sessionStatus = status;
  let sessionDuration = duration_seconds;

  if (sessionNum && lifecycle_events) {
    const endActions = new Set(["end", "stop", "destroy", "auto_stop"]);
    const sessions = [];
    let current = null;
    for (const ev of lifecycle_events) {
      if (ev.action === "start") {
        if (current?.ended_at) sessions.push(current);
        current = { started_at: ev.timestamp, ended_at: null, outcome: "running" };
      } else if (endActions.has(ev.action)) {
        if (current && !current.ended_at) {
          current.ended_at = ev.timestamp;
          current.outcome = ev.action;
          sessions.push(current);
          current = null;
        }
      }
    }
    if (current) sessions.push(current);
    sessions.reverse();

    const idx = parseInt(sessionNum, 10) - 1;
    const targetSession = sessions[idx];
    if (targetSession) {
      const sStart = new Date(targetSession.started_at);
      const sEnd = targetSession.ended_at ? new Date(targetSession.ended_at) : new Date();

      sessionCommands = (commands || []).filter((cmd) => {
        const t = new Date(cmd.timestamp);
        return t >= sStart && t <= sEnd;
      });

      const checkResults = data.check_results || [];
      const sessionChecks = checkResults.filter((cr) => {
        const t = new Date(cr.timestamp || cr.checked_at || "");
        return t >= sStart && t <= sEnd;
      });
      sessionCheck = sessionChecks.length > 0
        ? sessionChecks[sessionChecks.length - 1].check_result || sessionChecks[sessionChecks.length - 1]
        : null;

      sessionStatus = targetSession.outcome === "running" ? "running" : targetSession.outcome;
      if (targetSession.ended_at) {
        sessionDuration = (sEnd.getTime() - sStart.getTime()) / 1000;
      }
    }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href={backPath} className="back-link" onClick={(e) => { e.preventDefault(); nav(backPath); }}>
          &larr; {backLabel}
        </a>

        <h1>{scenario?.title || labId}</h1>
        <div style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
          {studentId}
          {sessionNum && <span style={{ marginLeft: "0.5rem" }}>&middot; Session #{sessionNum}</span>}
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <div className="panel" style={{ flex: "0 0 auto", marginBottom: 0, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="status-label">Status</span>
            <span className={`badge badge-${sessionStatus === "running" ? "running" : sessionStatus === "error" ? "error" : "stopped"}`}>
              {(sessionStatus || "").replace("_", " ").toUpperCase()}
            </span>
          </div>
          {sessionDuration != null && (
            <div className="panel" style={{ flex: "0 0 auto", marginBottom: 0, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="status-label">Duration</span>
              <span>{Math.round(sessionDuration / 60)} min</span>
            </div>
          )}
        </div>

        {sessionCheck && (
          <CheckResult result={sessionCheck} visible={true} checkerChecks={scenario?.checker?.checks} />
        )}

        <div className="panel">
          <div className="panel-header">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Commands</h2>
            {sessionCommands.length > 0 && (
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                {sessionCommands.length} recorded
              </span>
            )}
          </div>
          {sessionCommands.length > 0 ? (
            <div className="command-list">
              {sessionCommands.map((cmd, i) => (
                <div key={i} className="command-row">
                  <span className="command-timestamp">{fmtTimestamp(cmd.timestamp)}</span>
                  <code className="command-text">{cmd.command}</code>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No commands recorded{sessionNum ? " for this session" : ""}.</p>
          )}
        </div>
      </div>
    </>
  );
}
