import { useState, useEffect, useCallback, useMemo } from "react";
import type { User, GroupDetail, InstructorLabInfo, GroupProgress, ActivityEvent } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import ConfirmModal from "../components/ConfirmModal";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import Link from "../components/Link";
import StatCard from "../components/StatCard";
import DataChip from "../components/DataChip";
import ProgressRing from "../components/ProgressRing";
import DeadlinePicker from "../components/DeadlinePicker";
import IconButton from "../components/IconButton";
import { showToast } from "../components/Toast";
import { Users, MoreHorizontal, Pencil, Trash2, ExternalLink, Plus, AlertTriangle } from "lucide-react";
import { navigate } from "../utils/navigate";
import { fmtTime, timeAgo } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
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
} from "../api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface InstructorGroupDetailProps {
  user: User;
  groupId: number;
  section?: "labs" | "pending" | "activity";
  onLogout: () => void;
}

function initials(email: string): string {
  return (email || "?").charAt(0).toUpperCase();
}

function activityLabel(event: ActivityEvent): string {
  if (event.action !== "check") return outcomeStyle(event.action, event.reason).label;
  let label = "Automatic check";
  if (event.actor_type === "student") label = "Student check";
  else if (event.reason === "baseline") label = "Automatic baseline check";
  else if (event.reason === "final") label = "Automatic final check";
  else if (event.actor_type === "instructor") label = "Instructor check";
  return event.result === "error" ? `${label} failed` : label;
}

export default function InstructorGroupDetail({ user, groupId, section, onLogout }: InstructorGroupDetailProps) {
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
  const [renameSemester, setRenameSemester] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [activeConfirm, setActiveConfirm] = useState(false);

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
      showToast(deadline ? "Deadline saved" : "Deadline removed");
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
    if (!renameInput.trim()) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await renameGroup(groupId, renameInput.trim(), renameSemester.trim(), group?.is_active);
      setRenameOpen(false);
      await refresh();
      showToast("Group updated");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setRenaming(false); }
  }

  async function handleToggleActive(): Promise<void> {
    if (!group) return;
    setActiveConfirm(false);
    setTogglingActive(true);
    try {
      await renameGroup(groupId, group.name, group.semester ?? undefined, !group.is_active);
      await refresh();
      showToast(group.is_active ? "Group marked inactive" : "Group marked active");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setTogglingActive(false); }
  }

  const progressByLab = useMemo(() => {
    const m = new Map<string, GroupProgress["labs"][number]>();
    (progress?.labs || []).forEach((l) => m.set(l.lab_id, l));
    return m;
  }, [progress]);

  if (!group && !error) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-72 w-full" />
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
  const studentsChecked = (progress?.labs || []).reduce((total, lab) => total + (lab.students_checked || 0), 0);

  const hasPending = !!group && group.pending_members.length > 0;
  function renderLabCard(labId: string, deadline: string | null, overdue: boolean) {
    const meta = labs.find((l) => l.id === labId);
    const stats = progressByLab.get(labId);
    const totalStudents = progress?.total_students || 0;
    const pct = stats && totalStudents > 0 ? Math.round((stats.students_passed / totalStudents) * 100) : 0;

    return (
      <Card
        key={labId}
        className={cn("h-full py-4 transition-opacity", overdue && "bg-warning-bg/40 ring-warning/20")}
        style={{ opacity: busy === `remove-${labId}` ? 0.5 : 1 }}
      >
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-foreground">{meta?.title || <DataChip>{labId}</DataChip>}</div>
              {meta?.difficulty && <Badge variant="outline" className="mt-1">{meta.difficulty}</Badge>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton icon={ExternalLink} label="View lab guides" href={`/instructor/labs/${labId}`} />
              <IconButton icon={Trash2} label="Remove lab from group" danger disabled={!!busy} onClick={() => setRemoveConfirm(labId)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ProgressRing pct={pct} size={52} strokeWidth={5} />
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <div><strong className="text-foreground">{stats?.students_passed ?? 0}</strong> / {totalStudents} achieved</div>
              <div><strong className="text-foreground">{stats?.students_attempted ?? 0}</strong> started</div>
              <div>Median runtime <strong className="text-foreground">{stats?.median_recorded_minutes ? fmtTime(stats.median_recorded_minutes * 60) : "—"}</strong> <span className="text-xs">(n={stats?.runtime_samples || 0})</span></div>
            </div>
          </div>

          <div className="mt-auto">
            {overdue ? (
              <Badge className="border-transparent bg-warning-bg text-warning">
                Ended {deadline ? new Date(deadline).toLocaleDateString() : ""}
              </Badge>
            ) : (
              <DeadlinePicker
                deadline={deadline}
                busy={!!busy}
                saving={busy === `deadline-${labId}`}
                onSave={(iso) => handleUpdateDeadline(labId, iso)}
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout} groupContext={{ id: groupId, name: group?.name, hasPending }}>
      <PageHeader
        title={group?.name || "Group"}
        description={
          group ? (
            <span className="flex items-center gap-2">
              {group.semester && <Badge variant="outline">{group.semester}</Badge>}
              <Badge className={cn("border-transparent", group.is_active ? "bg-success-bg text-success" : "bg-muted text-muted-foreground")}>
                {group.is_active ? "Active" : "Inactive"}
              </Badge>
            </span>
          ) : undefined
        }
        breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: group?.name || "Group" }]}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/instructor/students?group=${groupId}`}>
                <Users /> Manage students
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Group actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="whitespace-nowrap">
                <DropdownMenuItem onSelect={() => { setRenameInput(group?.name || ""); setRenameSemester(group?.semester || ""); setRenameOpen(true); }}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={togglingActive} onSelect={() => setActiveConfirm(true)}>
                  {group?.is_active ? "Mark inactive" : "Mark active"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteConfirm(true)}>
                  <Trash2 /> Delete group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="min-w-0 space-y-8">
          {group && !section && (
            <div id="overview" className="grid scroll-mt-8 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label="Students"
                value={group.approved_members.length}
                description={group.pending_members.length > 0 ? `${group.pending_members.length} pending approval` : "All approved"}
              />
              <StatCard
                label="Assigned labs"
                value={`${group.labs.length} / ${labs.length}`}
                description="Available labs assigned to this group"
              />
              {progress && <>
              <StatCard
                label="Passed before"
                value={completionPct != null ? `${completionPct}%` : "—"}
                description={`${progress.total_passed} / ${progress.total_possible} assignments have passed`}
              />
              <StatCard
                icon={progress.total_at_risk > 0 ? AlertTriangle : undefined}
                label="Overdue incomplete"
                value={progress.total_at_risk}
                description="Overdue assignment, never passed"
                tone={progress.total_at_risk > 0 ? "danger" : "default"}
              />
              <StatCard
                label="Check submission coverage"
                value={`${studentsChecked} / ${progress.total_possible}`}
                description="Student-lab obligations with a student check"
              />
              </>}
            </div>
          )}

          <AlertError message={error} />

          {(!section || section === "labs") && (
          <section id="labs" className="scroll-mt-8">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Lab assignments</h2>

            {(activeLabs.length > 0 || pastLabs.length > 0) ? (
              <div className="mb-4 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeLabs.map((gl) => renderLabCard(gl.lab_id, gl.deadline ?? null, false))}
                {pastLabs.map((gl) => renderLabCard(gl.lab_id, gl.deadline ?? null, true))}
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No labs assigned. Assign labs below to get started.
              </div>
            )}

            {unassignedLabs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Available labs ({assignedLabIds.size} of {labs.length} assigned)
                  </div>
                  {unassignedLabs.length > 1 && (
                    <Button variant="outline" size="xs" disabled={bulkAssigning || !!busy} onClick={handleBulkAssign}>
                      {bulkAssigning ? "Assigning…" : "Assign all"}
                    </Button>
                  )}
                </div>
                <Card className="gap-0 divide-y divide-border py-0">
                  {unassignedLabs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{l.title}</span>
                        {l.difficulty && <Badge variant="outline">{l.difficulty}</Badge>}
                      </div>
                      <IconButton icon={Plus} label={`Assign ${l.title}`} disabled={!!busy || bulkAssigning} onClick={() => handleAssignLab(l.id)} />
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </section>
          )}

          {(!section || section === "pending") && hasPending && (
            <section id="pending" className="scroll-mt-8">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Pending approvals</h2>
              <div className="mb-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selected.size === group!.pending_members.length ? "Deselect all" : "Select all"}
                </Button>
                <Button size="sm" disabled={selected.size === 0 || actionLoading} onClick={handleApprove}>
                  Approve ({selected.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selected.size === 0 || actionLoading}
                  onClick={handleReject}
                  className="border-destructive/30 text-destructive hover:bg-destructive-bg"
                >
                  Reject
                </Button>
              </div>
              <Card className="gap-0 divide-y divide-border py-0">
                {group!.pending_members.map((m) => (
                  <div key={m.user_id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-accent/40" onClick={() => toggleSelect(m.user_id)}>
                    <Checkbox aria-label={`Select ${m.email}`} checked={selected.has(m.user_id)} onCheckedChange={() => toggleSelect(m.user_id)} onClick={(e) => e.stopPropagation()} />
                    <Avatar size="sm"><AvatarFallback className="bg-accent text-primary">{initials(m.email)}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{m.email}</div>
                      <div className="text-xs text-muted-foreground">{[m.semester, m.study_program].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.requested_at ? `Requested ${timeAgo(m.requested_at)}` : ""}</div>
                  </div>
                ))}
              </Card>
            </section>
          )}
          {section === "pending" && !hasPending && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No pending approvals in this group.
            </div>
          )}

          {(!section || section === "activity") && (
          <section id="activity" className="scroll-mt-8">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Recent activity</h2>
            <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
              Activity lists every check attempt. Student and session counters include saved checker results, so a failed attempt can appear here without increasing those counts.
            </p>
            {group?.recent_activity && group.recent_activity.length > 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2">
                  {group.recent_activity.map((ev, i) => {
                    const style = outcomeStyle(ev.action, ev.reason);
                    return (
                      <div key={i} className="flex flex-col gap-2 border-b border-border py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-foreground">
                          <span className="font-medium">{ev.student_email || ev.student_id}</span>
                          <DataChip>{ev.student_id}</DataChip>
                          <Badge className={ev.result === "error" ? "border-transparent bg-destructive-bg text-destructive" : style.badgeClass}>{activityLabel(ev)}</Badge>
                          <span className="truncate text-muted-foreground">{ev.lab_title}</span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(ev.timestamp)}</span>
                      </div>
                    );
                  })}
                </CardContent>
                <div className="border-t border-border px-4 pt-3 text-xs text-muted-foreground">
                  Open a student session to review synchronized checker and command history.
                </div>
              </Card>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No recent activity in this group.
              </div>
            )}
          </section>
          )}
      </div>

      <ConfirmModal
        open={activeConfirm}
        title={group?.is_active ? "Mark group inactive?" : "Mark group active?"}
        message={
          group?.is_active
            ? "Students will no longer be able to enroll or start, reset, or check assigned labs. Existing runtimes can still be stopped or ended, and historical results remain available."
            : "Students will be able to enroll in this group and start assigned labs that are still within their deadlines."
        }
        confirmLabel={group?.is_active ? "Mark inactive" : "Mark active"}
        confirmDanger={group?.is_active}
        onConfirm={handleToggleActive}
        onCancel={() => setActiveConfirm(false)}
      />

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
        confirmLabel={deleting ? "Deleting…" : "Delete group"}
        confirmDanger
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmModal
        open={renameOpen}
        title="Rename group"
        confirmLabel={renaming ? "Renaming…" : "Rename"}
        onConfirm={handleRename}
        onCancel={() => setRenameOpen(false)}
      >
        <Input
          type="text"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(); } }}
          autoFocus
          placeholder="New group name"
          className="mb-3"
        />
        <Input
          type="text"
          value={renameSemester}
          onChange={(e) => setRenameSemester(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(); } }}
          placeholder="Semester, e.g. WS 2026/27"
        />
      </ConfirmModal>
    </InstructorLayout>
  );
}
