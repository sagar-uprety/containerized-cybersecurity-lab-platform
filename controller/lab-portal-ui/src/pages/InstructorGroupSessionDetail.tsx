import { useState, useEffect } from "react";
import type { User, SessionDetail, CheckResultData, Command } from "../types";
import Header from "../components/Header";
import CheckResult from "../components/CheckResult";
import AlertError from "../components/AlertError";
import Breadcrumbs from "../components/Breadcrumbs";
import { navigate } from "../utils/navigate";
import { fmtTimestamp } from "../utils/time";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { getInstructorSessionDetail } from "../api";

interface InstructorGroupSessionDetailProps {
  user: User;
  groupId: number;
  studentId: string;
  labId: string;
  onLogout: () => void;
}

interface ParsedSession {
  started_at: string;
  ended_at: string | null;
  outcome: string;
}

export default function InstructorGroupSessionDetail({ user, groupId, studentId, labId, onLogout }: InstructorGroupSessionDetailProps) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const sessionNum = params.get("session");

  useDocumentTitle(
    sessionNum
      ? `Session #${sessionNum} — ${labId}`
      : `${labId} — ${studentId}`
  );

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [labId, studentId]);

  const backPath = groupId
    ? `/instructor/groups/${groupId}/students/${studentId}`
    : "/instructor";

  const breadcrumbs = groupId
    ? [
        { label: "Dashboard", href: "/instructor" },
        { label: `Group`, href: `/instructor/groups/${groupId}` },
        { label: studentId, href: `/instructor/groups/${groupId}/students/${studentId}` },
        { label: sessionNum ? `Session #${sessionNum}` : labId },
      ]
    : [
        { label: "Dashboard", href: "/instructor" },
        { label: sessionNum ? `Session #${sessionNum}` : labId },
      ];

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <Breadcrumbs items={breadcrumbs} />
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

  const { status, duration_seconds, commands, latest_check, scenario, lifecycle_events, check_results } = data;

  let sessionCommands: Command[] = commands || [];
  let sessionCheck: CheckResultData | null | undefined = latest_check;
  let sessionStatus: string = status;
  let sessionDuration: number | undefined = duration_seconds;

  if (sessionNum && lifecycle_events) {
    const endActions = new Set(["end", "stop", "destroy", "auto_stop"]);
    const sessions: ParsedSession[] = [];
    let current: ParsedSession | null = null;
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

      const allChecks = check_results || [];
      const sessionChecks = allChecks.filter((cr) => {
        const t = new Date(cr.timestamp || cr.checked_at || "");
        return t >= sStart && t <= sEnd;
      });
      sessionCheck = sessionChecks.length > 0
        ? sessionChecks[sessionChecks.length - 1].check_result || sessionChecks[sessionChecks.length - 1] as unknown as CheckResultData
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
        <Breadcrumbs items={breadcrumbs} />

        <h1>{scenario?.title || labId}</h1>
        <div className="text-sm-muted mb-md">
          {studentId}
          {sessionNum && <span style={{ marginLeft: "var(--sp-2)" }}>&middot; Session #{sessionNum}</span>}
        </div>

        <div className="flex-center flex-wrap gap-lg mb-lg">
          <div className="panel inline-panel">
            <span className="status-label">Status</span>
            <span className={`badge badge-${sessionStatus === "running" ? "running" : sessionStatus === "error" ? "error" : "stopped"}`}>
              {(sessionStatus || "").replace("_", " ").toUpperCase()}
            </span>
          </div>
          {sessionDuration != null && (
            <div className="panel inline-panel">
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
            <h2 className="mb-0">Commands</h2>
            {sessionCommands.length > 0 && (
              <span className="text-sm-muted">
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
            <p className="text-sm-muted">No commands recorded{sessionNum ? " for this session" : ""}.</p>
          )}
        </div>
      </div>
    </>
  );
}
