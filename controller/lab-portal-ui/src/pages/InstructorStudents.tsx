import { useState, useEffect, useCallback, useMemo } from "react";
import type { User, StudentsProgressEntry } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import ConfirmModal from "../components/ConfirmModal";
import ProgressRing from "../components/ProgressRing";
import LastActiveBadge from "../components/LastActiveBadge";
import IconButton from "../components/IconButton";
import PageHeader from "../components/PageHeader";
import DataChip from "../components/DataChip";
import { Trash2, ArrowUpDown, Search } from "lucide-react";
import { showToast } from "../components/Toast";
import { getStudentsProgress, removeGroupMember, deleteStudent } from "../api";
import { fmtTime } from "../utils/time";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  user: User;
  onLogout: () => void;
}

type SortCol = "email" | "passed" | "sessions" | "time" | "last_active";

function initials(email: string): string {
  return (email || "?").charAt(0).toUpperCase();
}

export default function InstructorStudents({ user, onLogout }: Props) {
  const params = new URLSearchParams(window.location.search);
  const initialGroupId = params.get("group") ? parseInt(params.get("group")!, 10) : null;

  const [students, setStudents] = useState<StudentsProgressEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [filterGroupId, setFilterGroupId] = useState<number | null>(initialGroupId);
  const [sortBy, setSortBy] = useState<SortCol>("email");
  const [sortDir, setSortDir] = useState(1);
  const [removeTarget, setRemoveTarget] = useState<StudentsProgressEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const allGroups = useMemo(() => {
    const map = new Map<number, string>();
    (students || []).forEach((s) => (s.groups || []).forEach((g) => map.set(g.id, g.name)));
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const filterGroupName = allGroups.find((g) => g.id === filterGroupId)?.name || null;

  useDocumentTitle(filterGroupName ? `Students in ${filterGroupName}` : "All Students");

  const refresh = useCallback(() => {
    getStudentsProgress()
      .then(setStudents)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir((d) => -d);
    else { setSortBy(col); setSortDir(1); }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (removeTarget.groups && removeTarget.groups.length > 0) {
        await Promise.all(
          removeTarget.groups.map((g) => removeGroupMember(g.id, removeTarget.student_id))
        );
      } else {
        await deleteStudent(removeTarget.student_id);
      }
      setRemoveTarget(null);
      refresh();
      showToast("Student removed");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(() => {
    const groupFiltered = filterGroupId
      ? (students || []).filter((s) => s.groups?.some((g) => g.id === filterGroupId))
      : (students || []);

    const q = debouncedSearch.toLowerCase();
    const filtered = groupFiltered.filter((s) => {
      if (!q) return true;
      return (
        (s.email || "").toLowerCase().includes(q) ||
        (s.student_id || "").toLowerCase().includes(q) ||
        (!filterGroupId && (s.groups || []).some((g) => g.name.toLowerCase().includes(q)))
      );
    });

    return [...filtered].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortBy) {
        case "email": va = a.email || ""; vb = b.email || ""; break;
        case "passed": va = a.labs_passed || 0; vb = b.labs_passed || 0; break;
        case "sessions": va = a.total_sessions || 0; vb = b.total_sessions || 0; break;
        case "time": va = a.total_time_seconds || 0; vb = b.total_time_seconds || 0; break;
        case "last_active": va = a.last_active || ""; vb = b.last_active || ""; break;
        default: va = a.email || ""; vb = b.email || "";
      }
      if (typeof va === "string") return va.localeCompare(vb as string) * sortDir;
      return ((va as number) - (vb as number)) * sortDir;
    });
  }, [students, filterGroupId, debouncedSearch, sortBy, sortDir]);

  function handleRowClick(s: StudentsProgressEntry) {
    const targetGroup = filterGroupId
      ? s.groups?.find((g) => g.id === filterGroupId)
      : s.groups?.[0];
    if (targetGroup) navigate(`/instructor/groups/${targetGroup.id}/students/${s.student_id}`);
  }

  function SortHead({ col, children, className }: { col: SortCol; children: React.ReactNode; className?: string }) {
    const active = sortBy === col;
    return (
      <TableHead className={className}>
        <button
          onClick={() => toggleSort(col)}
          className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}
        >
          {children}
          <ArrowUpDown className={cn("size-3", active ? "opacity-100" : "opacity-35")} />
        </button>
      </TableHead>
    );
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={filterGroupName ? `Students in ${filterGroupName}` : "All students"}
        breadcrumbs={[
          { label: "Dashboard", href: "/instructor" },
          { label: filterGroupName ? filterGroupName : "All Students" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by email or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={filterGroupId != null ? String(filterGroupId) : "all"}
          onValueChange={(v) => setFilterGroupId(v === "all" ? null : parseInt(v, 10))}
        >
          <SelectTrigger className="w-64"><SelectValue placeholder="All groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {allGroups.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AlertError message={error} className="mb-4" />

      {!students && !error && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Skeleton className="h-[300px] w-full rounded-none" />
        </div>
      )}

      {students && sorted.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {debouncedSearch ? "No students match your search." : filterGroupId ? "No students in this group." : "No students registered yet."}
        </div>
      )}

      {students && sorted.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Student</TableHead>
                <SortHead col="passed">Passed</SortHead>
                <SortHead col="sessions">Sessions</SortHead>
                <SortHead col="time">Recorded runtime</SortHead>
                <SortHead col="last_active">Last active</SortHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => {
                const pct = s.labs_assigned > 0 ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                return (
                  <TableRow
                    key={s.student_id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(s)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(s); } }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar size="sm"><AvatarFallback className="bg-accent text-primary">{initials(s.email)}</AvatarFallback></Avatar>
                        <div>
                          <div className="text-sm font-medium text-foreground">{s.email}</div>
                          <div className="text-xs text-muted-foreground">
                            {!filterGroupId && s.groups && s.groups.length > 0
                              ? s.groups.map((g) => g.name).join(", ")
                              : [s.semester, s.study_program].filter(Boolean).join(" · ") || <DataChip>{s.student_id}</DataChip>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressRing pct={pct} size={36} strokeWidth={3.5} label={`${s.labs_passed}/${s.labs_assigned}`} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{s.total_sessions}</TableCell>
                    <TableCell className="text-sm text-foreground">{fmtTime(s.total_time_seconds)}</TableCell>
                    <TableCell><LastActiveBadge ts={s.last_active} /></TableCell>
                    <TableCell>
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${s.email}`}
                        danger
                        onClick={(e) => { e.stopPropagation(); setRemoveTarget(s); }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={!!removeTarget}
        title={`Remove ${removeTarget?.email || "student"}?`}
        message={
          removeTarget?.groups && removeTarget.groups.length > 0
            ? `This removes them from ${removeTarget.groups.map((g) => g.name).join(", ")}. Session history is preserved.`
            : "This student is not in any group. Remove their account?"
        }
        confirmLabel={busy ? "Removing..." : "Remove"}
        confirmDanger
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </InstructorLayout>
  );
}
