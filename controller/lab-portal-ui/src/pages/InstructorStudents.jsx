import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { showToast } from "../components/Toast.jsx";
import { getStudentsProgress, removeGroupMember, deleteStudent } from "../api.js";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function fmtTime(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function LastActiveBadge({ ts }) {
  if (!ts) return <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>Never</span>;
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  const color = diffDays > 7 ? "var(--red)" : diffDays > 3 ? "var(--amber)" : "var(--green)";
  const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
  return <span style={{ fontSize: "0.82rem", color, fontWeight: 500 }}>{label}</span>;
}

function ProgressBar({ pct }) {
  const color = pct >= 80 ? "var(--green)" : pct >= 40 ? "var(--amber)" : pct > 0 ? "var(--red)" : "var(--border)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3, overflow: "hidden", minWidth: 50,
        background: "var(--border-light)",
        border: pct === 0 ? "1px solid var(--border)" : "none",
      }}>
        <div style={{ width: `${Math.max(pct, 0)}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.2s" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)", color: "var(--muted)", minWidth: 32 }}>
        {pct}%
      </span>
    </div>
  );
}

export default function InstructorStudents({ user, onLogout }) {
  const params = new URLSearchParams(window.location.search);
  const filterGroupId = params.get("group") ? parseInt(params.get("group"), 10) : null;

  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("email");
  const [sortDir, setSortDir] = useState(1);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getStudentsProgress()
      .then(setStudents)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => -d);
    else { setSortBy(col); setSortDir(1); }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (removeTarget.groups?.length > 0) {
        for (const g of removeTarget.groups) {
          await removeGroupMember(g.id, removeTarget.student_id);
        }
      } else {
        await deleteStudent(removeTarget.student_id);
      }
      setRemoveTarget(null);
      refresh();
      showToast("Student removed");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const groupFiltered = filterGroupId
    ? (students || []).filter((s) => s.groups?.some((g) => g.id === filterGroupId))
    : (students || []);

  const filterGroupName = filterGroupId
    ? groupFiltered[0]?.groups?.find((g) => g.id === filterGroupId)?.name || `Group #${filterGroupId}`
    : null;

  const filtered = groupFiltered.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.email || "").toLowerCase().includes(q) ||
      (s.student_id || "").toLowerCase().includes(q) ||
      (!filterGroupId && (s.groups || []).some((g) => g.name.toLowerCase().includes(q)))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case "email": va = a.email || ""; vb = b.email || ""; break;
      case "group": va = (a.groups?.[0]?.name || ""); vb = (b.groups?.[0]?.name || ""); break;
      case "passed": va = a.labs_passed || 0; vb = b.labs_passed || 0; break;
      case "sessions": va = a.total_sessions || 0; vb = b.total_sessions || 0; break;
      case "time": va = a.total_time_seconds || 0; vb = b.total_time_seconds || 0; break;
      case "last_active": va = a.last_active || ""; vb = b.last_active || ""; break;
      default: va = a.email || ""; vb = b.email || "";
    }
    if (typeof va === "string") return va.localeCompare(vb) * sortDir;
    return (va - vb) * sortDir;
  });

  const SortHeader = ({ col, children, align }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none", textAlign: align || "left" }}
      onClick={() => toggleSort(col)}
    >
      {children} {sortBy === col ? (sortDir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  const backPath = filterGroupId ? `/instructor/groups/${filterGroupId}` : "/instructor";
  const backLabel = filterGroupName ? `Back to ${filterGroupName}` : "Back to Dashboard";

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href={backPath} className="back-link" onClick={(e) => { e.preventDefault(); nav(backPath); }}>
          &larr; {backLabel}
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <h1 style={{ margin: 0 }}>
            {filterGroupName ? `Students in ${filterGroupName}` : "All Students"}
          </h1>
          {filterGroupId && (
            <a
              href="/instructor/students"
              className="btn btn-sm"
              style={{ fontSize: "0.78rem", height: 28 }}
              onClick={(e) => { e.preventDefault(); nav("/instructor/students"); }}
            >
              View All
            </a>
          )}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder={filterGroupId ? "Search by email or ID..." : "Search by email, ID, or group..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", background: "var(--red-bg)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {!students && !error && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        )}

        {students && sorted.length === 0 && (
          <div className="empty-state">
            {search ? "No students match your search." : filterGroupId ? "No students in this group." : "No students registered yet."}
          </div>
        )}

        {students && sorted.length > 0 && (
          <div className="panel" style={{ padding: 0, overflow: "auto" }}>
            <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
              <thead>
                <tr>
                  <SortHeader col="email">Student</SortHeader>
                  {!filterGroupId && <SortHeader col="group">Group</SortHeader>}
                  <SortHeader col="passed" align="center">Passed</SortHeader>
                  <SortHeader col="sessions" align="center">Sessions</SortHeader>
                  <SortHeader col="time" align="center">Time Spent</SortHeader>
                  <SortHeader col="last_active" align="center">Last Active</SortHeader>
                  <th style={{ textAlign: "center", width: 120 }}>Completion</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const pct = s.labs_assigned > 0 ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                  const targetGroup = filterGroupId
                    ? s.groups?.find((g) => g.id === filterGroupId)
                    : s.groups?.[0];
                  return (
                    <tr key={s.student_id} style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (targetGroup) nav(`/instructor/groups/${targetGroup.id}/students/${s.student_id}`);
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.email}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                          {[s.semester, s.study_program].filter(Boolean).join(" · ") || s.student_id}
                        </div>
                      </td>
                      {!filterGroupId && (
                        <td>
                          {s.groups?.length > 0 ? (
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                              {s.groups.map((g) => (
                                <span key={g.id} className="badge">{g.name}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>No group</span>
                          )}
                        </td>
                      )}
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: "0.88rem",
                          color: s.labs_passed > 0 ? "var(--green)" : "var(--ink)",
                          fontWeight: 600,
                        }}>
                          {s.labs_passed} / {s.labs_assigned}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.88rem", color: "var(--muted)" }}>
                        {s.total_sessions}
                      </td>
                      <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--muted)" }}>
                        {fmtTime(s.total_time_seconds)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <LastActiveBadge ts={s.last_active} />
                      </td>
                      <td style={{ width: 120 }}>
                        <ProgressBar pct={pct} />
                      </td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-sm"
                          style={{ color: "var(--red)", borderColor: "var(--red-border)", fontSize: "0.72rem", height: 24, padding: "0 0.4rem" }}
                          onClick={() => setRemoveTarget(s)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!removeTarget}
        title={`Remove ${removeTarget?.email || "student"}?`}
        message={
          removeTarget?.groups?.length > 0
            ? `This removes them from ${removeTarget.groups.map((g) => g.name).join(", ")}. They lose access to labs assigned through ${removeTarget.groups.length > 1 ? "those groups" : "that group"}. Session history is preserved.`
            : "This student is not in any group. Remove their account?"
        }
        confirmLabel={busy ? "Removing..." : "Remove"}
        confirmDanger
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
