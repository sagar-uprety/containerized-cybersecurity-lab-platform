import { useState, useEffect } from "react";
import type { User, GroupDetail, StudentDetail, GroupMember, PendingMember } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import DataChip from "../components/DataChip";
import { navigate } from "../utils/navigate";
import { fmtDuration, fmtTimestamp } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { getGroupDetail, getInstructorStudentDetail } from "../api";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight } from "lucide-react";

interface InstructorGroupStudentDetailProps {
  user: User;
  groupId: number;
  studentId: string;
  onLogout: () => void;
}

export default function InstructorGroupStudentDetail({ user, groupId, studentId, onLogout }: InstructorGroupStudentDetailProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideShort, setHideShort] = useState(false);

  const memberInfo: (GroupMember & Partial<PendingMember>) | undefined =
    group?.approved_members?.find((m) => m.student_id === studentId)
    || group?.pending_members?.find((m) => m.student_id === studentId);

  useDocumentTitle(memberInfo?.email || studentId);

  useEffect(() => {
    Promise.all([
      getGroupDetail(groupId),
      getInstructorStudentDetail(studentId),
    ]).then(([g, s]: [GroupDetail, StudentDetail]) => {
      setGroup(g);
      const groupLabIds = new Set(g.labs.map((l) => l.lab_id));
      const filteredLabs = s.labs.filter((l) => groupLabIds.has(l.lab_id));
      setStudent({ ...s, labs: filteredLabs });
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [groupId, studentId]);

  const totalSessions = student?.labs?.reduce((acc, l) => acc + (l.total_sessions || 0), 0) || 0;
  const passedLabs = student?.labs?.filter((l) => {
    const c = l.latest_check;
    return c && (c.passed === true || c.status === "fixed");
  }).length || 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={memberInfo?.email || studentId}
        breadcrumbs={[
          { label: "Dashboard", href: "/instructor" },
          { label: group?.name || "Group", href: `/instructor/groups/${groupId}` },
          { label: memberInfo?.email || studentId },
        ]}
        actions={
          <>
            {memberInfo?.semester && <Badge variant="outline">{memberInfo.semester}</Badge>}
            {memberInfo?.study_program && <Badge variant="outline">{memberInfo.study_program}</Badge>}
            <DataChip>{studentId}</DataChip>
          </>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard value={student?.labs?.length || 0} label="Labs assigned" />
        <StatCard value={passedLabs} label="Passed" tone="success" />
        <StatCard value={totalSessions} label="Sessions" />
      </div>

      <AlertError message={error} className="mb-6" />

      {!student && !error && <Skeleton className="h-48 w-full" />}

      {student && student.labs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No lab data for this student in this group.
        </div>
      )}

      {student && student.labs.some((l) => l.sessions?.some((s) => s.duration_seconds && s.duration_seconds < 60)) && (
        <div className="mb-4 flex items-center gap-2">
          <Checkbox id="hide-short" checked={hideShort} onCheckedChange={(v) => setHideShort(!!v)} />
          <Label htmlFor="hide-short" className="text-sm font-normal text-muted-foreground">Hide sessions under 1 minute</Label>
        </div>
      )}

      {student && student.labs.map((lab) => {
        const sessions = hideShort
          ? (lab.sessions || []).filter((s) => !s.duration_seconds || s.duration_seconds >= 60)
          : (lab.sessions || []);
        const passed = lab.latest_check?.passed === true || lab.latest_check?.status === "fixed";

        return (
          <section key={lab.lab_id} className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">{lab.lab_title}</h2>
              {lab.latest_check ? (
                <Badge className={passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-destructive-bg text-destructive"}>
                  {passed ? "Passed" : lab.latest_check.status?.toUpperCase() || "Failed"}
                </Badge>
              ) : (
                <Badge variant="outline">Not attempted</Badge>
              )}
            </div>

            {sessions.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Session</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Checks</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((sess, i) => {
                      const sessionIndex = (lab.sessions || []).length - (lab.sessions || []).indexOf(sess);
                      const rowHref = `/instructor/groups/${groupId}/students/${studentId}/labs/${lab.lab_id}?session=${sessionIndex}`;
                      const style = outcomeStyle(sess.outcome);
                      return (
                        <TableRow
                          key={i}
                          className="cursor-pointer"
                          tabIndex={0}
                          onClick={() => navigate(rowHref)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(rowHref); } }}
                        >
                          <TableCell><DataChip>#{sessionIndex}</DataChip></TableCell>
                          <TableCell className="text-sm text-foreground">{fmtTimestamp(sess.started_at)}</TableCell>
                          <TableCell className="text-sm text-foreground">{fmtDuration(sess.duration_seconds)}</TableCell>
                          <TableCell className="text-sm text-foreground">{sess.check_count || 0}</TableCell>
                          <TableCell><Badge className={style.badgeClass}>{style.label}</Badge></TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1 text-sm text-primary">
                              Details <ArrowRight className="size-3" />
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {hideShort ? "All sessions under 1 minute (hidden)." : "No sessions recorded."}
              </div>
            )}
          </section>
        );
      })}
    </InstructorLayout>
  );
}
