import { useEffect, useState } from "react";
import type { GroupDetail, InstructorAnalyticsData, StudentProgress, User } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { ActiveStudentsTrendChart, CompletionTrendChart, LabBottleneckChart, LabComparisonChart, SessionTrendChart } from "../components/AnalyticsCharts";
import { getGroupDetail, getGroupProgress, getInstructorAnalytics } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Radio } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Shared by both drill-down popovers below (the scoped group's KPI card, and
// each row of the cross-group table). Progress is fetched lazily per group id
// - only when a popover is actually opened - and never eagerly for the whole
// table, since that could mean one fetch per group on every page load.
function OverdueStudentsList({ loading, error, students }: { loading: boolean; error?: string; students?: StudentProgress[] }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!students || students.length === 0) {
    return <p className="text-sm text-muted-foreground">No overdue students.</p>;
  }
  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto">
      {students.map((s) => {
        const overdueLabs = (s.review_reasons || []).filter((r) => r.code === "overdue_incomplete");
        return (
          <li key={s.student_id} className="text-sm">
            <div className="font-medium text-foreground">{s.email || s.student_id}</div>
            {overdueLabs.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {overdueLabs.map((r) => r.lab_title || r.label).join(", ")}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  user: User;
  groupId?: number;
  onLogout: () => void;
}

export default function InstructorAnalytics({ user, groupId, onLogout }: Props) {
  const [data, setData] = useState<InstructorAnalyticsData | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  // Scoped-group overdue drill-down (top KPI card, only meaningful when groupId is set).
  const [scopedOverdue, setScopedOverdue] = useState<StudentProgress[] | undefined>(undefined);
  const [scopedOverdueLoading, setScopedOverdueLoading] = useState(false);
  const [scopedOverdueError, setScopedOverdueError] = useState<string | undefined>(undefined);

  // Per-group overdue drill-down for the cross-group table, keyed by group id.
  // Each entry is fetched at most once, the first time its popover opens.
  const [groupOverdue, setGroupOverdue] = useState<Record<number, StudentProgress[]>>({});
  const [groupOverdueLoading, setGroupOverdueLoading] = useState<Record<number, boolean>>({});
  const [groupOverdueError, setGroupOverdueError] = useState<Record<number, string>>({});

  useDocumentTitle(data?.scope_name ? `Analytics - ${data.scope_name}` : "Analytics");

  useEffect(() => {
    const requests: Promise<unknown>[] = [getInstructorAnalytics(groupId, statusFilter).then(setData)];
    if (groupId != null) requests.push(getGroupDetail(groupId).then(setGroup));
    Promise.all(requests).catch((err: Error) => setError(err.message));
  }, [groupId, statusFilter]);

  // Reset the scoped drill-down when navigating between different groups'
  // analytics pages - this component instance is reused, not remounted.
  useEffect(() => {
    setScopedOverdue(undefined);
    setScopedOverdueError(undefined);
  }, [groupId]);

  function loadScopedOverdue() {
    if (groupId == null || scopedOverdue != null || scopedOverdueLoading) return;
    setScopedOverdueLoading(true);
    setScopedOverdueError(undefined);
    getGroupProgress(groupId)
      .then((progress) => setScopedOverdue(progress.students.filter((s) => s.at_risk)))
      .catch((err: Error) => setScopedOverdueError(err.message))
      .finally(() => setScopedOverdueLoading(false));
  }

  function loadGroupOverdue(id: number) {
    if (groupOverdue[id] || groupOverdueLoading[id]) return;
    setGroupOverdueLoading((prev) => ({ ...prev, [id]: true }));
    setGroupOverdueError((prev) => ({ ...prev, [id]: "" }));
    getGroupProgress(id)
      .then((progress) => setGroupOverdue((prev) => ({ ...prev, [id]: progress.students.filter((s) => s.at_risk) })))
      .catch((err: Error) => setGroupOverdueError((prev) => ({ ...prev, [id]: err.message })))
      .finally(() => setGroupOverdueLoading((prev) => ({ ...prev, [id]: false })));
  }

  const groupContext = groupId != null ? { id: groupId, name: group?.name || data?.scope_name, hasPending: !!group?.pending_members.length } : undefined;

  return (
    <InstructorLayout user={user} onLogout={onLogout} groupContext={groupContext}>
      <PageHeader
        title={data?.scope_name ? "Group analytics" : "Analytics"}
        description={data?.scope_name ? `Learning and engagement trends for ${data.scope_name}.` : "Compare learning progress and engagement across cohorts."}
        breadcrumbs={groupId != null ? [
          { label: "Dashboard", href: "/instructor" },
          { label: data?.scope_name || "Group", href: `/instructor/groups/${groupId}` },
          { label: "Analytics" },
        ] : undefined}
        actions={
          groupId == null && data ? (
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
          ) : undefined
        }
      />

      <AlertError message={error} className="mb-6" />
      {!data && !error && <Skeleton className="h-[560px] w-full" />}

      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Achievement" value={`${data.completed_assignments} / ${data.eligible_assignments}`} description={`${data.completion_rate}% ever passed; current state tracked separately`} />
            <StatCard icon={Radio} label="Active now" value={`${data.active_now_students} / ${data.total_students}`} description={`${data.active_now_sessions} lab session${data.active_now_sessions === 1 ? "" : "s"} running right now`} tone={data.active_now_students > 0 ? "success" : "default"} />
            <StatCard icon={Activity} label="Active this week" value={`${data.active_this_week} / ${data.total_students}`} description="Distinct students with a session in the last 7 days" />
            {groupId != null && data.overdue_incomplete > 0 ? (
              // A plain StatCard can only navigate (href) or do nothing - it has no slot for
              // a popover trigger. Rebuild the same shell by hand so the number itself can
              // open the drill-down, fetched on demand via loadScopedOverdue().
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm font-normal text-destructive">
                    <AlertTriangle className="size-3.5" /> Overdue incomplete
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Popover onOpenChange={(open) => open && loadScopedOverdue()}>
                    <PopoverTrigger className="rounded-sm text-3xl font-semibold tracking-tight text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {data.overdue_incomplete}
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                      <p className="mb-1 text-sm font-medium text-foreground">Overdue students</p>
                      <OverdueStudentsList loading={scopedOverdueLoading} error={scopedOverdueError} students={scopedOverdue} />
                    </PopoverContent>
                  </Popover>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data.overdue_eligible} assignment{data.overdue_eligible === 1 ? "" : "s"} currently due
                  </div>
                </CardContent>
              </Card>
            ) : (
              <StatCard icon={data.overdue_incomplete > 0 ? AlertTriangle : CheckCircle2} label="Overdue incomplete" value={data.overdue_incomplete} description={`${data.overdue_eligible} assignment${data.overdue_eligible === 1 ? "" : "s"} currently due`} tone={data.overdue_incomplete > 0 ? "danger" : "success"} />
            )}
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

          {groupId != null && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle><h2>Lab progression</h2></CardTitle>
                  <CardDescription>Started, student check submission, and ever-achieved rates use separate definitions.</CardDescription>
                </CardHeader>
                <CardContent><LabComparisonChart data={data.labs} /></CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle><h2>Where students get stuck</h2></CardTitle>
                  <CardDescription>Per lab, the single automated check that fails most often. Use the check name below to plan targeted support.</CardDescription>
                </CardHeader>
                <CardContent><LabBottleneckChart data={data.labs} /></CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle><h2>Lab-quality signals</h2></CardTitle>
                  <CardDescription>Outcome, checker, environment, runtime, and anonymized feedback signals. Feedback means are hidden below five responses.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Lab</TableHead><TableHead>Started</TableHead><TableHead>Checked</TableHead><TableHead>Achieved</TableHead><TableHead>Common failed check</TableHead><TableHead>Recorded runtime</TableHead><TableHead>Environment</TableHead><TableHead>Feedback</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.labs.map((lab) => (
                        <TableRow key={lab.lab_id}>
                          <TableCell className="min-w-48 font-medium">{lab.title}</TableCell>
                          <TableCell>{lab.students_started}/{lab.students_assigned}</TableCell>
                          <TableCell>{lab.students_checked}/{lab.students_assigned}</TableCell>
                          <TableCell>{lab.students_passed}/{lab.students_assigned}</TableCell>
                          <TableCell className="min-w-56">{lab.common_failed_criterion ? <>{lab.common_failed_criterion}<span className="block text-xs text-muted-foreground">{lab.criterion_failure_rate}% of observations failed</span></> : "No failed observations"}</TableCell>
                          <TableCell>{lab.median_recorded_minutes ? `${lab.median_recorded_minutes} min` : "-"}<span className="block text-xs text-muted-foreground">n={lab.runtime_samples}; {lab.open_sessions} open</span></TableCell>
                          <TableCell>{lab.environment_errors ? `${lab.environment_errors} errors` : "No errors"}</TableCell>
                          <TableCell>{lab.feedback_average != null ? `${lab.feedback_average} / 5` : "Suppressed"}<span className="block text-xs text-muted-foreground">n={lab.feedback_count}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {groupId == null && data.groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle><h2>Groups</h2></CardTitle>
                <CardDescription>Descriptive counts only. Groups can differ in labs, deadlines, and exposure; do not treat this as a ranking. Click a group for its lab-by-lab breakdown.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Students</TableHead><TableHead>Labs assigned</TableHead><TableHead>Achieved</TableHead><TableHead>Active now</TableHead><TableHead>Active this week</TableHead><TableHead>Overdue incomplete</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.groups.map((group) => (
                      <TableRow key={group.id} className="cursor-pointer" onClick={() => navigate(`/instructor/groups/${group.id}/analytics`)}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell>{group.total_students}</TableCell>
                        <TableCell>{group.labs_assigned}</TableCell>
                        <TableCell>{group.completed_assignments}/{group.eligible_assignments} <span className="text-muted-foreground">({group.completion_rate}%)</span></TableCell>
                        <TableCell>{group.active_now_students}/{group.total_students}</TableCell>
                        <TableCell>{group.active_students}/{group.total_students} <span className="text-muted-foreground">({group.active_rate}%)</span></TableCell>
                        <TableCell>
                          {group.overdue_incomplete > 0 ? (
                            <Popover onOpenChange={(open) => open && loadGroupOverdue(group.id)}>
                              {/* stopPropagation: this cell sits inside a <tr> whose onClick
                                  navigates to the group. Without it, opening the popover
                                  would also fire the row navigation underneath it. */}
                              <PopoverTrigger
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-sm text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {group.overdue_incomplete}
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-80" onClick={(e) => e.stopPropagation()}>
                                <p className="mb-1 text-sm font-medium text-foreground">Overdue students - {group.name}</p>
                                <OverdueStudentsList
                                  loading={!!groupOverdueLoading[group.id]}
                                  error={groupOverdueError[group.id] || undefined}
                                  students={groupOverdue[group.id]}
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            group.overdue_incomplete
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </InstructorLayout>
  );
}
