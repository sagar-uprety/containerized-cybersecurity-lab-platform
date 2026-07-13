import { useState, useEffect } from "react";
import type { User, GroupDetail, StudentDetail, GroupMember, PendingMember } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import StatCard from "../components/StatCard";
import Breadcrumbs from "../components/Breadcrumbs";
import { navigate } from "../utils/navigate";
import { fmtDuration, fmtTimestamp } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { getGroupDetail, getInstructorStudentDetail } from "../api";

interface InstructorGroupStudentDetailProps {
  user: User;
  groupId: number;
  studentId: string;
  onLogout: () => void;
}

export default function InstructorGroupStudentDetail({ user, groupId, studentId, onLogout }: InstructorGroupStudentDetailProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideShort, setHideShort] = useState(false);

  const memberInfo: (GroupMember & Partial<PendingMember>) | undefined =
    group?.approved_members?.find((m) => m.student_id === studentId)
    || group?.pending_members?.find((m) => m.student_id === studentId);

  useDocumentTitle(memberInfo?.email || studentId);

  useEffect(() => {
    Promise.all([
      getGroupDetail(groupId),
      getInstructorStudentDetail(studentId),
    ]).then(([g, s]: [GroupDetail, StudentDetail]) => {
      setGroup(g);
      const groupLabIds = new Set(g.labs.map((l) => l.lab_id));
      const filteredLabs = s.labs.filter((l) => groupLabIds.has(l.lab_id));
      setStudent({ ...s, labs: filteredLabs });
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [groupId, studentId]);

  const totalSessions = student?.labs?.reduce((acc, l) => acc + (l.total_sessions || 0), 0) || 0;
  const passedLabs = student?.labs?.filter((l) => {
    const c = l.latest_check;
    return c && (c.passed === true || c.status === "fixed");
  }).length || 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: group?.name || "Group", href: `/instructor/groups/${groupId}` },
          { label: memberInfo?.email || studentId },
        ]} />

        <h1>{memberInfo?.email || studentId}</h1>

        <div className="flex-center flex-wrap gap-sm mb-lg">
          {memberInfo?.semester && <span className="badge">{memberInfo.semester}</span>}
          {memberInfo?.study_program && <span className="badge">{memberInfo.study_program}</span>}
          <span className="badge text-mono">{studentId}</span>
        </div>

        <div className="stat-grid stat-grid-auto mb-lg">
          <StatCard value={student?.labs?.length || 0} label="Labs Assigned" />
          <StatCard value={passedLabs} label="Passed" color="var(--green)" />
          <StatCard value={totalSessions} label="Sessions" />
        </div>

        <AlertError message={error} />

        {!student && !error && (
          <div className="skeleton" style={{ height: 200 }} />
        )}

        {student && student.labs.length === 0 && (
          <div className="empty-state">No lab data for this student in this group.</div>
        )}

        {student && student.labs.some((l) => l.sessions?.some((s) => s.duration_seconds && s.duration_seconds < 60)) && (
          <div className="mb-md">
            <label className="filter-checkbox-label">
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
            <section key={lab.lab_id} className="section-block">
              <div className="section-header-row">
                <h2 className="mb-0">{lab.lab_title}</h2>
                {lab.latest_check ? (
                  <span className={`badge ${lab.latest_check.passed === true || lab.latest_check.status === "fixed" ? "badge-success" : "badge-danger"}`}>
                    {lab.latest_check.passed === true || lab.latest_check.status === "fixed" ? "Passed" : lab.latest_check.status?.toUpperCase() || "Failed"}
                  </span>
                ) : (
                  <span className="badge">Not attempted</span>
                )}
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
                        const rowHref = `/instructor/groups/${groupId}/students/${studentId}/labs/${lab.lab_id}?session=${sessionIndex}`;
                        return (
                          <tr
                            key={i}
                            className="clickable-row"
                            role="link"
                            tabIndex={0}
                            onClick={() => navigate(rowHref)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(rowHref); } }}
                          >
                            <td className="mono-cell text-sm-muted">
                              #{sessionIndex}
                            </td>
                            <td>{fmtTimestamp(sess.started_at)}</td>
                            <td>{fmtDuration(sess.duration_seconds)}</td>
                            <td>{sess.check_count || 0}</td>
                            <td>
                              {(() => {
                                const style = outcomeStyle(sess.outcome);
                                return <span className={`badge ${style.badgeClass}`}>{style.label}</span>;
                              })()}
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
                <div className="panel text-center mb-0" style={{ color: "var(--muted)" }}>
                  {hideShort ? "All sessions under 1 minute (hidden)." : "No sessions recorded."}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </InstructorLayout>
  );
}
