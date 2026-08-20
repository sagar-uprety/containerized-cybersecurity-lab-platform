import { useEffect, useMemo, useState } from "react";
import type { GroupDetail, StudentProgress, StudentsProgressEntry, User } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import ProgressRing from "../components/ProgressRing";
import LastActiveBadge from "../components/LastActiveBadge";
import { getGroupDetail, getGroupExportCsvUrl, getGroupProgress, getStudentsProgress } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTime } from "../utils/time";
import { navigate } from "../utils/navigate";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  user: User;
  groupId?: number;
  onLogout: () => void;
}

type ResultRow = (StudentProgress | StudentsProgressEntry) & { groups?: Array<{ id: number; name: string }> };

export default function InstructorResults({ user, groupId, onLogout }: Props) {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Seeded from ?status= so the "Overdue incomplete" stat card on the group
  // detail page can deep-link straight into the filtered view.
  const [status, setStatus] = useState(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    return s && ["needs-review", "overdue", "in-progress", "passed"].includes(s) ? s : "all";
  });

  useDocumentTitle(group ? `Results - ${group.name}` : "Student Results");

  useEffect(() => {
    if (groupId != null) {
      Promise.all([getGroupDetail(groupId), getGroupProgress(groupId)])
        .then(([groupData, progress]) => { setGroup(groupData); setRows(progress.students); })
        .catch((err: Error) => setError(err.message));
    } else {
      getStudentsProgress().then(setRows).catch((err: Error) => setError(err.message));
    }
  }, [groupId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rows || [])
      .filter((row) => !query || (row.email || "").toLowerCase().includes(query) || row.student_id.toLowerCase().includes(query))
      .filter((row) => status === "all" || (status === "passed" && row.labs_assigned > 0 && row.labs_passed === row.labs_assigned) || (status === "needs-review" && (row.review_reasons?.length || 0) > 0) || (status === "overdue" && row.at_risk) || (status === "in-progress" && row.labs_passed < row.labs_assigned && !row.at_risk))
      .sort((a, b) => (b.review_reasons?.length || 0) - (a.review_reasons?.length || 0) || (a.email || a.student_id).localeCompare(b.email || b.student_id));
  }, [rows, search, status]);

  function openStudent(row: ResultRow) {
    // Scoped to one group, stay in that group's view. Unscoped, go to the
    // all-groups page: a student can be in several groups, and picking one
    // here would silently hide the rest.
    if (groupId != null) {
      navigate(`/instructor/groups/${groupId}/students/${row.student_id}`);
      return;
    }
    navigate(`/instructor/students/${row.student_id}`);
  }

  return (
    <InstructorLayout user={user} onLogout={onLogout} groupContext={groupId != null ? { id: groupId, name: group?.name, hasPending: !!group?.pending_members.length } : undefined}>
      <PageHeader
        title={group ? "Student results" : "Student results"}
        description={group ? `Achievement, observable review reasons, and support workflow for ${group.name}.` : "Triage observable support reasons, then inspect criterion and session evidence."}
        breadcrumbs={groupId != null ? [{ label: "Dashboard", href: "/instructor" }, { label: group?.name || "Group", href: `/instructor/groups/${groupId}` }, { label: "Student Results" }] : undefined}
        actions={groupId != null && rows?.length ? <Button asChild variant="outline" size="sm"><a href={getGroupExportCsvUrl(groupId)} download>Export CSV</a></Button> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or ID…" className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="needs-review">Needs review</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="in-progress">In progress</SelectItem>
            <SelectItem value="passed">All labs passed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <AlertError message={error} className="mb-4" />
      {!rows && !error && <Skeleton className="h-96 w-full" />}
      {rows && filtered.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No student results match these filters.</div>}
      {filtered.length > 0 && (
        <Card className="gap-0 divide-y divide-border py-0">
          {filtered.map((row) => {
            const pct = row.labs_assigned > 0 ? Math.round((row.labs_passed / row.labs_assigned) * 100) : 0;
            const overdueLabs = (row.review_reasons || []).filter((r) => r.code === "overdue_incomplete");
            return (
              // The row used to BE the <button>. It can't stay one now that it also hosts
              // an interactive Popover trigger (a <button> can't contain a <button>). Instead
              // the row is a plain positioned container with a full-bleed invisible button
              // ("stretched link" pattern) for the row-level navigation, and the Overdue
              // trigger sits on top of it via z-index so it intercepts its own clicks/keyboard
              // focus independently - the two controls are siblings, never nested.
              <div key={row.student_id} className="relative flex w-full items-center gap-3 p-3 transition-colors hover:bg-accent/40 has-[:focus-visible]:bg-accent/40">
                <button
                  type="button"
                  onClick={() => openStudent(row)}
                  aria-label={`View history for ${row.email || row.student_id}`}
                  className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                />
                <Avatar size="sm" className="pointer-events-none"><AvatarFallback className="bg-accent text-primary">{(row.email || row.student_id).charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="pointer-events-none truncate text-sm font-medium">{row.email || row.student_id}</span>
                    {row.at_risk && (
                      <Popover>
                        <PopoverTrigger
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            badgeVariants(),
                            "relative z-10 cursor-pointer border-transparent bg-destructive-bg text-destructive",
                          )}
                        >
                          <AlertTriangle /> Overdue
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72" onClick={(e) => e.stopPropagation()}>
                          <p className="text-sm font-medium text-foreground">Overdue labs</p>
                          {overdueLabs.length > 0 ? (
                            <ul className="space-y-1 text-sm text-muted-foreground">
                              {overdueLabs.map((reason) => (
                                <li key={reason.lab_id || reason.lab_title}>{reason.lab_title || reason.label}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">No specific lab details available.</p>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <div className="pointer-events-none truncate text-xs text-muted-foreground">{group?.name || row.groups?.map((item) => item.name).join(", ") || row.student_id}</div>
                </div>
                <div className="pointer-events-none grid shrink-0 grid-cols-3 items-center gap-6 text-right text-xs text-muted-foreground">
                  <div><strong className="block text-sm text-foreground">{row.labs_started || 0}/{row.labs_assigned}</strong>Started</div>
                  <div><strong className="block text-sm text-foreground">{fmtTime(row.total_time_seconds)}</strong>Runtime</div>
                  <div><LastActiveBadge ts={row.last_active} /><span className="block">Active</span></div>
                </div>
                <ProgressRing pct={pct} size={44} strokeWidth={4} label={`${row.labs_passed}/${row.labs_assigned}`} />
                <span className="pointer-events-none inline-flex items-center gap-1 text-xs font-medium text-primary">View history <ArrowRight className="size-3.5" /></span>
              </div>
            );
          })}
        </Card>
      )}
    </InstructorLayout>
  );
}
