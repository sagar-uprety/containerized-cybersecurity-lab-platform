import { useState, useEffect, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import type { User, GroupDetail, InstructorLabInfo, GroupProgress } from "../types";
import Header from "../components/Header";
import ConfirmModal from "../components/ConfirmModal";
import AlertError from "../components/AlertError";
import StatCard from "../components/StatCard";
import ProgressBar from "../components/ProgressBar";
import LastActiveBadge from "../components/LastActiveBadge";
import Link from "../components/Link";
import Breadcrumbs from "../components/Breadcrumbs";
import { showToast } from "../components/Toast";
import { navigate } from "../utils/navigate";
import { fmtTime } from "../utils/time";
import { useDocumentTitle } from "../utils/useDocumentTitle";
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
} from "../api";

interface InstructorGroupDetailProps {
  user: User;
  groupId: number;
  onLogout: () => void;
}

export default function InstructorGroupDetail({ user, groupId, onLogout }: InstructorGroupDetailProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [labs, setLabs] = useState<InstructorLabInfo[]>([]);
  const [progress, setProgress] = useState<GroupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renaming, setRenaming] = useState(false);

  useDocumentTitle(group?.name ?? "Group");

  const refresh = useCallback(async () => {
    try {
      const [g, l] = await Promise.all([
        getGroupDetail(groupId),
        getInstructorLabs(),
      ]);
      setGroup(g);
      setLabs(l.map((x: InstructorLabInfo) => ({ id: x.id, title: x.title, difficulty: x.difficulty })));
      setSelected(new Set());
      getGroupProgress(groupId).then(setProgress).catch(() => {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSelect(userId: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  function selectAll(): void {
    if (!group) return;
    const allIds = group.pending_members.map((m) => m.user_id);
    setSelected((prev) => prev.size === allIds.length ? new Set() : new Set(allIds));
  }

  async function handleApprove(): Promise<void> {
    if (!group || selected.size === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      await approveMembers(groupId, [...selected], group.csrf_token);
      await refresh();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setActionLoading(false); }
  }

  async function handleReject(): Promise<void> {
    if (!group || selected.size === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      await rejectMembers(groupId, [...selected], group.csrf_token);
      await refresh();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setActionLoading(false); }
  }

  async function handleAssignLab(labId: string): Promise<void> {
    setBusy(`assign-${labId}`);
    setError(null);
    try {
      await assignGroupLabWithDeadline(groupId, labId, null);
      await refresh();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  async function handleBulkAssign(): Promise<void> {
    const assignedLabIds = new Set((group?.labs || []).map((l) => l.lab_id));
    const toAssign = labs.filter((l) => !assignedLabIds.has(l.id));
    if (toAssign.length === 0) return;
    setBulkAssigning(true);
    setError(null);
    try {
      await Promise.all(toAssign.map((l) => assignGroupLabWithDeadline(groupId, l.id, null)));
      await refresh();
      showToast(`Assigned ${toAssign.length} lab${toAssign.length !== 1 ? "s" : ""}`);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBulkAssigning(false); }
  }

  async function handleUpdateDeadline(labId: string, deadline: string | null): Promise<void> {
    setBusy(`deadline-${labId}`);
    setError(null);
    try {
      await assignGroupLabWithDeadline(groupId, labId, deadline || null);
      await refresh();
      showToast("Deadline saved");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  async function handleUnassignLab(labId: string): Promise<void> {
    setBusy(`remove-${labId}`);
    setRemoveConfirm(null);
    setError(null);
    try {
      await unassignGroupLab(groupId, labId);
      await refresh();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setDeleteConfirm(false);
    try {
      await deleteGroup(groupId);
      navigate("/instructor");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setDeleting(false); }
  }

  async function handleRename(): Promise<void> {
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
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
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
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: group?.name || "Group" },
        ]} />

        <div className="page-title-row">
          <h1 className="mb-0">{group?.name || "Group"}</h1>
          <button
            className="btn btn-sm"
            style={{ fontSize: "0.78rem", height: 28 }}
            onClick={() => { setRenameInput(group?.name || ""); setRenameOpen(true); }}
          >
            Rename
          </button>
          <button
            className="btn btn-sm btn-danger-outline"
            disabled={deleting}
            onClick={() => setDeleteConfirm(true)}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>

        {progress && (
          <div className="stat-grid stat-grid-3 mb-lg">
            <StatCard value={progress.total_students} label="Students" />
            <StatCard value={progress.total_labs} label="Labs" />
            <StatCard
              value={`${progress.total_passed} / ${progress.total_possible}`}
              label="Completed"
              color={progress.total_passed > 0 ? "var(--green)" : "var(--tum-blue)"}
            />
          </div>
        )}

        <AlertError message={error} />

        {/* -- 1. Lab Assignments -- */}
        <section className="section-block">
          <h2>Lab Assignments</h2>

          {activeLabs.length > 0 && (
            <div className="lab-assignment-list">
              {activeLabs.map((gl) => (
                <LabAssignmentCard
                  key={gl.lab_id}
                  labId={gl.lab_id}
                  labTitle={labs.find((l) => l.id === gl.lab_id)?.title || gl.lab_id}
                  deadline={gl.deadline ?? null}
                  busy={busy}
                  onSaveDeadline={(d) => handleUpdateDeadline(gl.lab_id, d)}
                  onRemove={() => setRemoveConfirm(gl.lab_id)}
                />
              ))}
            </div>
          )}

          {pastLabs.length > 0 && (
            <>
              <div className="section-label mb-sm" style={{ marginTop: "var(--sp-4)" }}>
                Past Deadline
              </div>
              <div className="lab-assignment-list lab-assignment-list--past">
                {pastLabs.map((gl) => (
                  <div key={gl.lab_id} className="panel" style={{ marginBottom: 0, padding: "0.75rem 1rem" }}>
                    <div className="lab-assignment-row">
                      <div className="lab-assignment-info">
                        <span className="lab-assignment-title">
                          {labs.find((l) => l.id === gl.lab_id)?.title || gl.lab_id}
                        </span>
                        <span className="badge badge-danger-subtle">
                          Ended {new Date(gl.deadline!).toLocaleDateString()}
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
            <div className="panel mb-md text-center" style={{ color: "var(--muted)" }}>
              No labs assigned. Assign labs below to get started.
            </div>
          )}

          {unassignedLabs.length > 0 && (
            <div>
              <div className="lab-assignment-row mb-sm">
                <div className="section-label">
                  Available Labs ({assignedLabIds.size} of {labs.length} assigned)
                </div>
                {unassignedLabs.length > 1 && (
                  <button
                    className="btn btn-sm"
                    disabled={bulkAssigning || !!busy}
                    onClick={handleBulkAssign}
                    style={{ fontSize: "0.78rem", height: 26 }}
                  >
                    {bulkAssigning ? "Assigning..." : "Assign All"}
                  </button>
                )}
              </div>
              <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                {unassignedLabs.map((l, i) => (
                  <div
                    key={l.id}
                    className="available-lab-row"
                    style={{
                      borderBottom: i < unassignedLabs.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}
                  >
                    <div className="lab-assignment-info">
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

        {/* -- 2. Pending Approvals -- */}
        {group && group.pending_members.length > 0 && (
          <section className="section-block">
            <h2>Pending Approvals</h2>
            <div className="toolbar" style={{ paddingTop: 0 }}>
              <button className="btn btn-sm" onClick={selectAll}>
                {selected.size === group.pending_members.length ? "Deselect All" : "Select All"}
              </button>
              <button className="btn btn-primary btn-sm" disabled={selected.size === 0 || actionLoading} onClick={handleApprove}>
                Approve ({selected.size})
              </button>
              <button className="btn btn-sm btn-danger-outline" disabled={selected.size === 0 || actionLoading} onClick={handleReject}>
                Reject
              </button>
            </div>
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: 40 }}>
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
                      <td className="text-center">
                        <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggleSelect(m.user_id)} />
                      </td>
                      <td style={{ fontWeight: 500 }}>{m.email}</td>
                      <td>{m.semester || "—"}</td>
                      <td>{m.study_program || "—"}</td>
                      <td className="text-sm-muted">
                        {m.requested_at ? new Date(m.requested_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* -- 3. Student Results -- */}
        <section className="section-block">
          <div className="section-header-row">
            <h2 className="mb-0">Student Results</h2>
            <div className="flex-center gap-sm">
              {progress && progress.students.length > 0 && (
                <>
                  <Link href={`/instructor/students?group=${groupId}`} className="btn btn-sm">
                    Manage Students
                  </Link>
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
          {!progress && group && group.approved_members.length > 0 && (
            <div className="panel text-center" style={{ color: "var(--muted)" }}>Loading results...</div>
          )}
          {progress && progress.students.length === 0 && (
            <div className="panel text-center" style={{ color: "var(--muted)" }}>No students enrolled yet.</div>
          )}
          {progress && progress.students.length > 0 && (
            <div className="panel" style={{ padding: 0, overflow: "auto" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="text-center">Passed</th>
                    <th className="text-center">Sessions</th>
                    <th className="text-center">Time Spent</th>
                    <th className="text-center">Last Active</th>
                    <th className="text-center" style={{ width: 130 }}>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.students.map((s) => {
                    const pct = s.labs_assigned > 0
                      ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                    const rowHref = `/instructor/groups/${groupId}/students/${s.student_id}`;
                    return (
                      <tr
                        key={s.student_id}
                        className="clickable-row"
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(rowHref)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(rowHref); } }}
                      >
                        <td>
                          <div style={{ fontWeight: 500 }}>{s.email}</div>
                          <div className="text-sm-muted">
                            {[s.semester, s.study_program].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td className="text-center">
                          <span className="mono-value" style={{
                            color: s.labs_passed > 0 ? "var(--green)" : "var(--ink)",
                          }}>
                            {s.labs_passed} / {s.labs_assigned}
                          </span>
                        </td>
                        <td className="mono-cell text-center text-sm-muted">
                          {s.total_sessions}
                        </td>
                        <td className="mono-cell text-center text-sm-muted">
                          {fmtTime(s.total_time_seconds)}
                        </td>
                        <td className="text-center text-sm-muted">
                          <LastActiveBadge ts={s.last_active} />
                        </td>
                        <td className="text-center" style={{ width: 130 }}>
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

        {/* -- 4. Lab Stats -- */}
        {progress?.labs && progress.labs.length > 0 && (
          <section className="section-block">
            <h2>Lab Difficulty</h2>
            <div className="panel" style={{ padding: 0, overflow: "auto" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Lab</th>
                    <th className="text-center">Passed</th>
                    <th className="text-center">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.labs.map((l) => (
                    <tr key={l.lab_id}>
                      <td style={{ fontWeight: 500 }}>{l.title}</td>
                      <td className="text-center">
                        <span className="mono-value" style={{
                          color: l.students_passed > 0 ? "var(--green)" : "var(--ink)",
                        }}>
                          {l.students_passed} / {progress.total_students}
                        </span>
                      </td>
                      <td className="mono-cell text-center text-sm-muted">
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
        onConfirm={() => handleUnassignLab(removeConfirm!)}
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

/* -- Sub-components -- */

interface LabAssignmentCardProps {
  labId: string;
  labTitle: string;
  deadline: string | null;
  busy: string | null;
  onSaveDeadline: (d: string | null) => void;
  onRemove: () => void;
}

function LabAssignmentCard({ labId, labTitle, deadline, busy, onSaveDeadline, onRemove }: LabAssignmentCardProps) {
  const parsed = deadline ? new Date(deadline) : null;
  const origDate = parsed && !isNaN(parsed.getTime()) ? parsed : null;
  const [localDate, setLocalDate] = useState<Date | null>(origDate);
  const isSaving = busy === `deadline-${labId}`;
  const isRemoving = busy === `remove-${labId}`;
  const isOverdue = origDate && origDate < new Date();

  // Sync when the prop changes externally (e.g. after save + refresh)
  useEffect(() => {
    const next = deadline ? new Date(deadline) : null;
    setLocalDate(next && !isNaN(next.getTime()) ? next : null);
  }, [deadline]);

  const hasChanged = (localDate?.getTime() || 0) !== (origDate?.getTime() || 0);

  function saveDate(): void {
    onSaveDeadline(localDate ? localDate.toISOString().replace("Z", "+00:00") : null);
  }

  return (
    <div className="panel lab-assignment-card" style={{ opacity: isRemoving ? 0.5 : 1 }}>
      <div className="lab-assignment-row">
        <div className="lab-assignment-info" style={{ flex: 1 }}>
          <span className="lab-assignment-title">{labTitle}</span>
          <Link href={`/instructor/labs/${labId}`} style={{ fontSize: "0.78rem", flexShrink: 0 }}>
            View
          </Link>
        </div>
        <div className="lab-assignment-controls">
          <span className="text-xs" style={{ color: isOverdue ? "var(--red)" : "var(--muted)", fontWeight: 500 }}>Due</span>
          <DatePicker
            selected={localDate}
            onChange={(date: Date | null) => setLocalDate(date)}
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
            className="btn btn-sm btn-danger-outline"
            style={{ height: 26, fontSize: "0.75rem", padding: "0 0.4rem" }}
            disabled={!!busy}
            onClick={onRemove}
          >
            {isRemoving ? "..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
