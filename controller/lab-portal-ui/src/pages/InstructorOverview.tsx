import { useState, useEffect, useCallback } from "react";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { ActiveStudentsTrendChart, CompletionTrendChart, SessionTrendChart } from "../components/AnalyticsCharts";
import { Layers, BookMarked, Plus, Radio, Activity, AlertTriangle, CheckCircle2, Clock3, Archive } from "lucide-react";
import { getInstructorAnalytics, createGroup } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import type { User, InstructorAnalyticsData, AnalyticsGroup } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEMESTERS } from "../utils/semesters";
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
  const [data, setData] = useState<InstructorAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [newGroupSemester, setNewGroupSemester] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  useDocumentTitle("Instructor Dashboard");

  const refresh = useCallback(async () => {
    try {
      setData(await getInstructorAnalytics(undefined, statusFilter));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim() || !newGroupSemester) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(newGroup.trim(), newGroupSemester.trim());
      setNewGroup("");
      setNewGroupSemester("");
      setNewGroupOpen(false);
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const filteredGroups = data?.groups?.filter((g: AnalyticsGroup) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  function handleGroupKeyDown(e: React.KeyboardEvent, groupId: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/instructor/groups/${groupId}`);
    }
  }

  const totalPending = data?.groups?.reduce((sum, g) => sum + g.pending_count, 0) ?? 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout} pendingCount={totalPending}>
      <PageHeader
        title="Dashboard"
        description="How your groups are doing, compared and over time."
        actions={
          data ? (
            <>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Layers className="size-3.5" /> {data.total_groups} group{data.total_groups !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <BookMarked className="size-3.5" /> {data.total_labs} lab{data.total_labs !== 1 ? "s" : ""}
              </Badge>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active groups</SelectItem>
                  <SelectItem value="archived">
                    Archived{data.archived_groups_count > 0 ? ` (${data.archived_groups_count})` : ""}
                  </SelectItem>
                  <SelectItem value="all">All groups</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : undefined
        }
      />

      <AlertError message={error} className="mb-6" />

      <section className="mb-8">
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
            {filteredGroups.map((g: AnalyticsGroup) => (
              <Card
                key={g.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/instructor/groups/${g.id}`)}
                onKeyDown={(e) => handleGroupKeyDown(e, g.id)}
                className="h-full cursor-pointer py-5 transition-colors hover:bg-accent/40 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardContent className="flex h-full flex-col gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium text-foreground">{g.name}</div>
                      {g.is_archived && (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <Archive className="size-3" /> Archived
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{g.total_students} student{g.total_students !== 1 ? "s" : ""}</Badge>
                      <Badge variant="outline">{g.labs_assigned} lab{g.labs_assigned !== 1 ? "s" : ""}</Badge>
                      {g.pending_count > 0 && (
                        <Badge className="border-transparent bg-warning-bg text-warning">{g.pending_count} pending approval{g.pending_count !== 1 ? "s" : ""}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span>Achieved <strong className="text-foreground">{g.completed_assignments}/{g.eligible_assignments}</strong></span>
                    <span>Overdue <strong className={g.overdue_incomplete > 0 ? "text-warning" : "text-foreground"}>{g.overdue_incomplete}</strong></span>
                    <span>Active now <strong className="text-foreground">{g.active_now_students}/{g.total_students}</strong></span>
                    <span>Active this week <strong className="text-foreground">{g.active_students}/{g.total_students}</strong></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Achievement" value={`${data.completed_assignments} / ${data.eligible_assignments}`} description={`${data.completion_rate}% ever passed; current state tracked separately`} />
            <StatCard icon={Radio} label="Active now" value={`${data.active_now_students} / ${data.total_students}`} description={`${data.active_now_sessions} lab session${data.active_now_sessions === 1 ? "" : "s"} running right now`} tone={data.active_now_students > 0 ? "success" : "default"} />
            <StatCard icon={Activity} label="Active this week" value={`${data.active_this_week} / ${data.total_students}`} description="Distinct students with a session in the last 7 days" />
            <StatCard icon={data.overdue_incomplete > 0 ? AlertTriangle : CheckCircle2} label="Overdue incomplete" value={data.overdue_incomplete} description={`${data.overdue_eligible} assignment${data.overdue_eligible === 1 ? "" : "s"} currently due`} tone={data.overdue_incomplete > 0 ? "danger" : "success"} />
            <StatCard icon={Clock3} label="Median recorded runtime" value={`${data.median_session_minutes} min`} description={`${data.median_runtime_samples} closed sessions; ${data.open_sessions} open`} />
          </div>

          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span><strong className="font-medium text-foreground">Metric context:</strong> {data.window_label}</span>
              <span>As of {new Date(data.as_of).toLocaleString("en-GB", { timeZone: data.timezone })} {data.timezone}</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle><h2>Achievement trajectory</h2></CardTitle>
              <CardDescription>Cumulative achieved obligations against assignments eligible by each cutoff. Current week is partial.</CardDescription>
            </CardHeader>
            <CardContent><CompletionTrendChart data={data.weekly} /></CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle><h2>Weekly active students</h2></CardTitle>
                <CardDescription>Distinct students who started a recorded lab session.</CardDescription>
              </CardHeader>
              <CardContent><ActiveStudentsTrendChart data={data.weekly} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle><h2>Weekly session starts</h2></CardTitle>
                <CardDescription>Recorded starts, including later interrupted or open sessions.</CardDescription>
              </CardHeader>
              <CardContent><SessionTrendChart data={data.weekly} /></CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              Create a group for a semester or cohort. Students request to join after signing up.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="e.g. Security Fundamentals"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                autoFocus
                required
              />
              <Select value={newGroupSemester} onValueChange={setNewGroupSemester}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select semester…" /></SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={creating || !newGroup.trim() || !newGroupSemester}>
                {creating ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </InstructorLayout>
  );
}
