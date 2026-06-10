import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { getInstructorLabDetail } from "../api.js";

function SessionList({ title, sessions, emptyMessage, onClickStudent }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="panel">
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--ink-secondary)" }}>{title}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--ink-secondary)" }}>
        {title} <span className="badge">{sessions.length}</span>
      </h3>
      <div className="session-list">
        {sessions.map((session) => (
          <div
            key={session.student_id}
            className="session-row"
            onClick={() => onClickStudent && onClickStudent(session.student_id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onClickStudent && onClickStudent(session.student_id)}
          >
            <div className="session-info">
              <span className="session-student">{session.student_id}</span>
              <StatusBadge status={session.status} />
              {session.feedback_submitted && (
                <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)" }}>
                  Feedback
                </span>
              )}
            </div>
            <div className="session-meta">
              {session.started_at && (
                <span>Started {new Date(session.started_at * 1000).toLocaleString()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompletedSessionList({ sessions, onClickStudent }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="panel">
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--ink-secondary)" }}>
          Completed Sessions
        </h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No completed sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--ink-secondary)" }}>
        Completed Sessions <span className="badge">{sessions.length}</span>
      </h3>
      <div className="session-list">
        {sessions.map((session) => (
          <div
            key={session.student_id}
            className="session-row"
            onClick={() => onClickStudent && onClickStudent(session.student_id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onClickStudent && onClickStudent(session.student_id)}
          >
            <div className="session-info">
              <span className="session-student">{session.student_id}</span>
              <StatusBadge status={session.status} />
              {session.check_result && (
                <span
                  className="badge"
                  style={{
                    background: session.check_result.status === "fixed" ? "var(--green-bg)" : "var(--red-bg)",
                    color: session.check_result.status === "fixed" ? "var(--green)" : "var(--red)",
                    border: `1px solid ${session.check_result.status === "fixed" ? "var(--green-border)" : "var(--red-border)"}`,
                  }}
                >
                  {session.check_result.status?.toUpperCase() || "UNKNOWN"}
                </span>
              )}
              {session.duration_seconds !== null && (
                <span className="badge">{Math.round(session.duration_seconds / 60)} min</span>
              )}
              {session.feedback_submitted && (
                <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)" }}>
                  Feedback
                </span>
              )}
            </div>
            <div className="session-meta">
              {session.commands && session.commands.length > 0 && (
                <span>{session.commands.length} commands</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InstructorLabDetail({ user, labId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchDetail = useCallback(() => {
    getInstructorLabDetail(labId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [labId]);

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 15000);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  const handleClickStudent = (studentId) => {
    window.location.href = `/instructor/labs/${labId}/${studentId}`;
  };

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <a href="/instructor" className="back-link">&larr; Back to instructor dashboard</a>
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

  const { scenario, active_sessions, completed_sessions, feedback_count } = data;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/instructor" className="back-link">&larr; Back to instructor dashboard</a>
        <h1>{scenario.title}</h1>

        <div className="toolbar" style={{ marginBottom: "1rem" }}>
          <a href={scenario.documentation?.student_guide_url} target="_blank" rel="noreferrer" className="btn btn-sm">
            Lab Guide
          </a>
          <a href={scenario.documentation?.solution_guide_url} target="_blank" rel="noreferrer" className="btn btn-sm">
            Solution Guide
          </a>
          <a href={scenario.documentation?.instructor_guide_url} target="_blank" rel="noreferrer" className="btn btn-sm">
            Instructor Guide
          </a>
          <a href={`/api/instructor/feedback/${labId}`} target="_blank" rel="noreferrer" className="btn btn-sm">
            Feedback ({feedback_count})
          </a>
        </div>

        <SessionList
          title="Active Sessions"
          sessions={active_sessions}
          emptyMessage="No active sessions."
          onClickStudent={handleClickStudent}
        />

        <CompletedSessionList
          sessions={completed_sessions}
          onClickStudent={handleClickStudent}
        />
      </div>
    </>
  );
}
