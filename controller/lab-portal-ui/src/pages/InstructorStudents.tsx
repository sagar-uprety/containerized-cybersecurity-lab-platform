import { useState, useEffect, useCallback, useMemo } from "react";
import type { User, StudentsProgressEntry } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import ConfirmModal from "../components/ConfirmModal";
import ProgressRing from "../components/ProgressRing";
import LastActiveBadge from "../components/LastActiveBadge";
import IconButton from "../components/IconButton";
import Breadcrumbs from "../components/Breadcrumbs";
import { Trash2, ArrowUpDown } from "lucide-react";
import { showToast } from "../components/Toast";
import { getStudentsProgress, removeGroupMember, deleteStudent } from "../api";
import { fmtTime } from "../utils/time";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";

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

  function SortLabel({ col, children }: { col: SortCol; children: React.ReactNode }) {
    const active = sortBy === col;
    return (
      <button className="sort-label" onClick={() => toggleSort(col)}>
        {children}
        <ArrowUpDown size={11} style={{ opacity: active ? 1 : 0.35 }} />
      </button>
    );
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: filterGroupName ? filterGroupName : "All Students" },
        ]} />

        <h1>{filterGroupName ? `Students in ${filterGroupName}` : "All Students"}</h1>

        <div className="flex-center flex-wrap gap-sm mb-lg">
          <input
            type="text"
            placeholder="Search by email or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <select
            className="filter-select"
            value={filterGroupId ?? ""}
            onChange={(e) => setFilterGroupId(e.target.value ? parseInt(e.target.value, 10) : null)}
          >
            <option value="">All groups</option>
            {allGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <div className="flex-center gap-sm" style={{ marginLeft: "auto" }}>
            <SortLabel col="passed">Passed</SortLabel>
            <SortLabel col="sessions">Sessions</SortLabel>
            <SortLabel col="time">Time</SortLabel>
            <SortLabel col="last_active">Last active</SortLabel>
          </div>
        </div>

        <AlertError message={error} />

        {!students && !error && (
          <div className="panel" style={{ padding: 0 }}>
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        )}

        {students && sorted.length === 0 && (
          <div className="empty-state">
            {debouncedSearch ? "No students match your search." : filterGroupId ? "No students in this group." : "No students registered yet."}
          </div>
        )}

        {students && sorted.length > 0 && (
          <div className="panel student-row-list" style={{ padding: "0.5rem" }}>
            {sorted.map((s) => {
              const pct = s.labs_assigned > 0 ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
              return (
                <div
                  key={s.student_id}
                  className="student-row-card"
                  role="link"
                  tabIndex={0}
                  onClick={() => handleRowClick(s)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(s); } }}
                >
                  <div className="avatar-circle">{initials(s.email)}</div>
                  <div className="student-row-identity">
                    <div className="student-row-email">{s.email}</div>
                    <div className="student-row-meta">
                      {!filterGroupId && s.groups && s.groups.length > 0
                        ? s.groups.map((g) => g.name).join(", ")
                        : [s.semester, s.study_program].filter(Boolean).join(" · ") || s.student_id}
                    </div>
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
                    <IconButton
                      icon={Trash2}
                      label={`Remove ${s.email}`}
                      danger
                      onClick={(e) => { e.stopPropagation(); setRemoveTarget(s); }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
