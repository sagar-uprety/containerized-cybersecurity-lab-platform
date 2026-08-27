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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowRight, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [expandedLabs, setExpandedLabs] = useState<Set<string>>(new Set());

  const memberInfo: (GroupMember & Partial<PendingMember>) | undefined =
    group?.approved_members?.find((m) => m.student_id === studentId)
    || group?.pending_members?.find((m) => m.student_id === studentId);

  useDocumentTitle(memberInfo?.email || studentId);

  useEffect(() => {
    Promise.all([
      getGroupDetail(groupId),
      getInstructorStudentDetail(studentId, groupId),
    ]).then(([g, s]: [GroupDetail, StudentDetail]) => {
      setGroup(g);
      const groupLabIds = new Set(g.labs.map((l) => l.lab_id));
      const filteredLabs = s.labs.filter((l) => groupLabIds.has(l.lab_id));
      setStudent({ ...s, labs: filteredLabs });
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [groupId, studentId]);

  const totalSessions = student?.labs?.reduce((acc, l) => acc + (l.total_sessions || 0), 0) || 0;
  const passedLabs = student?.labs?.filter((lab) => lab.ever_passed).length || 0;
  const checksSubmitted = student?.labs?.reduce((total, lab) => total + (lab.checks_submitted || 0), 0) || 0;

  // Join group deadlines and review reasons missing from StudentLabDetail.
  const deadlineByLab = new Map((group?.labs || []).map((gl) => [gl.lab_id, gl.deadline]));
  const now = Date.now();
  function labDeadline(lab: StudentDetail["labs"][number]): string | undefined {
    return deadlineByLab.get(lab.lab_id);
  }
  function isOverdue(lab: StudentDetail["labs"][number]): boolean {
    const deadline = labDeadline(lab);
    return !!deadline && new Date(deadline).getTime() < now && !lab.ever_passed;
  }
  const overdueCount = student?.labs?.filter(isOverdue).length || 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout} groupContext={{ id: groupId, name: group?.name, hasPending: !!group?.pending_members.length }}>
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

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard value={student?.labs?.length || 0} label="Labs assigned" />
        <StatCard value={passedLabs} label="Passed before" description="Historical passes remain after reset" tone="success" />
        <StatCard
          icon={overdueCount > 0 ? AlertTriangle : undefined}
          value={overdueCount}
          label="Overdue labs"
          description={overdueCount > 0 ? "Deadline passed, not yet passed" : "None past deadline"}
          tone={overdueCount > 0 ? "danger" : "default"}
        />
        <StatCard value={checksSubmitted} label="Student checks" />
        <StatCard value={totalSessions} label="Recorded sessions" />
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
        // Most recent session first (top row = #1), oldest last - matches the
        // numbering GroupSessionDetail expects when looking a session back up.
        const orderedSessions = [...sessions].reverse();
        const currentPassed = lab.latest_check?.passed === true || lab.latest_check?.status === "fixed";
        const isOpen = expandedLabs.has(lab.lab_id);
        const deadline = labDeadline(lab);
        const overdue = isOverdue(lab);

        return (
          <section key={lab.lab_id} className="mb-8">
            <Collapsible
              open={isOpen}
              onOpenChange={(open) => {
                setExpandedLabs((prev) => {
                  const next = new Set(prev);
                  open ? next.add(lab.lab_id) : next.delete(lab.lab_id);
                  return next;
                });
              }}
            >
              <CollapsibleTrigger className="mb-3 flex w-full items-center justify-between gap-2 text-left">
                <span className="flex items-center gap-2">
                  <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <h2 className="text-lg font-semibold text-foreground">{lab.lab_title}</h2>
                </span>
                <div className="flex flex-wrap gap-2">
                  <Badge className={lab.ever_passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-muted text-muted-foreground"}>
                    {lab.ever_passed ? "Passed before" : "No pass recorded"}
                  </Badge>
                  {lab.latest_check ? (
                    <Badge className={currentPassed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-warning-bg text-warning"}>
                      Latest result: {currentPassed ? "passes" : lab.latest_check.status || "fails"}
                    </Badge>
                  ) : <Badge variant="outline">Latest result: not checked</Badge>}
                  {overdue && (
                    <Badge className="gap-1 border-transparent bg-destructive-bg text-destructive">
                      <AlertTriangle className="size-3" /> Overdue - due {fmtTimestamp(deadline)}
                    </Badge>
                  )}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4">
            <div className="mb-4 overflow-x-auto rounded-lg border border-border">
              <div className="flex items-center gap-1.5 border-b bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-semibold">Automated checks</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="What is this table?">
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-normal text-left">
                    Each row is one automated check from this lab&apos;s scenario definition. An Objective verifies the fix; a Guardrail confirms normal functionality still works.
                    Passed before is historical and survives a reset - Latest result only reflects the most recent session.
                    Attempt history counts every logged run of this check, how many failed, and how many failures happened before the first success.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Automated check</TableHead><TableHead>Purpose</TableHead><TableHead>Passed before</TableHead><TableHead>Latest result</TableHead><TableHead>Attempt history</TableHead><TableHead>First passed</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(lab.criteria || []).map((criterion) => (
                    <TableRow key={criterion.name}>
                      <TableCell className="font-medium">{criterion.label}</TableCell>
                      <TableCell><Badge variant="outline">{criterion.kind === "guardrail" ? "Guardrail" : "Objective"}</Badge></TableCell>
                      <TableCell><Badge className={criterion.ever_passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-muted text-muted-foreground"}>{criterion.ever_passed ? "Yes" : "Not yet"}</Badge></TableCell>
                      <TableCell>{criterion.current_passed == null ? <span className="text-muted-foreground">Not checked</span> : <Badge className={criterion.current_passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-warning-bg text-warning"}>{criterion.current_passed ? "Pass" : criterion.ever_passed ? "Fail after earlier pass" : criterion.current_state || "Fail"}</Badge>}</TableCell>
                      <TableCell className="text-sm text-foreground">{criterion.total_checks} attempt{criterion.total_checks === 1 ? "" : "s"} · {criterion.failed_checks} failed · {criterion.failures_before_achievement} before success</TableCell>
                      <TableCell>{criterion.first_pass_at ? fmtTimestamp(criterion.first_pass_at) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {orderedSessions.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-20">Session</TableHead>
                      <TableHead className="w-40">Started</TableHead>
                      <TableHead className="w-24">Runtime</TableHead>
                      <TableHead className="w-28">Saved results</TableHead>
                      <TableHead className="w-28">Result</TableHead>
                      <TableHead className="w-28">Session status</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedSessions.map((sess, i) => {
                      const sessionIndex = (lab.sessions || []).length - (lab.sessions || []).indexOf(sess);
                      const rowHref = `/instructor/groups/${groupId}/students/${studentId}/labs/${lab.lab_id}?session=${sessionIndex}`;
                      const style = outcomeStyle(sess.outcome, sess.close_reason);
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
                          <TableCell className="text-sm text-foreground">
                            {sess.student_check_count} student
                            <span className="block text-xs text-muted-foreground">{sess.automatic_check_count} automatic</span>
                          </TableCell>
                          <TableCell>
                            {sess.passed == null ? (
                              <span className="text-sm text-muted-foreground">-</span>
                            ) : (
                              <Badge className={sess.passed ? "border-transparent bg-success-bg text-success" : "border-transparent bg-destructive-bg text-destructive"}>
                                {sess.passed ? "Passed" : "Failed"}
                              </Badge>
                            )}
                          </TableCell>
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
              </CollapsibleContent>
            </Collapsible>
          </section>
        );
      })}
    </InstructorLayout>
  );
}
