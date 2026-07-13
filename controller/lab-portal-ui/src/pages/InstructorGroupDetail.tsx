import { useState, useEffect, useCallback, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { User, GroupDetail, InstructorLabInfo, GroupProgress } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import ConfirmModal from "../components/ConfirmModal";
import AlertError from "../components/AlertError";
import ProgressRing from "../components/ProgressRing";
import LastActiveBadge from "../components/LastActiveBadge";
import DeadlinePicker from "../components/DeadlinePicker";
import IconButton from "../components/IconButton";
import LabPassRateChart from "../components/LabPassRateChart";
import Link from "../components/Link";
import Breadcrumbs from "../components/Breadcrumbs";
import { showToast } from "../components/Toast";
import { Users, Layers, MoreHorizontal, Pencil, Trash2, ExternalLink, Plus, Terminal } from "lucide-react";
import { navigate } from "../utils/navigate";
import { fmtTime, timeAgo } from "../utils/time";
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

function initials(email: string): string {
  return (email || "?").charAt(0).toUpperCase();
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

  const progressByLab = useMemo(() => {
    const m = new Map<string, GroupProgress["labs"][number]>();
    (progress?.labs || []).forEach((l) => m.set(l.lab_id, l));
    return m;
  }, [progress]);

  if (!group && !error) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </InstructorLayout>
    );
  }

  const now = new Date();
  const assignedLabIds = new Set((group?.labs || []).map((l) => l.lab_id));
  const unassignedLabs = labs.filter((l) => !assignedLabIds.has(l.id));
  const activeLabs = (group?.labs || []).filter((gl) => !gl.deadline || new Date(gl.deadline) >= now);
  const pastLabs = (group?.labs || []).filter((gl) => gl.deadline && new Date(gl.deadline) < now);

  const completionPct = progress && progress.total_possible > 0
    ? Math.round((progress.total_passed / progress.total_possible) * 100)
    : null;
  const attemptedLabTimes = (progress?.labs || []).filter((l) => l.students_attempted > 0);
  const avgTimeMinutes = attemptedLabTimes.length > 0
    ? attemptedLabTimes.reduce((acc, l) => acc + l.avg_time_minutes, 0) / attemptedLabTimes.length
    : null;

  function renderLabCard(labId: string, deadline: string | null, overdue: boolean) {
    const meta = labs.find((l) => l.id === labId);
    const stats = progressByLab.get(labId);
    const totalStudents = progress?.total_students || 0;
    const pct = stats && totalStudents > 0 ? Math.round((stats.students_passed / totalStudents) * 100) : 0;

    return (
      <div key={labId} className={`lab-perf-card${overdue ? " lab-perf-card-overdue" : ""}`} style={{ opacity: busy === `remove-${labId}` ? 0.5 : 1 }}>
        <div className="lab-perf-card-header">
          <div>
            <div className="lab-perf-card-title">{meta?.title || labId}</div>
            {meta?.difficulty && <span className="badge" style={{ marginTop: 4 }}>{meta.difficulty}</span>}
          </div>
          <div className="lab-perf-card-actions">
            <IconButton icon={ExternalLink} label="View lab guides" href={`/instructor/labs/${labId}`} />
            <IconButton icon={Trash2} label="Remove lab from group" danger disabled={!!busy} onClick={() => setRemoveConfirm(labId)} />
          </div>
        </div>

        <div className="lab-perf-card-stats">
          <ProgressRing pct={pct} size={52} strokeWidth={5} />
          <div className="lab-perf-card-metrics">
            <div><strong>{stats?.students_passed ?? 0}</strong> / {totalStudents} passed</div>
            <div><strong>{stats?.students_attempted ?? 0}</strong> attempted</div>
            <div>Avg <strong>{stats && stats.avg_time_minutes > 0 ? fmtTime(stats.avg_time_minutes * 60) : "—"}</strong></div>
          </div>
        </div>

        <div className="lab-perf-card-footer">
          {overdue ? (
            <span className="badge badge-danger-subtle">Ended {deadline ? new Date(deadline).toLocaleDateString() : ""}</span>
          ) : (
            <DeadlinePicker
              deadline={deadline}
              busy={!!busy}
              saving={busy === `deadline-${labId}`}
              onSave={(iso) => handleUpdateDeadline(labId, iso)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: group?.name || "Group" },
        ]} />

        <div className="page-title-row-v2">
          <div>
            <h1>{group?.name || "Group"}</h1>
            <div className="page-title-meta">
              <span className="chip"><Users size={13} /> {progress?.total_students ?? 0} student{progress?.total_students !== 1 ? "s" : ""}</span>
              <span className="chip"><Layers size={13} /> {progress?.total_labs ?? 0} lab{progress?.total_labs !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="icon-btn" style={{ border: "1px solid var(--border)" }} title="Group actions" aria-label="Group actions">
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content" align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => { setRenameInput(group?.name || ""); setRenameOpen(true); }}
                >
                  <Pencil size={15} /> Rename group
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="dropdown-menu-separator" />
                <DropdownMenu.Item
                  className="dropdown-menu-item dropdown-menu-item-danger"
                  onSelect={() => setDeleteConfirm(true)}
                >
                  <Trash2 size={15} /> Delete group
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {progress && (
          <div className="insight-grid mb-lg">
            <div className="insight-tile">
              <div className="insight-tile-value">{completionPct != null ? `${completionPct}%` : "—"}</div>
              <div className="insight-tile-label">Completion ({progress.total_passed} / {progress.total_possible} assignments)</div>
            </div>
            <div className={`insight-tile${progress.total_at_risk > 0 ? " insight-tile-attention" : ""}`}>
              <div className="insight-tile-value">{progress.total_at_risk}</div>
              <div className="insight-tile-label">At risk (overdue lab, not passed)</div>
            </div>
            <div className="insight-tile">
              <div className="insight-tile-value">{avgTimeMinutes != null ? fmtTime(avgTimeMinutes * 60) : "—"}</div>
              <div className="insight-tile-label">Avg session time</div>
            </div>
          </div>
        )}

        <AlertError message={error} />

        {/* -- 1. Lab Assignments -- */}
        <section className="section-block">
          <h2>Lab Assignments</h2>

          {(activeLabs.length > 0 || pastLabs.length > 0) ? (
            <div className="lab-perf-grid">
              {activeLabs.map((gl) => renderLabCard(gl.lab_id, gl.deadline ?? null, false))}
              {pastLabs.map((gl) => renderLabCard(gl.lab_id, gl.deadline ?? null, true))}
            </div>
          ) : (
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
                    className="lab-available-row"
                    style={{
                      borderBottom: i < unassignedLabs.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}
                  >
                    <div className="lab-assignment-info">
                      <span style={{ fontWeight: 500, fontSize: "0.88rem" }}>{l.title}</span>
                      {l.difficulty && <span className="badge">{l.difficulty}</span>}
                    </div>
                    <IconButton icon={Plus} label={`Assign ${l.title}`} disabled={!!busy || bulkAssigning} onClick={() => handleAssignLab(l.id)} />
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
            <div className="panel" style={{ padding: "0.5rem" }}>
              {group.pending_members.map((m) => (
                <div key={m.user_id} className="student-row-card" style={{ cursor: "default" }} onClick={() => toggleSelect(m.user_id)}>
                  <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggleSelect(m.user_id)} onClick={(e) => e.stopPropagation()} />
                  <div className="avatar-circle">{initials(m.email)}</div>
                  <div className="student-row-identity">
                    <div className="student-row-email">{m.email}</div>
                    <div className="student-row-meta">{[m.semester, m.study_program].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="text-sm-muted">
                    {m.requested_at ? `Requested ${timeAgo(m.requested_at)}` : ""}
                  </div>
                </div>
              ))}
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
                  <a href={getGroupExportCsvUrl(groupId)} className="btn btn-sm" download>
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
            <div className="panel student-row-list" style={{ padding: "0.5rem" }}>
              {progress.students.map((s) => {
                const pct = s.labs_assigned > 0 ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                return (
                  <div
                    key={s.student_id}
                    className="student-row-card"
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/instructor/groups/${groupId}/students/${s.student_id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/instructor/groups/${groupId}/students/${s.student_id}`); } }}
                  >
                    <div className="avatar-circle">{initials(s.email)}</div>
                    <div className="student-row-identity">
                      <div className="flex-center gap-sm">
                        <span className="student-row-email">{s.email}</span>
                        {s.at_risk && <span className="badge badge-danger">At risk</span>}
                      </div>
                      <div className="student-row-meta">{[s.semester, s.study_program].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="student-row-metrics">
                      <div className="student-row-metric">
                        <div className="student-row-metric-value">{s.total_sessions}</div>
                        <div className="student-row-metric-label">Sessions</div>
                      </div>
                      <div className="student-row-metric">
                        <div className="student-row-metric-value">{fmtTime(s.total_time_seconds)}</div>
                        <div className="student-row-metric-label">Time</div>
                      </div>
                      <div className="student-row-metric">
                        <LastActiveBadge ts={s.last_active} />
                        <div className="student-row-metric-label">Active</div>
                      </div>
                      <ProgressRing pct={pct} size={44} strokeWidth={4} label={`${s.labs_passed}/${s.labs_assigned}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* -- 4. Lab pass rates chart -- */}
        {progress?.labs && progress.labs.length > 0 && (
          <section className="section-block">
            <h2>Lab Pass Rates</h2>
            <LabPassRateChart labs={progress.labs} totalStudents={progress.total_students} />
          </section>
        )}

        {/* -- 5. Recent Activity -- */}
        <section className="section-block">
          <h2>Recent Activity</h2>
          {group?.recent_activity && group.recent_activity.length > 0 ? (
            <div className="panel">
              <div className="timeline">
                {group.recent_activity.map((ev, i) => (
                  <div key={i} className="timeline-row">
                    <span className="timeline-text">
                      <strong className="text-mono-data" style={{ fontSize: "0.78rem" }}>{ev.student_id}</strong>
                      {" "}{ev.action}{" "}{ev.lab_title}
                    </span>
                    <span className="timeline-time">{timeAgo(ev.timestamp)}</span>
                  </div>
                ))}
              </div>
              <div className="timeline-hint">
                <Terminal size={13} />
                For the full command/session audit log, a platform operator can run <code>labctl status &lt;lab&gt; &lt;student&gt;</code> on the lab worker.
              </div>
            </div>
          ) : (
            <div className="panel text-center" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              No recent activity in this group.
            </div>
          )}
        </section>
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
    </InstructorLayout>
  );
}
