import { useState, useEffect, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import Link from "../components/Link";
import { Layers, BookMarked, Plus } from "lucide-react";
import { getDashboardStats, createGroup, getInstructorStudents } from "../api.js";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";
import type { User, DashboardStats, Group, StudentsProgressEntry } from "../types";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function InstructorOverview({ user, onLogout }: Props) {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentsProgressEntry[] | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

  const debouncedStudentSearch = useDebounce(studentSearch, 300);

  useDocumentTitle("Instructor Dashboard");

  const refresh = useCallback(async () => {
    try {
      setData(await getDashboardStats());
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (debouncedStudentSearch.length >= 2 && !students) {
      getInstructorStudents().then((data) => setStudents(data as unknown as StudentsProgressEntry[])).catch(() => {});
    }
  }, [debouncedStudentSearch, students]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(newGroup.trim());
      setNewGroup("");
      setNewGroupOpen(false);
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const filteredGroups = data?.groups?.filter((g: Group) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const studentMatches = useMemo(() => {
    if (debouncedStudentSearch.length < 2 || !students) return [];
    const q = debouncedStudentSearch.toLowerCase();
    return students.filter((s) =>
      s.email?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [debouncedStudentSearch, students]);

  function handleGroupKeyDown(e: React.KeyboardEvent, groupId: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/instructor/groups/${groupId}`);
    }
  }

  const completionPct = data && data.total_possible > 0
    ? Math.round((data.total_passed / data.total_possible) * 100)
    : null;
  const needsAttention = data ? data.total_pending + data.total_at_risk : 0;
  const activePct = data && data.total_students > 0
    ? Math.round((data.active_this_week / data.total_students) * 100)
    : null;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <div className="container">
        <div className="page-title-row">
          <h1 className="mb-0">Instructor Dashboard</h1>
          {data && (
            <div className="chip-row" style={{ marginLeft: "auto" }}>
              <span className="chip"><Layers size={13} /> {data.total_groups} group{data.total_groups !== 1 ? "s" : ""}</span>
              <span className="chip"><BookMarked size={13} /> {data.total_labs} lab{data.total_labs !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {data && (
          <div className="insight-grid mb-lg">
            <div className="insight-tile">
              <div className="insight-tile-value">{completionPct != null ? `${completionPct}%` : "—"}</div>
              <div className="insight-tile-label">Overall completion ({data.total_passed} / {data.total_possible} assignments)</div>
            </div>
            {needsAttention > 0 ? (
              <Link href="/instructor/pending" className="insight-tile insight-tile-attention">
                <div className="insight-tile-value">{needsAttention}</div>
                <div className="insight-tile-label">Needs attention ({data.total_pending} pending, {data.total_at_risk} at risk)</div>
              </Link>
            ) : (
              <div className="insight-tile">
                <div className="insight-tile-value">0</div>
                <div className="insight-tile-label">Needs attention — all clear</div>
              </div>
            )}
            <div className="insight-tile">
              <div className="insight-tile-value">{activePct != null ? `${activePct}%` : "—"}</div>
              <div className="insight-tile-label">Active this week ({data.active_this_week} / {data.total_students} students)</div>
            </div>
          </div>
        )}

        <AlertError message={error} className="mb-lg" />

        {/* Student Search */}
        <section className="section-block">
          <h2>Student Search</h2>
          <input
            type="text"
            placeholder="Find a student across all groups..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          {debouncedStudentSearch.length >= 2 && students && (
            studentMatches.length === 0 ? (
              <div className="text-sm-muted" style={{ marginTop: "var(--sp-2)" }}>No students found.</div>
            ) : (
              <div className="panel" style={{ padding: 0, marginTop: "var(--sp-2)", overflow: "hidden" }}>
                {studentMatches.map((s) => (
                  <div
                    key={s.student_id}
                    style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border-light)" }}
                  >
                    <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>{s.email || s.student_id}</div>
                    {s.groups && s.groups.length > 0 ? (
                      <div className="flex-center flex-wrap gap-sm" style={{ marginTop: "var(--sp-1)" }}>
                        {s.groups.map((g) => (
                          <Link
                            key={g.id}
                            href={`/instructor/groups/${g.id}/students/${s.student_id}`}
                            className="btn btn-sm"
                            style={{ height: 24, fontSize: "0.75rem", padding: "0 0.5rem" }}
                          >
                            {g.name} &rarr;
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs-muted" style={{ marginTop: "var(--sp-1)" }}>Not enrolled in any group</div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        {/* Groups */}
        <section className="section-block">
          <div className="section-header-row">
            <h2 className="mb-0">Groups</h2>
            <div className="flex-center gap-sm">
              {filteredGroups.length > 3 && (
                <input
                  type="text"
                  placeholder="Filter groups..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setNewGroupOpen(true)}>
                <Plus size={14} style={{ marginRight: 4 }} /> New Group
              </button>
            </div>
          </div>

          {!data && !error && (
            <div className="insight-grid mb-lg">
              {[1, 2, 3].map((i) => (
                <div key={i} className="insight-tile">
                  <div className="skeleton" style={{ height: 30, width: "50%" }} />
                  <div className="skeleton" style={{ height: 14, width: "80%", marginTop: 10 }} />
                </div>
              ))}
            </div>
          )}

          {data && filteredGroups.length === 0 && (
            <div className="empty-state">
              {search ? "No groups match your filter." : "No groups yet. Create one to get started."}
            </div>
          )}

          {filteredGroups.length > 0 && (
            <div className="labs-grid">
              {filteredGroups.map((g: Group) => (
                <article
                  key={g.id}
                  className="lab-card clickable-row"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/instructor/groups/${g.id}`)}
                  onKeyDown={(e) => handleGroupKeyDown(e, g.id)}
                >
                  <span className="lab-card-title">{g.name}</span>
                  <div className="flex-center flex-wrap gap-sm">
                    <span className="badge">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                    <span className="badge">{g.lab_count} lab{g.lab_count !== 1 ? "s" : ""}</span>
                    {g.pending_count > 0 && (
                      <span className="badge badge-pending">
                        {g.pending_count} pending
                      </span>
                    )}
                  </div>
                  {g.created_at && (
                    <div className="text-sm-muted">
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog.Root open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">New group</Dialog.Title>
            <Dialog.Description className="dialog-description">
              Create a group for a semester or cohort. Students request to join after signing up.
            </Dialog.Description>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                placeholder="e.g. WS 2026/27 — Security Lab"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                autoFocus
                required
              />
              <div className="dialog-actions">
                <button type="button" className="btn btn-sm" onClick={() => setNewGroupOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                  {creating ? "Creating..." : "Create group"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </InstructorLayout>
  );
}
