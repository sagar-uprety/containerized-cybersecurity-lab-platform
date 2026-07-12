import { useState, useEffect } from "react";
import type { User, SessionDetail } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import CheckResult from "../components/CheckResult";
import Link from "../components/Link";
import { getInstructorSessionDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";

interface Props {
  user: User;
  labId: string;
  studentId: string;
  onLogout: () => void;
}

export default function InstructorSessionDetail({ user, labId, studentId, onLogout }: Props) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(data ? `${labId} — ${studentId}` : "Session Detail");

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [labId, studentId]);

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <Link href={`/instructor/labs/${labId}`} className="back-link">← Back to lab detail</Link>
          <AlertError message={error} />
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

  const { status, duration_seconds, commands, latest_check, lifecycle_events, scenario } = data;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Link href={`/instructor/labs/${labId}`} className="back-link">← Back to lab detail</Link>
        <h1>{labId} — {studentId}</h1>

        <div className="status-row">
          <span className="status-label">Status</span>
          <span className={`badge badge-${status}`}>{status}</span>
        </div>

        {duration_seconds != null && (
          <div className="status-row">
            <span className="status-label">Duration</span>
            <span>{Math.round(duration_seconds / 60)} minutes</span>
          </div>
        )}

        {latest_check && (
          <CheckResult result={latest_check} visible={true} checkerChecks={scenario?.checker?.checks} />
        )}

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Commands</span>
          </div>
          {commands && commands.length > 0 ? (
            <div className="command-list">
              {commands.map((cmd) => (
                <div key={`${cmd.timestamp}-${cmd.command}`} className="command-row">
                  <span className="command-timestamp">{cmd.timestamp}</span>
                  <code className="command-text">{cmd.command}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm-muted">No commands recorded.</p>
          )}
        </div>

        {lifecycle_events && lifecycle_events.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Lifecycle Events</span>
            </div>
            <div className="event-list">
              {lifecycle_events.map((event) => (
                <div key={`${event.timestamp}-${event.action}`} className="event-row">
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
