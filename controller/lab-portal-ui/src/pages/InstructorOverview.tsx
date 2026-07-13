import { useState, useEffect, useCallback, useMemo } from "react";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Link from "../components/Link";
import { Layers, BookMarked, Plus, Search, ArrowRight, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getDashboardStats, createGroup, getInstructorStudents } from "../api.js";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";
import type { User, DashboardStats, Group, StudentsProgressEntry } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <InstructorLayout user={user} onLogout={onLogout} pendingCount={data?.total_pending}>
      <PageHeader
        title="Dashboard"
        description="Who needs your attention, and how your groups are doing."
        actions={
          data ? (
            <>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Layers className="size-3.5" /> {data.total_groups} group{data.total_groups !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <BookMarked className="size-3.5" /> {data.total_labs} lab{data.total_labs !== 1 ? "s" : ""}
              </Badge>
            </>
          ) : undefined
        }
      />

      {data && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={CheckCircle2}
            label="Overall completion"
            value={completionPct != null ? `${completionPct}%` : "—"}
            description={`${data.total_passed} / ${data.total_possible} assignments passed`}
          />
          <StatCard
            icon={needsAttention > 0 ? AlertTriangle : CheckCircle2}
            label="Needs attention"
            value={needsAttention}
            description={needsAttention > 0 ? `${data.total_pending} pending, ${data.total_at_risk} overdue incomplete` : "All clear"}
            tone={needsAttention > 0 ? "danger" : "success"}
            href={needsAttention > 0 ? "/instructor/pending" : undefined}
          />
          <StatCard
            icon={Users}
            label="Active this week"
            value={activePct != null ? `${activePct}%` : "—"}
            description={`${data.active_this_week} / ${data.total_students} students`}
          />
        </div>
      )}

      <AlertError message={error} className="mb-6" />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Student search</h2>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Find a student across all groups…"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {debouncedStudentSearch.length >= 2 && students && (
          studentMatches.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">No students found.</div>
          ) : (
            <Card className="mt-2 max-w-md gap-0 divide-y divide-border py-0">
              {studentMatches.map((s) => (
                <div key={s.student_id} className="p-3">
                  <div className="text-sm font-medium text-foreground">{s.email || s.student_id}</div>
                  {s.groups && s.groups.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.groups.map((g) => (
                        <Button key={g.id} asChild variant="outline" size="xs" className="gap-1">
                          <Link href={`/instructor/groups/${g.id}/students/${s.student_id}`}>
                            {g.name} <ArrowRight className="size-3" />
                          </Link>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-muted-foreground">Not enrolled in any group</div>
                  )}
                </div>
              ))}
            </Card>
          )
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Groups</h2>
          <div className="flex items-center gap-2">
            {filteredGroups.length > 3 && (
              <Input
                type="text"
                placeholder="Filter groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
              />
            )}
            <Button size="sm" onClick={() => setNewGroupOpen(true)}>
              <Plus /> New group
            </Button>
          </div>
        </div>

        {!data && !error && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent>
                  <Skeleton className="h-8 w-1/2" />
                  <Skeleton className="mt-2.5 h-3.5 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {data && filteredGroups.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {search ? "No groups match your filter." : "No groups yet. Create one to get started."}
          </div>
        )}

        {filteredGroups.length > 0 && (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map((g: Group) => (
              <Card
                key={g.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/instructor/groups/${g.id}`)}
                onKeyDown={(e) => handleGroupKeyDown(e, g.id)}
                className="h-full cursor-pointer py-5 transition-colors hover:bg-accent/40 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardContent className="flex h-full flex-col">
                  <div className="font-medium text-foreground">{g.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</Badge>
                    <Badge variant="outline">{g.lab_count} lab{g.lab_count !== 1 ? "s" : ""}</Badge>
                    {g.pending_count > 0 && (
                      <Badge className="border-transparent bg-warning-bg text-warning">{g.pending_count} pending approval{g.pending_count !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                  {g.created_at && (
                    <div className="mt-auto pt-2 text-xs text-muted-foreground">
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              Create a group for a semester or cohort. Students request to join after signing up.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <Input
              type="text"
              placeholder="e.g. WS 2026/27 — Security Lab"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              autoFocus
              required
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </InstructorLayout>
  );
}
