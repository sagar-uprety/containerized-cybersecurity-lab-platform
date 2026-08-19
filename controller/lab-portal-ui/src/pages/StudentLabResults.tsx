import { useEffect, useState } from "react";
import type { StudentLabResultsData, User } from "../types";
import StudentLayout from "../components/StudentLayout";
import AlertError from "../components/AlertError";
import DataChip from "../components/DataChip";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { SessionDurationChart } from "../components/AnalyticsCharts";
import { getStudentLabResults } from "../api";
import { fmtDuration, fmtTimestamp, fmtTime } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  user: User;
  labId: string;
  groupId?: number;
  onLogout: () => void;
}

export default function StudentLabResults({ user, labId, groupId, onLogout }: Props) {
  const [data, setData] = useState<StudentLabResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(data ? `${data.lab_title} Results` : "Lab Results");

  const groupValid = groupId != null && !Number.isNaN(groupId);

  useEffect(() => {
    if (!groupValid) return;
    getStudentLabResults(labId, groupId!).then(setData).catch((err: Error) => setError(err.message));
  }, [labId, groupId, groupValid]);

  if (!groupValid) {
    return (
      <StudentLayout user={user} onLogout={onLogout}>
        <PageHeader title="Lab results" breadcrumbs={[{ label: "My Results", href: "/results" }, { label: "Lab" }]} />
        <AlertError message="No group specified for this lab's results. Open this page from My Results." />
      </StudentLayout>
    );
  }

  const groupLabel = data?.group_name
    ? data.semester
      ? `${data.group_name} · ${data.semester}`
      : data.group_name
    : undefined;

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={data?.lab_title || "Lab results"}
        description="Your outcome and session history for this lab."
        breadcrumbs={[{ label: "My Results", href: "/results" }, { label: data?.lab_title || "Lab" }]}
        actions={
          <>
            {groupLabel && <Badge className="border-transparent bg-muted text-muted-foreground">{groupLabel}</Badge>}
            {data?.difficulty && <Badge variant="outline" className="capitalize">{data.difficulty}</Badge>}
          </>
        }
      />
      <AlertError message={error} className="mb-6" />
      {!data && !error && <Skeleton className="h-96 w-full" />}
      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Outcome" value={data.result === "passed" ? "Passed" : data.result === "failed" ? "Not passed yet" : "Not attempted"} tone={data.result === "passed" ? "success" : data.result === "failed" ? "danger" : "default"} />
            <StatCard label="Sessions" value={data.total_sessions || 0} />
            <StatCard label="Recorded runtime" value={fmtTime(data.total_time_seconds)} />
          </div>
          {data.sessions && data.sessions.length > 0 ? (
            <>
              <Card>
                <CardHeader><CardTitle><h2>Recorded session runtime</h2></CardTitle><CardDescription>Elapsed runtime for each recorded attempt, oldest to newest. This does not measure learning effort.</CardDescription></CardHeader>
                <CardContent><SessionDurationChart sessions={data.sessions} /></CardContent>
              </Card>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Started</TableHead><TableHead>Runtime</TableHead><TableHead>Checks</TableHead><TableHead>Result</TableHead><TableHead>Session status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {[...data.sessions].reverse().map((session, index) => {
                      const sessionNumber = data.sessions!.length - index;
                      const style = outcomeStyle(session.outcome, session.close_reason);
                      return (
                        <TableRow key={`${session.started_at}-${sessionNumber}`}>
                          <TableCell><DataChip>#{sessionNumber}</DataChip></TableCell>
                          <TableCell>{fmtTimestamp(session.started_at)}</TableCell>
                          <TableCell>{fmtDuration(session.duration_seconds)}</TableCell>
                          <TableCell>{session.check_count || 0}</TableCell>
                          <TableCell>{session.passed == null ? "-" : <Badge className={session.passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-destructive-bg text-destructive"}>{session.passed ? "Passed" : "Failed"}</Badge>}</TableCell>
                          <TableCell><Badge className={style.badgeClass}>{style.label}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No sessions recorded for this lab yet.</div>
          )}
        </div>
      )}
    </StudentLayout>
  );
}
