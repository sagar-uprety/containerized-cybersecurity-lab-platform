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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [status, setStatus] = useState("all");

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
            return (
              <button key={row.student_id} type="button" onClick={() => openStudent(row)} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none">
                <Avatar size="sm"><AvatarFallback className="bg-accent text-primary">{(row.email || row.student_id).charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.email || row.student_id}</span>
                    {row.at_risk && <Badge className="border-transparent bg-destructive-bg text-destructive"><AlertTriangle /> Overdue</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{group?.name || row.groups?.map((item) => item.name).join(", ") || row.student_id}</div>
                </div>
                <div className="grid shrink-0 grid-cols-3 items-center gap-6 text-right text-xs text-muted-foreground">
                  <div><strong className="block text-sm text-foreground">{row.labs_started || 0}/{row.labs_assigned}</strong>Started</div>
                  <div><strong className="block text-sm text-foreground">{fmtTime(row.total_time_seconds)}</strong>Runtime</div>
                  <div><LastActiveBadge ts={row.last_active} /><span className="block">Active</span></div>
                </div>
                <ProgressRing pct={pct} size={44} strokeWidth={4} label={`${row.labs_passed}/${row.labs_assigned}`} />
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">View history <ArrowRight className="size-3.5" /></span>
              </button>
            );
          })}
        </Card>
      )}
    </InstructorLayout>
  );
}
