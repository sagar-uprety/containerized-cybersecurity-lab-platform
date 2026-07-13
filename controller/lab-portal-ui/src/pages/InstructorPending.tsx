import { useState, useEffect, useCallback } from "react";
import type { User, Group, GroupDetail } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import Breadcrumbs from "../components/Breadcrumbs";
import { showToast } from "../components/Toast";
import { getGroups, getGroupDetail, approveMembers, rejectMembers } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { timeAgo } from "../utils/time";

interface Props {
  user: User;
  onLogout: () => void;
}

interface PendingRow {
  user_id: number;
  email: string;
  semester?: string;
  study_program?: string;
  requested_at?: string;
  groupId: number;
  groupName: string;
}

function initials(email: string): string {
  return (email || "?").charAt(0).toUpperCase();
}

export default function InstructorPending({ user, onLogout }: Props) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [pendingByGroup, setPendingByGroup] = useState<Record<number, GroupDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  useDocumentTitle("Pending Approvals");

  const refresh = useCallback(async () => {
    try {
      const gs = await getGroups();
      const withPending = gs.filter((g) => g.pending_count > 0);
      setGroups(withPending);
      const details = await Promise.all(
        withPending.map((g) => getGroupDetail(g.id))
      );
      const byGroup: Record<number, GroupDetail> = {};
      for (const d of details) {
        if (d.pending_members?.length > 0) {
          byGroup[d.id] = d;
        }
      }
      setPendingByGroup(byGroup);
      setSelected(new Set());
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSelect(groupId: number, userId: number) {
    const key = `${groupId}:${userId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleBulkAction(action: "approve" | "reject") {
    if (selected.size === 0) return;
    setActionLoading(true);
    setError(null);
    const byGroup: Record<string, number[]> = {};
    for (const key of selected) {
      const [gid, uid] = key.split(":");
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(parseInt(uid, 10));
    }
    try {
      await Promise.all(
        Object.entries(byGroup).map(([gid, uids]) => {
          const csrf = pendingByGroup[parseInt(gid, 10)]?.csrf_token;
          return action === "approve"
            ? approveMembers(parseInt(gid, 10), uids, csrf)
            : rejectMembers(parseInt(gid, 10), uids, csrf);
        })
      );
      showToast(`${action === "approve" ? "Approved" : "Rejected"} ${selected.size} student${selected.size !== 1 ? "s" : ""}`);
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  const totalPending = Object.values(pendingByGroup).reduce(
    (acc, g) => acc + (g.pending_members?.length || 0), 0
  );

  const allPending: PendingRow[] = [];
  for (const [gid, g] of Object.entries(pendingByGroup)) {
    const groupId = parseInt(gid, 10);
    for (const m of (g.pending_members || [])) {
      allPending.push({ ...m, groupId, groupName: g.name });
    }
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout} pendingCount={totalPending}>
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: "Pending Approvals" },
        ]} />

        <h1>Pending Approvals</h1>

        <AlertError message={error} />

        {!groups && !error && (
          <div className="skeleton" style={{ height: 200 }} />
        )}

        {groups && totalPending === 0 && (
          <div className="empty-state">No pending approvals across any group.</div>
        )}

        {allPending.length > 0 && (
          <>
            <div className="toolbar" style={{ paddingTop: 0 }}>
              <button className="btn btn-sm" onClick={() => {
                const allKeys = allPending.map((m) => `${m.groupId}:${m.user_id}`);
                const allSelected = allKeys.every((k) => selected.has(k));
                setSelected(allSelected ? new Set() : new Set(allKeys));
              }}>
                {allPending.every((m) => selected.has(`${m.groupId}:${m.user_id}`)) ? "Deselect All" : "Select All"}
              </button>
              <button className="btn btn-primary btn-sm" disabled={selected.size === 0 || actionLoading} onClick={() => handleBulkAction("approve")}>
                Approve {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
              <button className="btn btn-sm btn-danger-outline" disabled={selected.size === 0 || actionLoading} onClick={() => handleBulkAction("reject")}>
                Reject
              </button>
            </div>

            <div className="panel student-row-list" style={{ padding: "0.5rem" }}>
              {allPending.map((m) => {
                const key = `${m.groupId}:${m.user_id}`;
                return (
                  <div key={key} className="student-row-card" style={{ cursor: "default" }} onClick={() => toggleSelect(m.groupId, m.user_id)}>
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(m.groupId, m.user_id)} onClick={(e) => e.stopPropagation()} />
                    <div className="avatar-circle">{initials(m.email)}</div>
                    <div className="student-row-identity">
                      <div className="student-row-email">{m.email}</div>
                      <div className="student-row-meta">{[m.study_program, m.semester].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <span className="badge">{m.groupName}</span>
                    <div className="text-sm-muted" style={{ minWidth: 100, textAlign: "right" }}>
                      {m.requested_at ? timeAgo(m.requested_at) : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </InstructorLayout>
  );
}
