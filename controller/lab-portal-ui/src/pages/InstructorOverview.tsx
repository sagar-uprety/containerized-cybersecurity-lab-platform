import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../components/Header.jsx";
import StatCard from "../components/StatCard";
import AlertError from "../components/AlertError";
import Link from "../components/Link";
import { getDashboardStats, createGroup, getInstructorStudents } from "../api.js";
import { navigate } from "../utils/navigate";
import { timeAgo } from "../utils/time";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";
import type { User, DashboardStats, ActivityEvent, Group, StudentsProgressEntry } from "../types";

const ACTION_LABELS: Record<string, string> = {
  start: "started",
  stop: "stopped",
  end: "ended",
  check: "checked",
  auto_stop: "auto-stopped",
  retention_cleanup: "cleaned up",
};

interface Props {
  user: User;
  onLogout: () => void;
}

export default function InstructorOverview({ user, onLogout }: Props) {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentsProgressEntry[] | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

  const debouncedStudentSearch = useDebounce(studentSearch, 300);

  useDocumentTitle("Instructor Dashboard");

  const refresh = useCallback(async () => {
    try {
      setData(await getDashboardStats());
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (debouncedStudentSearch.length >= 2 && !students) {
      getInstructorStudents().then((data) => setStudents(data as unknown as StudentsProgressEntry[])).catch(() => {});
    }
  }, [debouncedStudentSearch, students]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(newGroup.trim());
      setNewGroup("");
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const filteredGroups = data?.groups?.filter((g: Group) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const studentMatches = useMemo(() => {
    if (debouncedStudentSearch.length < 2 || !students) return [];
    const q = debouncedStudentSearch.toLowerCase();
    return students.filter((s) =>
      s.email?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [debouncedStudentSearch, students]);

  function handleGroupKeyDown(e: React.KeyboardEvent, groupId: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/instructor/groups/${groupId}`);
    }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Instructor Dashboard</h1>

        {data && (
          <div className="stat-grid mb-lg">
            <StatCard value={data.total_groups} label="Groups" />
            <StatCard
              value={data.total_students}
              label="Students"
              href="/instructor/students"
            />
            <StatCard value={data.total_labs} label="Labs" />
            <StatCard
              value={data.total_pending}
              label="Pending Approvals"
              highlight={data.total_pending > 0}
              href={data.total_pending > 0 ? "/instructor/pending" : undefined}
            />
          </div>
        )}

        <AlertError message={error} className="mb-lg" />

        {/* Student Search */}
        <section className="section-block">
          <h2>Student Search</h2>
          <input
            type="text"
            placeholder="Find a student across all groups..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          {debouncedStudentSearch.length >= 2 && students && (
            studentMatches.length === 0 ? (
              <div className="text-sm-muted" style={{ marginTop: "var(--sp-2)" }}>No students found.</div>
            ) : (
              <div className="panel" style={{ padding: 0, marginTop: "var(--sp-2)", overflow: "hidden" }}>
                {studentMatches.map((s) => (
                  <div
                    key={s.student_id}
                    style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border-light)" }}
                  >
                    <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>{s.email || s.student_id}</div>
                    {s.groups && s.groups.length > 0 ? (
                      <div className="flex-center flex-wrap gap-sm" style={{ marginTop: "var(--sp-1)" }}>
                        {s.groups.map((g) => (
                          <Link
                            key={g.id}
                            href={`/instructor/groups/${g.id}/students/${s.student_id}`}
                            className="btn btn-sm"
                            style={{ height: 24, fontSize: "0.75rem", padding: "0 0.5rem" }}
                          >
                            {g.name} &rarr;
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs-muted" style={{ marginTop: "var(--sp-1)" }}>Not enrolled in any group</div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        {/* Groups */}
        <section className="section-block">
          <div className="section-header-row">
            <h2 className="mb-0">Groups</h2>
            <form onSubmit={handleCreate} className="flex-center" style={{ gap: "0.35rem" }}>
              <input
                type="text"
                placeholder="New group..."
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                required
                style={{ width: 140, fontSize: "0.82rem", padding: "0.3rem 0.5rem", height: 30 }}
              />
              <button type="submit" className="btn btn-sm" disabled={creating} style={{ height: 30, fontSize: "0.78rem" }}>
                {creating ? "..." : "+ Create"}
              </button>
            </form>
          </div>

          {filteredGroups.length > 3 && (
            <input
              type="text"
              placeholder="Filter groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-md"
              style={{ maxWidth: 220 }}
            />
          )}

          {!data && !error && (
            <div className="labs-grid">
              {[1, 2].map((i) => (
                <div key={i} className="lab-card">
                  <div className="skeleton" style={{ height: 20, width: "60%" }} />
                  <div className="skeleton" style={{ height: 16, width: "40%", marginTop: 8 }} />
                </div>
              ))}
            </div>
          )}

          {data && filteredGroups.length === 0 && (
            <div className="empty-state">
              {search ? "No groups match your filter." : "No groups yet. Create one to get started."}
            </div>
          )}

          {filteredGroups.length > 0 && (
            <div className="labs-grid">
              {filteredGroups.map((g: Group) => (
                <article
                  key={g.id}
                  className="lab-card clickable-row"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/instructor/groups/${g.id}`)}
                  onKeyDown={(e) => handleGroupKeyDown(e, g.id)}
                >
                  <span className="lab-card-title">{g.name}</span>
                  <div className="flex-center flex-wrap gap-sm">
                    <span className="badge">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                    <span className="badge">{g.lab_count} lab{g.lab_count !== 1 ? "s" : ""}</span>
                    {g.pending_count > 0 && (
                      <span className="badge badge-pending">
                        {g.pending_count} pending
                      </span>
                    )}
                  </div>
                  {g.created_at && (
                    <div className="text-sm-muted">
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section className="section-block">
          <h2>Recent Activity</h2>
          {data?.recent_activity && data.recent_activity.length > 0 ? (
            <div className="flex-col gap-sm">
              {data.recent_activity.map((ev: ActivityEvent, i: number) => (
                <div key={i} style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--border-light)", fontSize: "0.82rem" }}>
                  <div className="flex-between">
                    <span>
                      <strong className="text-mono-data" style={{ fontSize: "0.78rem" }}>{ev.student_id}</strong>
                      {" "}{ACTION_LABELS[ev.action] || ev.action}{" "}
                      <span style={{ color: "var(--ink-secondary)" }}>{ev.lab_title}</span>
                    </span>
                    <span className="text-sm-muted" style={{ fontSize: "0.72rem", flexShrink: 0, marginLeft: "var(--sp-4)" }}>
                      {timeAgo(ev.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel text-center" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              No recent activity.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
