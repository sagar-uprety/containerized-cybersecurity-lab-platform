import { useState, useEffect } from "react";
import type { User, StudentDetail, StudentLabDetail } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import DataChip from "../components/DataChip";
import Link from "../components/Link";
import { navigate } from "../utils/navigate";
import { fmtDuration, fmtTimestamp } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { getInstructorStudentDetail } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstructorStudentDetailProps {
  user: User;
  studentId: string;
  onLogout: () => void;
}

interface GroupSection {
  key: string;
  groupId: number | null;
  groupName: string;
  semester?: string | null;
  labs: StudentLabDetail[];
}

function groupLabs(labs: StudentLabDetail[]): GroupSection[] {
  const sections = new Map<string, GroupSection>();
  for (const lab of labs) {
    const key = lab.group_id != null ? String(lab.group_id) : "ungrouped";
    let section = sections.get(key);
    if (!section) {
      section = {
        key,
        groupId: lab.group_id ?? null,
        groupName: lab.group_name || (lab.group_id != null ? `Group ${lab.group_id}` : "Ungrouped"),
        semester: lab.semester,
        labs: [],
      };
      sections.set(key, section);
    }
    section.labs.push(lab);
  }
  // Real groups sorted by name, "Ungrouped" (legacy rows with no group_id) last.
  return [...sections.values()].sort((a, b) => {
    if (a.groupId == null) return 1;
    if (b.groupId == null) return -1;
    return a.groupName.localeCompare(b.groupName);
  });
}

export default function InstructorStudentDetail({ user, studentId, onLogout }: InstructorStudentDetailProps) {
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideShort, setHideShort] = useState(false);
  const [expandedLabs, setExpandedLabs] = useState<Set<string>>(new Set());

  useDocumentTitle(studentId);

  useEffect(() => {
    setStudent(null);
    setError(null);
    getInstructorStudentDetail(studentId)
      .then(setStudent)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [studentId]);

  const sections = student ? groupLabs(student.labs) : [];
  const totalLabs = student?.labs?.length || 0;
  const passedLabs = student?.labs?.filter((lab) => lab.ever_passed).length || 0;
  const totalSessions = student?.labs?.reduce((acc, l) => acc + (l.total_sessions || 0), 0) || 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={studentId}
        breadcrumbs={[
          { label: "Dashboard", href: "/instructor" },
          { label: "All Students", href: "/instructor/students" },
          { label: studentId },
        ]}
        actions={<DataChip>{studentId}</DataChip>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard value={totalLabs} label="Labs assigned" />
        <StatCard value={passedLabs} label="Passed" description="Historical passes remain after reset" tone="success" />
        <StatCard value={totalSessions} label="Sessions" />
      </div>

      <AlertError message={error} className="mb-6" />

      {!student && !error && <Skeleton className="h-48 w-full" />}

      {student && sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No lab data for this student in any of your groups.
        </div>
      )}

      {student && sections.length > 0 && sections.some((s) =>
        s.labs.some((l) => l.sessions?.some((sess) => sess.duration_seconds && sess.duration_seconds < 60))
      ) && (
        <div className="mb-4 flex items-center gap-2">
          <Checkbox id="hide-short" checked={hideShort} onCheckedChange={(v) => setHideShort(!!v)} />
          <Label htmlFor="hide-short" className="text-sm font-normal text-muted-foreground">Hide sessions under 1 minute</Label>
        </div>
      )}

      {student && sections.map((section) => {
        const sectionPassed = section.labs.filter((lab) => lab.ever_passed).length;
        return (
          <section key={section.key} className="mb-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{section.groupName}</h2>
                {section.semester && <Badge variant="outline">{section.semester}</Badge>}
                <span className="text-sm text-muted-foreground">
                  {section.labs.length} lab{section.labs.length === 1 ? "" : "s"}, {sectionPassed} passed
                </span>
              </div>
              {section.groupId != null && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/instructor/groups/${section.groupId}/students/${studentId}`}>
                    Open in group view <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              )}
            </div>

            {section.labs.map((lab) => {
              const labKey = `${section.key}:${lab.lab_id}`;
              const sessions = hideShort
                ? (lab.sessions || []).filter((s) => !s.duration_seconds || s.duration_seconds >= 60)
                : (lab.sessions || []);
              // Most recent session first (top row = #1), oldest last - matches the
              // numbering GroupSessionDetail expects when looking a session back up.
              const orderedSessions = [...sessions].reverse();
              const currentPassed = lab.latest_check?.passed === true || lab.latest_check?.status === "fixed";
              const isOpen = expandedLabs.has(labKey);

              return (
                <div key={labKey} className="mb-8">
                  <Collapsible
                    open={isOpen}
                    onOpenChange={(open) => {
                      setExpandedLabs((prev) => {
                        const next = new Set(prev);
                        open ? next.add(labKey) : next.delete(labKey);
                        return next;
                      });
                    }}
                  >
                    <CollapsibleTrigger className="mb-3 flex w-full items-center justify-between gap-2 text-left">
                      <span className="flex items-center gap-2">
                        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                        <h3 className="text-base font-semibold text-foreground">{lab.lab_title}</h3>
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
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="space-y-4">
                      <div className="mb-4 overflow-x-auto rounded-lg border border-border">
                        <div className="flex items-center gap-1.5 border-b bg-muted/30 px-4 py-3">
                          <h4 className="text-sm font-semibold">Automated checks</h4>
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
                                // Legacy rows with no group_id use the group-less session
                                // route (same one /instructor/labs/{labId}/{studentId} maps to).
                                const rowHref = section.groupId != null
                                  ? `/instructor/groups/${section.groupId}/students/${studentId}/labs/${lab.lab_id}?session=${sessionIndex}`
                                  : `/instructor/labs/${lab.lab_id}/${studentId}?session=${sessionIndex}`;
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
                </div>
              );
            })}
          </section>
        );
      })}
    </InstructorLayout>
  );
}
