import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import { getDashboardStats, createGroup, getInstructorStudents } from "../api.js";

function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const ACTION_LABELS = {
  start: "started",
  stop: "stopped",
  end: "ended",
  check: "checked",
  auto_stop: "auto-stopped",
  retention_cleanup: "cleaned up",
};

export default function InstructorOverview({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [newGroup, setNewGroup] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");

  const refresh = useCallback(async () => {
    try {
      setData(await getDashboardStats());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (studentSearch.length >= 2 && !students) {
      getInstructorStudents().then(setStudents).catch(() => {});
    }
  }, [studentSearch, students]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(newGroup.trim());
      setNewGroup("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function nav(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const filteredGroups = data?.groups?.filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Instructor Dashboard</h1>

        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
            <StatCard value={data.total_groups} label="Groups" />
            <StatCard
              value={data.total_students}
              label="Students"
              href="/instructor/students"
              onClick={() => nav("/instructor/students")}
            />
            <StatCard value={data.total_labs} label="Labs" />
            <StatCard
              value={data.total_pending}
              label="Pending Approvals"
              highlight={data.total_pending > 0}
              href={data.total_pending > 0 ? "/instructor/pending" : undefined}
              onClick={data.total_pending > 0 ? () => nav("/instructor/pending") : undefined}
            />
          </div>
        )}

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", background: "var(--red-bg)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* ── Student Search ── */}
        <section style={{ marginBottom: "2rem" }}>
          <h2>Student Search</h2>
          <input
            type="text"
            placeholder="Find a student across all groups..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          {studentSearch.length >= 2 && students && (() => {
            const q = studentSearch.toLowerCase();
            const matches = students.filter((s) =>
              s.email?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)
            ).slice(0, 8);
            if (matches.length === 0) return (
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>No students found.</div>
            );
            return (
              <div className="panel" style={{ padding: 0, marginTop: "0.5rem", overflow: "hidden" }}>
                {matches.map((s) => (
                  <div
                    key={s.student_id}
                    style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border-light)" }}
                  >
                    <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>{s.email || s.student_id}</div>
                    {s.groups?.length > 0 ? (
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                        {s.groups.map((g) => (
                          <a
                            key={g.id}
                            href={`/instructor/groups/${g.id}/students/${s.student_id}`}
                            onClick={(e) => { e.preventDefault(); nav(`/instructor/groups/${g.id}/students/${s.student_id}`); }}
                            className="btn btn-sm"
                            style={{ height: 24, fontSize: "0.75rem", padding: "0 0.5rem" }}
                          >
                            {g.name} &rarr;
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.2rem" }}>Not enrolled in any group</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* ── Groups ── */}
        <section style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>Groups</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
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
              style={{ maxWidth: 220, marginBottom: "0.75rem" }}
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
              {filteredGroups.map((g) => (
                <article
                  key={g.id}
                  className="lab-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => nav(`/instructor/groups/${g.id}`)}
                >
                  <span className="lab-card-title">{g.name}</span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="badge">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                    <span className="badge">{g.lab_count} lab{g.lab_count !== 1 ? "s" : ""}</span>
                    {g.pending_count > 0 && (
                      <span className="badge" style={{ backgroundColor: "var(--amber-bg)", color: "var(--amber)", border: "1px solid var(--amber-border)" }}>
                        {g.pending_count} pending
                      </span>
                    )}
                  </div>
                  {g.created_at && (
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Activity ── */}
        <section>
          <h2>Recent Activity</h2>
          {data?.recent_activity?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {data.recent_activity.map((ev, i) => (
                <div key={i} style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--border-light)", fontSize: "0.82rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      <strong style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>{ev.student_id}</strong>
                      {" "}{ACTION_LABELS[ev.action] || ev.action}{" "}
                      <span style={{ color: "var(--ink-secondary)" }}>{ev.lab_title}</span>
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", flexShrink: 0, marginLeft: "1rem" }}>
                      {timeAgo(ev.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel" style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              No recent activity.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({ value, label, highlight, href, onClick }) {
  const interactive = !!href;
  const Tag = interactive ? "a" : "div";
  return (
    <Tag
      href={href}
      onClick={interactive ? (e) => { e.preventDefault(); onClick?.(); } : undefined}
      className="panel"
      style={{
        textAlign: "center",
        marginBottom: 0,
        padding: "1rem",
        textDecoration: "none",
        color: "inherit",
        cursor: interactive ? "pointer" : "default",
        transition: interactive ? "border-color 0.15s" : undefined,
      }}
    >
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: highlight ? "var(--amber)" : "var(--tum-blue)" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>{label}</div>
    </Tag>
  );
}
