import { useState, useEffect, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Header from "../components/Header.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { showToast } from "../components/Toast.jsx";
import {
  getGroupDetail,
  getInstructorLabs,
  getGroupProgress,
  approveMembers,
  rejectMembers,
  assignGroupLabWithDeadline,
  unassignGroupLab,
  deleteGroup,
  renameGroup,
  getGroupExportCsvUrl,
} from "../api.js";

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

export default function InstructorGroupDetail({ user, groupId, onLogout }) {
  const [group, setGroup] = useState(null);
  const [labs, setLabs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renaming, setRenaming] = useState(false);

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

  async function handleBulkAssign() {
    const assignedLabIds = new Set((group?.labs || []).map((l) => l.lab_id));
    const toAssign = labs.filter((l) => !assignedLabIds.has(l.id));
    if (toAssign.length === 0) return;
    setBulkAssigning(true);
    setError(null);
    try {
      for (const l of toAssign) {
        await assignGroupLabWithDeadline(groupId, l.id, null);
      }
      await refresh();
      showToast(`Assigned ${toAssign.length} lab${toAssign.length !== 1 ? "s" : ""}`);
    } catch (err) { setError(err.message); }
    finally { setBulkAssigning(false); }
  }

  async function handleUpdateDeadline(labId, deadline) {
    setBusy(`deadline-${labId}`);
    setError(null);
    try {
      await assignGroupLabWithDeadline(groupId, labId, deadline || null);
      await refresh();
      showToast("Deadline saved");
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function handleUnassignLab(labId) {
    setBusy(`remove-${labId}`);
    setRemoveConfirm(null);
    setError(null);
    try {
      await unassignGroupLab(groupId, labId);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteConfirm(false);
    try {
      await deleteGroup(groupId);
      nav("/instructor");
    } catch (err) { setError(err.message); }
    finally { setDeleting(false); }
  }

  async function handleRename() {
    if (!renameInput.trim() || renameInput.trim() === group?.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await renameGroup(groupId, renameInput.trim());
      setRenameOpen(false);
      await refresh();
      showToast("Group renamed");
    } catch (err) { setError(err.message); }
    finally { setRenaming(false); }
  }

  if (!group && !error) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 300 }} />
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

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <h1 style={{ margin: 0 }}>{group?.name || "Group"}</h1>
          <button
            className="btn btn-sm"
            style={{ fontSize: "0.78rem", height: 28 }}
            onClick={() => { setRenameInput(group?.name || ""); setRenameOpen(true); }}
          >
            Rename
          </button>
          <button
            className="btn btn-sm"
            style={{ color: "var(--red)", borderColor: "var(--red-border)", fontSize: "0.78rem", height: 28 }}
            disabled={deleting}
            onClick={() => setDeleteConfirm(true)}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>

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
                  onRemove={() => setRemoveConfirm(gl.lab_id)}
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
                        <span className="badge" style={{ backgroundColor: "var(--red-bg)", color: "var(--red)", border: "1px solid var(--red-border)" }}>
                          Ended {new Date(gl.deadline).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="btn btn-sm"
                        disabled={!!busy}
                        onClick={() => setRemoveConfirm(gl.lab_id)}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink-secondary)" }}>
                  Available Labs ({assignedLabIds.size} of {labs.length} assigned)
                </div>
                {unassignedLabs.length > 1 && (
                  <button
                    className="btn btn-sm"
                    disabled={bulkAssigning || !!busy}
                    onClick={handleBulkAssign}
                    style={{ fontSize: "0.78rem", height: 26 }}
                  >
                    {bulkAssigning ? "Assigning..." : `Assign All`}
                  </button>
                )}
              </div>
              <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                {unassignedLabs.map((l, i) => (
                  <div
                    key={l.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0.5rem 0.75rem",
                      borderBottom: i < unassignedLabs.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 500, fontSize: "0.88rem" }}>{l.title}</span>
                      {l.difficulty && <span className="badge">{l.difficulty}</span>}
                    </div>
                    <button
                      className="btn btn-sm"
                      disabled={!!busy || bulkAssigning}
                      onClick={() => handleAssignLab(l.id)}
                      style={{ fontSize: "0.78rem", height: 26, padding: "0 0.5rem", flexShrink: 0 }}
                    >
                      {busy === `assign-${l.id}` ? "..." : "+ Assign"}
                    </button>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", gap: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>Student Results</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {progress && progress.students.length > 0 && (
                <>
                  <a
                    href={`/instructor/students?group=${groupId}`}
                    className="btn btn-sm"
                    onClick={(e) => { e.preventDefault(); nav(`/instructor/students?group=${groupId}`); }}
                  >
                    Manage Students
                  </a>
                  <a
                    href={getGroupExportCsvUrl(groupId)}
                    className="btn btn-sm"
                    download
                  >
                    Export CSV
                  </a>
                </>
              )}
            </div>
          </div>
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
                        {l.avg_time_minutes > 0 ? fmtTime(l.avg_time_minutes * 60) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <ConfirmModal
        open={!!removeConfirm}
        title="Remove lab assignment?"
        message="Students will lose access to this lab. Their past session data is preserved."
        confirmLabel="Remove"
        confirmDanger
        onConfirm={() => handleUnassignLab(removeConfirm)}
        onCancel={() => setRemoveConfirm(null)}
      />

      <ConfirmModal
        open={deleteConfirm}
        title={`Delete "${group?.name}"?`}
        message={`This removes ${group?.approved_members?.length || 0} student${(group?.approved_members?.length || 0) !== 1 ? "s" : ""} and ${group?.labs?.length || 0} lab assignment${(group?.labs?.length || 0) !== 1 ? "s" : ""}. This cannot be undone.`}
        confirmLabel="Delete Group"
        confirmDanger
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmModal
        open={renameOpen}
        title="Rename group"
        confirmLabel={renaming ? "Renaming..." : "Rename"}
        onConfirm={handleRename}
        onCancel={() => setRenameOpen(false)}
      >
        <input
          type="text"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(); } }}
          autoFocus
          placeholder="New group name"
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />
      </ConfirmModal>

    </>
  );
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
        flex: 1, height: 6, borderRadius: 3, overflow: "hidden",
        background: "var(--border-light)",
        border: pct === 0 ? "1px solid var(--border)" : "none",
      }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.2s" }} />
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
  const parsed = deadline ? new Date(deadline) : null;
  const [localDate, setLocalDate] = useState(parsed && !isNaN(parsed.getTime()) ? parsed : null);
  const origDate = parsed && !isNaN(parsed.getTime()) ? parsed : null;
  const hasChanged = (localDate?.getTime() || 0) !== (origDate?.getTime() || 0);
  const isSaving = busy === `deadline-${labId}`;
  const isRemoving = busy === `remove-${labId}`;
  const isOverdue = origDate && origDate < new Date();

  function saveDate() {
    onSaveDeadline(localDate ? localDate.toISOString().replace("Z", "+00:00") : null);
  }

  return (
    <div className="panel" style={{ marginBottom: 0, padding: "0.6rem 0.75rem", opacity: isRemoving ? 0.5 : 1, transition: "opacity 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{labTitle}</span>
          <a
            href={`/instructor/labs/${labId}`}
            onClick={(e) => { e.preventDefault(); nav(`/instructor/labs/${labId}`); }}
            style={{ fontSize: "0.78rem", flexShrink: 0 }}
          >
            View
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <span style={{ fontSize: "0.78rem", color: isOverdue ? "var(--red)" : "var(--muted)", fontWeight: 500 }}>Due</span>
          <DatePicker
            selected={localDate}
            onChange={setLocalDate}
            showTimeSelect
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat="MMM d, HH:mm"
            placeholderText="None"
            isClearable
            className="datepicker-input datepicker-compact"
            popperPlacement="bottom-end"
          />
          {hasChanged && (
            <button className="btn btn-primary btn-sm" style={{ height: 26, fontSize: "0.75rem", padding: "0 0.4rem" }} disabled={!!busy} onClick={saveDate}>
              {isSaving ? "..." : "Save"}
            </button>
          )}
          <button
            className="btn btn-sm"
            disabled={!!busy}
            onClick={onRemove}
            style={{ color: "var(--red)", borderColor: "var(--red-border)", height: 26, fontSize: "0.75rem", padding: "0 0.4rem" }}
          >
            {isRemoving ? "..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
