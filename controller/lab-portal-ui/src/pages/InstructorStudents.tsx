import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from "react";
import type { User, StudentsProgressEntry } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import ConfirmModal from "../components/ConfirmModal";
import ProgressBar from "../components/ProgressBar";
import LastActiveBadge from "../components/LastActiveBadge";
import Breadcrumbs from "../components/Breadcrumbs";
import Link from "../components/Link";
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

type SortCol = "email" | "group" | "passed" | "sessions" | "time" | "last_active";

export default function InstructorStudents({ user, onLogout }: Props) {
  const params = new URLSearchParams(window.location.search);
  const filterGroupId = params.get("group") ? parseInt(params.get("group")!, 10) : null;

  const [students, setStudents] = useState<StudentsProgressEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [sortBy, setSortBy] = useState<SortCol>("email");
  const [sortDir, setSortDir] = useState(1);
  const [removeTarget, setRemoveTarget] = useState<StudentsProgressEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const filterGroupName = useMemo(() => {
    if (!filterGroupId || !students) return null;
    const s = students.find((s) => s.groups?.some((g) => g.id === filterGroupId));
    return s?.groups?.find((g) => g.id === filterGroupId)?.name || `Group #${filterGroupId}`;
  }, [filterGroupId, students]);

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
        case "group": va = a.groups?.[0]?.name || ""; vb = b.groups?.[0]?.name || ""; break;
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

  function SortHeader({ col, children, align }: { col: SortCol; children: React.ReactNode; align?: string }) {
    return (
      <th style={{ cursor: "pointer", userSelect: "none", textAlign: (align || "left") as "left" | "center" | "right" }} onClick={() => toggleSort(col)}>
        {children} {sortBy === col ? (sortDir === 1 ? "↑" : "↓") : ""}
      </th>
    );
  }

  const backPath = filterGroupId ? `/instructor/groups/${filterGroupId}` : "/instructor";

  function handleRowClick(s: StudentsProgressEntry) {
    const targetGroup = filterGroupId
      ? s.groups?.find((g) => g.id === filterGroupId)
      : s.groups?.[0];
    if (targetGroup) navigate(`/instructor/groups/${targetGroup.id}/students/${s.student_id}`);
  }

  function handleRowKeyDown(e: KeyboardEvent, s: StudentsProgressEntry) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(s); }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          ...(filterGroupName ? [{ label: filterGroupName, href: `/instructor/groups/${filterGroupId}` }] : []),
          { label: filterGroupName ? "Students" : "All Students" },
        ]} />

        <div className="page-title-row">
          <h1>
            {filterGroupName ? `Students in ${filterGroupName}` : "All Students"}
          </h1>
          {filterGroupId && (
            <Link href="/instructor/students" className="btn btn-sm" style={{ fontSize: "0.78rem", height: 28 }}>
              View All
            </Link>
          )}
        </div>

        <div className="mb-md">
          <input
            type="text"
            placeholder={filterGroupId ? "Search by email or ID..." : "Search by email, ID, or group..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
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
          <div className="panel mb-0" style={{ padding: 0, overflow: "auto" }}>
            <table className="data-table data-table-clickable" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <SortHeader col="email">Student</SortHeader>
                  {!filterGroupId && <SortHeader col="group">Group</SortHeader>}
                  <SortHeader col="passed" align="center">Passed</SortHeader>
                  <SortHeader col="sessions" align="center">Sessions</SortHeader>
                  <SortHeader col="time" align="center">Time Spent</SortHeader>
                  <SortHeader col="last_active" align="center">Last Active</SortHeader>
                  <th className="text-center" style={{ width: 120 }}>Completion</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const pct = s.labs_assigned > 0 ? Math.round((s.labs_passed / s.labs_assigned) * 100) : 0;
                  return (
                    <tr
                      key={s.student_id}
                      role="link"
                      tabIndex={0}
                      onClick={() => handleRowClick(s)}
                      onKeyDown={(e) => handleRowKeyDown(e, s)}
                    >
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.email}</div>
                        <div className="text-xs-muted">
                          {[s.semester, s.study_program].filter(Boolean).join(" · ") || s.student_id}
                        </div>
                      </td>
                      {!filterGroupId && (
                        <td>
                          {s.groups && s.groups.length > 0 ? (
                            <div className="flex-center flex-wrap gap-sm">
                              {s.groups.map((g) => (
                                <span key={g.id} className="badge">{g.name}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm-muted">No group</span>
                          )}
                        </td>
                      )}
                      <td className="text-center">
                        <span className="text-mono-data" style={{ color: s.labs_passed > 0 ? "var(--green)" : "var(--ink)" }}>
                          {s.labs_passed} / {s.labs_assigned}
                        </span>
                      </td>
                      <td className="text-center text-mono-data" style={{ color: "var(--muted)" }}>
                        {s.total_sessions}
                      </td>
                      <td className="text-center text-mono" style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                        {fmtTime(s.total_time_seconds)}
                      </td>
                      <td className="text-center">
                        <LastActiveBadge ts={s.last_active} />
                      </td>
                      <td style={{ width: 120 }}>
                        <ProgressBar pct={pct} />
                      </td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-sm btn-danger-outline"
                          style={{ fontSize: "0.72rem", height: 24, padding: "0 0.4rem" }}
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
          removeTarget?.groups && removeTarget.groups.length > 0
            ? `This removes them from ${removeTarget.groups.map((g) => g.name).join(", ")}. Session history is preserved.`
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
