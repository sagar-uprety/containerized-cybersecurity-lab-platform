import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import { getGroupDetail, getInstructorStudentDetail } from "../api.js";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return "—";
  const m = Math.round(sec / 60);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTimestamp(ts) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InstructorGroupStudentDetail({ user, groupId, studentId, onLogout }) {
  const [group, setGroup] = useState(null);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [hideShort, setHideShort] = useState(false);

  useEffect(() => {
    Promise.all([
      getGroupDetail(groupId),
      getInstructorStudentDetail(studentId),
    ]).then(([g, s]) => {
      setGroup(g);
      const groupLabIds = new Set(g.labs.map((l) => l.lab_id));
      const filteredLabs = s.labs.filter((l) => groupLabIds.has(l.lab_id));
      setStudent({ ...s, labs: filteredLabs });
    }).catch((err) => setError(err.message));
  }, [groupId, studentId]);

  const memberInfo = group?.approved_members?.find((m) => m.student_id === studentId)
    || group?.pending_members?.find((m) => m.student_id === studentId);

  const totalSessions = student?.labs?.reduce((acc, l) => acc + (l.total_sessions || 0), 0) || 0;
  const passedLabs = student?.labs?.filter((l) => {
    const c = l.latest_check;
    return c && (c.passed === true || c.status === "fixed");
  }).length || 0;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a
          href={`/instructor/groups/${groupId}`}
          className="back-link"
          onClick={(e) => { e.preventDefault(); nav(`/instructor/groups/${groupId}`); }}
        >
          &larr; Back to {group?.name || "Group"}
        </a>

        <h1>{memberInfo?.email || studentId}</h1>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {memberInfo?.semester && <span className="badge">{memberInfo.semester}</span>}
          {memberInfo?.study_program && <span className="badge">{memberInfo.study_program}</span>}
          <span className="badge" style={{ fontFamily: "var(--font-mono)" }}>{studentId}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "2rem" }}>
          <div className="panel" style={{ textAlign: "center", marginBottom: 0, padding: "0.75rem" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--tum-blue)" }}>{student?.labs?.length || 0}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Labs Assigned</div>
          </div>
          <div className="panel" style={{ textAlign: "center", marginBottom: 0, padding: "0.75rem" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--green)" }}>{passedLabs}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Passed</div>
          </div>
          <div className="panel" style={{ textAlign: "center", marginBottom: 0, padding: "0.75rem" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--tum-blue)" }}>{totalSessions}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Sessions</div>
          </div>
        </div>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", background: "var(--red-bg)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {!student && !error && (
          <div className="skeleton" style={{ height: 200 }} />
        )}

        {student && student.labs.length === 0 && (
          <div className="empty-state">No lab data for this student in this group.</div>
        )}

        {student && student.labs.some((l) => l.sessions?.some((s) => s.duration_seconds && s.duration_seconds < 60)) && (
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--ink-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={hideShort}
                onChange={(e) => setHideShort(e.target.checked)}
              />
              Hide sessions under 1 minute
            </label>
          </div>
        )}

        {student && student.labs.map((lab) => {
          const sessions = hideShort
            ? (lab.sessions || []).filter((s) => !s.duration_seconds || s.duration_seconds >= 60)
            : (lab.sessions || []);

          return (
            <section key={lab.lab_id} style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                <h2 style={{ margin: 0 }}>{lab.lab_title}</h2>
                <LabResultBadge check={lab.latest_check} />
              </div>

              {sessions.length > 0 ? (
                <div className="panel" style={{ padding: 0, overflow: "hidden", marginBottom: 0 }}>
                  <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Started</th>
                        <th>Duration</th>
                        <th>Checks</th>
                        <th>Outcome</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((sess, i) => {
                        const sessionIndex = (lab.sessions || []).length - (lab.sessions || []).indexOf(sess);
                        return (
                          <tr
                            key={i}
                            style={{ cursor: "pointer" }}
                            onClick={() => nav(`/instructor/groups/${groupId}/students/${studentId}/labs/${lab.lab_id}?session=${sessionIndex}`)}
                          >
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "var(--muted)" }}>
                              #{sessionIndex}
                            </td>
                            <td>{fmtTimestamp(sess.started_at)}</td>
                            <td>{fmtDuration(sess.duration_seconds)}</td>
                            <td>{sess.check_count || 0}</td>
                            <td>
                              <OutcomeBadge outcome={sess.outcome} />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <span style={{ fontSize: "0.82rem", color: "var(--tum-blue)" }}>
                                Details &rarr;
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel" style={{ textAlign: "center", color: "var(--muted)", marginBottom: 0 }}>
                  {hideShort ? "All sessions under 1 minute (hidden)." : "No sessions recorded."}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function LabResultBadge({ check }) {
  if (!check) return <span className="badge">Not attempted</span>;
  const passed = check.passed === true || check.status === "fixed";
  return (
    <span
      className="badge"
      style={{
        backgroundColor: passed ? "var(--green-bg)" : "var(--red-bg)",
        color: passed ? "var(--green)" : "var(--red)",
        border: `1px solid ${passed ? "var(--green-border)" : "var(--red-border)"}`,
      }}
    >
      {passed ? "Passed" : check.status?.toUpperCase() || "Failed"}
    </span>
  );
}

function OutcomeBadge({ outcome }) {
  const map = {
    end: { label: "Ended", color: "var(--muted)", bg: "var(--border-light)" },
    stop: { label: "Stopped", color: "var(--amber)", bg: "var(--amber-bg)" },
    auto_stop: { label: "Auto-stopped", color: "var(--amber)", bg: "var(--amber-bg)" },
    destroy: { label: "Destroyed", color: "var(--red)", bg: "var(--red-bg)" },
    start: { label: "Running", color: "var(--green)", bg: "var(--green-bg)" },
    running: { label: "Running", color: "var(--green)", bg: "var(--green-bg)" },
  };
  const style = map[outcome] || { label: outcome || "—", color: "var(--muted)", bg: "var(--border-light)" };
  return (
    <span className="badge" style={{ backgroundColor: style.bg, color: style.color }}>
      {style.label}
    </span>
  );
}
