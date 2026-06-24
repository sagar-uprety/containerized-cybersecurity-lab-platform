import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import {
  getGroupDetail,
  getInstructorLabs,
  getGroupProgress,
  approveMembers,
  rejectMembers,
  assignGroupLabWithDeadline,
  unassignGroupLab,
} from "../api.js";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToISO(val) {
  if (!val) return null;
  return new Date(val).toISOString().replace("Z", "+00:00");
}

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function InstructorGroupDetail({ user, groupId, onLogout }) {
  const [group, setGroup] = useState(null);
  const [labs, setLabs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [g, l] = await Promise.all([
        getGroupDetail(groupId),
        getInstructorLabs(),
      ]);
      setGroup(g);
      setLabs(l.map((x) => ({ id: x.id, title: x.title, difficulty: x.difficulty })));
      setSelected(new Set());
      getGroupProgress(groupId).then(setProgress).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSelect(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function selectAll() {
    if (!group) return;
    const allIds = group.pending_members.map((m) => m.user_id);
    setSelected((prev) => prev.size === allIds.length ? new Set() : new Set(allIds));
  }

  async function handleApprove() {
    if (!group || selected.size === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      await approveMembers(groupId, [...selected], group.csrf_token);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!group || selected.size === 0) return;
    if (!window.confirm(`Reject ${selected.size} student(s)?`)) return;
    setActionLoading(true);
    setError(null);
    try {
      await rejectMembers(groupId, [...selected], group.csrf_token);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setActionLoading(false); }
  }

  async function handleAssignLab(labId) {
    setBusy(`assign-${labId}`);
    setError(null);
    try {
      await assignGroupLabWithDeadline(groupId, labId, null);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function handleUpdateDeadline(labId, deadline) {
    setBusy(`deadline-${labId}`);
    setError(null);
    try {
      await assignGroupLabWithDeadline(groupId, labId, deadline || null);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function handleUnassignLab(labId) {
    setBusy(`remove-${labId}`);
    setError(null);
    try {
      await unassignGroupLab(groupId, labId);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!group && !error) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="empty-state">Loading group...</div>
        </div>
      </>
    );
  }

  const now = new Date();
  const assignedLabIds = new Set((group?.labs || []).map((l) => l.lab_id));
  const unassignedLabs = labs.filter((l) => !assignedLabIds.has(l.id));
  const activeLabs = (group?.labs || []).filter((gl) => !gl.deadline || new Date(gl.deadline) >= now);
  const pastLabs = (group?.labs || []).filter((gl) => gl.deadline && new Date(gl.deadline) < now);

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/instructor" className="back-link" onClick={(e) => { e.preventDefault(); nav("/instructor"); }}>
          &larr; Back to Dashboard
        </a>

        <h1>{group?.name || "Group"}</h1>

        {/* ── Group Stats ── */}
        {progress && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
            <StatCard value={progress.total_students} label="Students" />
            <StatCard value={progress.total_labs} label="Labs" />
            <StatCard
              value={`${progress.total_passed} / ${progress.total_possible}`}
              label="Completed"
              color={progress.total_passed > 0 ? "var(--green)" : "var(--tum-blue)"}
            />
          </div>
        )}

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", background: "var(--red-bg)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* ── 1. Lab Assignments ── */}
        <section style={{ marginBottom: "2rem" }}>
          <h2>Lab Assignments</h2>

          {activeLabs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              {activeLabs.map((gl) => (
                <LabAssignmentCard
                  key={gl.lab_id}
                  labId={gl.lab_id}
                  labTitle={labs.find((l) => l.id === gl.lab_id)?.title || gl.lab_id}
                  deadline={gl.deadline}
                  busy={busy}
                  onSaveDeadline={(d) => handleUpdateDeadline(gl.lab_id, d)}
                  onRemove={() => handleUnassignLab(gl.lab_id)}
                />
              ))}
            </div>
          )}

          {pastLabs.length > 0 && (
            <>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.5rem", marginTop: "1rem" }}>
                Past Deadline
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", opacity: 0.6 }}>
                {pastLabs.map((gl) => (
                  <div key={gl.lab_id} className="panel" style={{ marginBottom: 0, padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          {labs.find((l) => l.id === gl.lab_id)?.title || gl.lab_id}
                        </span>
                        <span className="badge" style={{ backgroundColor: "var(--border-light)", color: "var(--muted)" }}>
                          Ended {new Date(gl.deadline).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="btn btn-sm"
                        disabled={!!busy}
                        onClick={() => {
                          if (window.confirm("Remove this past assignment? Student results for this lab will still be visible in their session history."))
                            handleUnassignLab(gl.lab_id);
                        }}
                        style={{ color: "var(--muted)", borderColor: "var(--border-light)", fontSize: "0.78rem" }}
                      >
                        {busy === `remove-${gl.lab_id}` ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeLabs.length === 0 && pastLabs.length === 0 && (
            <div className="panel" style={{ textAlign: "center", color: "var(--muted)", marginBottom: "1rem" }}>
              No labs assigned. Assign labs below to get started.
            </div>
          )}

          {unassignedLabs.length > 0 && (
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink-secondary)", marginBottom: "0.5rem" }}>
                Available Labs
              </div>
              <div className="labs-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {unassignedLabs.map((l) => (
                  <div key={l.id} className="lab-card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{l.title}</div>
                        {l.difficulty && <span className="badge" style={{ marginTop: "0.35rem" }}>{l.difficulty}</span>}
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!!busy}
                        onClick={() => handleAssignLab(l.id)}
                      >
                        {busy === `assign-${l.id}` ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 2. Pending Approvals ── */}
        {group?.pending_members?.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <h2>Pending Approvals</h2>
            <div className="toolbar" style={{ paddingTop: 0 }}>
              <button className="btn btn-sm" onClick={selectAll}>
                {selected.size === group.pending_members.length ? "Deselect All" : "Select All"}
              </button>
              <button className="btn btn-primary btn-sm" disabled={selected.size === 0 || actionLoading} onClick={handleApprove}>
                Approve ({selected.size})
              </button>
              <button className="btn btn-sm" disabled={selected.size === 0 || actionLoading} onClick={handleReject}
                style={{ color: "var(--red)", borderColor: "var(--red-border)" }}>
                Reject
              </button>
            </div>
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>
                      <input type="checkbox" checked={selected.size === group.pending_members.length} onChange={selectAll} />
                    </th>
                    <th>Email</th>
                    <th>Semester</th>
                    <th>Program</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {group.pending_members.map((m) => (
                    <tr key={m.user_id}>
                      <td style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggleSelect(m.user_id)} />
                      </td>
                      <td style={{ fontWeight: 500 }}>{m.email}</td>
                      <td>{m.semester || "—"}</td>
                      <td>{m.study_program || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {m.requested_at ? new Date(m.requested_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 3. Student Results ── */}
        <section style={{ marginBottom: "2rem" }}>
          <h2>Student Results</h2>
          {!progress && group?.approved_members?.length > 0 && (
            <div className="panel" style={{ textAlign: "center", color: "var(--muted)" }}>Loading results...</div>
          )}
          {progress && progress.students.length === 0 && (
            <div className="panel" style={{ textAlign: "center", color: "var(--muted)" }}>No students enrolled yet.</div>
          )}
          {progress && progress.students.length > 0 && (
            <div className="panel" style={{ padding: 0, overflow: "auto" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th style={{ textAlign: "center" }}>Passed</th>
                    <th style={{ textAlign: "center" }}>Sessions</th>
                    <th style={{ textAlign: "center" }}>Time Spent</th>
                    <th style={{ textAlign: "center" }}>Last Active</th>
                    <th style={{ textAlign: "center", width: 130 }}>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.students.map((s) => {
                    const pct = s.labs_assigned > 0
                      ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                    return (
                      <tr
                        key={s.student_id}
                        style={{ cursor: "pointer" }}
                        onClick={() => nav(`/instructor/groups/${groupId}/students/${s.student_id}`)}
                      >
                        <td>
                          <div style={{ fontWeight: 500 }}>{s.email}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                            {[s.semester, s.study_program].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
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
                        <td style={{ textAlign: "center", fontSize: "0.82rem" }}>
                          <LastActiveBadge ts={s.last_active} />
                        </td>
                        <td style={{ textAlign: "center", width: 130 }}>
                          <ProgressBar pct={pct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 4. Lab Stats ── */}
        {progress?.labs?.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <h2>Lab Difficulty</h2>
            <div className="panel" style={{ padding: 0, overflow: "auto" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Lab</th>
                    <th style={{ textAlign: "center" }}>Passed</th>
                    <th style={{ textAlign: "center" }}>Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.labs.map((l) => (
                    <tr key={l.lab_id}>
                      <td style={{ fontWeight: 500 }}>{l.title}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: "0.88rem",
                          color: l.students_passed > 0 ? "var(--green)" : "var(--ink)",
                          fontWeight: 600,
                        }}>
                          {l.students_passed} / {progress.total_students}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--muted)" }}>
                        {l.avg_time_minutes > 0 ? `${l.avg_time_minutes} min` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
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
  return (
    <span style={{ fontSize: "0.82rem", color, fontWeight: 500 }}>{label}</span>
  );
}

function ProgressBar({ pct }) {
  const color = pct >= 80 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border-light)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)", color: "var(--muted)", minWidth: 32 }}>
        {pct}%
      </span>
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div className="panel" style={{ textAlign: "center", marginBottom: 0, padding: "0.75rem" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: color || "var(--tum-blue)" }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.1rem" }}>{label}</div>
    </div>
  );
}

function LabAssignmentCard({ labId, labTitle, deadline, busy, onSaveDeadline, onRemove }) {
  const [localDeadline, setLocalDeadline] = useState(toLocalInput(deadline));
  const hasChanged = localDeadline !== toLocalInput(deadline);
  const isSaving = busy === `deadline-${labId}`;
  const isRemoving = busy === `remove-${labId}`;

  return (
    <div className="panel" style={{ marginBottom: 0, opacity: isRemoving ? 0.5 : 1, transition: "opacity 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{labTitle}</span>
          <a
            href={`/instructor/labs/${labId}`}
            onClick={(e) => { e.preventDefault(); nav(`/instructor/labs/${labId}`); }}
            style={{ fontSize: "0.8rem" }}
          >
            View Lab
          </a>
        </div>
        <button
          className="btn btn-sm"
          disabled={!!busy}
          onClick={() => {
            const msg = "Remove this lab assignment? Students will lose access. Their past session data is preserved.";
            if (window.confirm(msg)) onRemove();
          }}
          style={{ color: "var(--red)", borderColor: "var(--red-border)" }}
        >
          {isRemoving ? "Removing..." : "Remove"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500, whiteSpace: "nowrap" }}>Deadline</label>
        <input
          type="datetime-local"
          value={localDeadline}
          onChange={(e) => setLocalDeadline(e.target.value)}
          style={{ fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", width: "auto", minWidth: 220 }}
        />
        {hasChanged && (
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => onSaveDeadline(localInputToISO(localDeadline))}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        )}
        {localDeadline && !hasChanged && (
          <button className="btn btn-sm" disabled={!!busy} onClick={() => { setLocalDeadline(""); onSaveDeadline(null); }} style={{ color: "var(--muted)" }}>
            {isSaving ? "Clearing..." : "Clear"}
          </button>
        )}
        {!localDeadline && !deadline && (
          <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontStyle: "italic" }}>No deadline</span>
        )}
      </div>
    </div>
  );
}
