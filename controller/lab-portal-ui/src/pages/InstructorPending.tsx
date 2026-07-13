import { useState, useEffect, useCallback } from "react";
import type { User, Group, GroupDetail } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { showToast } from "../components/Toast";
import { getGroups, getGroupDetail, approveMembers, rejectMembers } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { timeAgo } from "../utils/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

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

  const allKeys = allPending.map((m) => `${m.groupId}:${m.user_id}`);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  return (
    <InstructorLayout user={user} onLogout={onLogout} pendingCount={totalPending}>
      <PageHeader
        title="Pending approvals"
        breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: "Pending Approvals" }]}
      />

      <AlertError message={error} className="mb-4" />

      {!groups && !error && <Skeleton className="h-48 w-full" />}

      {groups && totalPending === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No pending approvals across any group.
        </div>
      )}

      {allPending.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(allSelected ? new Set() : new Set(allKeys))}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            <Button size="sm" disabled={selected.size === 0 || actionLoading} onClick={() => handleBulkAction("approve")}>
              Approve {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0 || actionLoading}
              onClick={() => handleBulkAction("reject")}
              className="border-destructive/30 text-destructive hover:bg-destructive-bg"
            >
              Reject
            </Button>
          </div>

          <Card className="gap-0 divide-y divide-border py-0">
            {allPending.map((m) => {
              const key = `${m.groupId}:${m.user_id}`;
              return (
                <div
                  key={key}
                  className="flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-accent/40"
                  onClick={() => toggleSelect(m.groupId, m.user_id)}
                >
                  <Checkbox
                    checked={selected.has(key)}
                    aria-label={`Select ${m.email}`}
                    onCheckedChange={() => toggleSelect(m.groupId, m.user_id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Avatar size="sm"><AvatarFallback className="bg-accent text-primary">{initials(m.email)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{m.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {[m.study_program, m.semester].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <Badge variant="outline">{m.groupName}</Badge>
                  <div className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {m.requested_at ? timeAgo(m.requested_at) : ""}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </InstructorLayout>
  );
}
