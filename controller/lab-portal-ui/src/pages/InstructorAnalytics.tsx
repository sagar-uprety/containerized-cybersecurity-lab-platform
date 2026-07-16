import { useEffect, useState } from "react";
import type { GroupDetail, InstructorAnalyticsData, User } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { ActiveStudentsTrendChart, CompletionTrendChart, LabBottleneckChart, LabComparisonChart, SessionTrendChart } from "../components/AnalyticsCharts";
import { getGroupDetail, getInstructorAnalytics } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Radio } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  user: User;
  groupId?: number;
  onLogout: () => void;
}

export default function InstructorAnalytics({ user, groupId, onLogout }: Props) {
  const [data, setData] = useState<InstructorAnalyticsData | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  useDocumentTitle(data?.scope_name ? `Analytics — ${data.scope_name}` : "Analytics");

  useEffect(() => {
    const requests: Promise<unknown>[] = [getInstructorAnalytics(groupId, includeInactive).then(setData)];
    if (groupId != null) requests.push(getGroupDetail(groupId).then(setGroup));
    Promise.all(requests).catch((err: Error) => setError(err.message));
  }, [groupId, includeInactive]);

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
          groupId == null && data && data.inactive_groups_count > 0 ? (
            <div className="flex items-center gap-2">
              <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
              <Label htmlFor="include-inactive" className="text-sm font-normal text-muted-foreground">
                Include {data.inactive_groups_count} inactive group{data.inactive_groups_count === 1 ? "" : "s"}
              </Label>
            </div>
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
                          <TableCell>{lab.median_recorded_minutes ? `${lab.median_recorded_minutes} min` : "—"}<span className="block text-xs text-muted-foreground">n={lab.runtime_samples}; {lab.open_sessions} open</span></TableCell>
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
                        <TableCell>{group.overdue_incomplete}</TableCell>
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
