import { useState, useEffect, useRef } from "react";
import type { User, StudentResultsData } from "../types";
import StudentLayout from "../components/StudentLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import LastActiveBadge from "../components/LastActiveBadge";
import { getStudentResults } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTime } from "../utils/time";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { navigate } from "../utils/navigate";

interface Props {
  user: User;
  onLogout: () => void;
}

const RESULT_BADGE: Record<string, string> = {
  passed: "border-transparent bg-success-bg text-success",
  failed: "border-transparent bg-destructive-bg text-destructive",
  not_attempted: "",
};

const RESULT_LABEL: Record<string, string> = {
  passed: "Passed",
  failed: "Not passed yet",
  not_attempted: "Not attempted",
};

export default function StudentResults({ user, onLogout }: Props) {
  const [data, setData] = useState<StudentResultsData | null>(null);
  const [groupOptions, setGroupOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [groupFilter, setGroupFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const optionsSeeded = useRef(false);

  useDocumentTitle("My Results");

  useEffect(() => {
    const gid = groupFilter === "all" ? undefined : Number(groupFilter);
    getStudentResults(gid)
      .then((d) => {
        setData(d);
        // The group options only reflect the truth on the unfiltered (first) fetch -
        // a filtered fetch only has labs from one group, so never reseed from it.
        if (!optionsSeeded.current) {
          const seen = new Map<number, string>();
          for (const lab of d.labs) {
            if (!seen.has(lab.group_id)) {
              seen.set(lab.group_id, lab.semester ? `${lab.group_name} · ${lab.semester}` : lab.group_name);
            }
          }
          setGroupOptions([...seen.entries()].map(([id, label]) => ({ id, label })));
          optionsSeeded.current = true;
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [groupFilter]);

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="My results" description="How you've done across every lab you've been assigned." />

      <AlertError message={error} className="mb-6" />

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard icon={CheckCircle2} label="Labs passed" value={`${data.total_passed} / ${data.total_labs}`} tone="success" />
            <StatCard label="Sessions tried" value={data.total_sessions} />
            <StatCard label="Recorded runtime" value={fmtTime(data.total_time_seconds)} />
          </div>

          {groupOptions.length > 1 && (
            <div className="mb-4 flex items-center gap-2">
              <Label htmlFor="results-group-filter" className="text-sm text-muted-foreground">Group</Label>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger id="results-group-filter" size="sm" className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groupOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Lab</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Recorded runtime</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.labs.map((lab) => (
                  <TableRow
                    key={lab.assignment_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => navigate(`/results/${lab.lab_id}?group=${lab.group_id}`)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/results/${lab.lab_id}?group=${lab.group_id}`); } }}
                  >
                    <TableCell className="font-medium text-foreground">{lab.lab_title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lab.semester ? `${lab.group_name} · ${lab.semester}` : lab.group_name}</TableCell>
                    <TableCell>
                      {RESULT_BADGE[lab.result] ? (
                        <Badge className={RESULT_BADGE[lab.result]}>{RESULT_LABEL[lab.result]}</Badge>
                      ) : (
                        <Badge variant="outline">{RESULT_LABEL[lab.result]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{lab.sessions_attempted}</TableCell>
                    <TableCell className="text-sm text-foreground">{fmtTime(lab.total_time_seconds)}</TableCell>
                    <TableCell><LastActiveBadge ts={lab.last_active} /></TableCell>
                    <TableCell className="text-right"><span className="inline-flex items-center gap-1 text-sm font-medium text-primary">View sessions <ArrowRight className="size-3.5" /></span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </StudentLayout>
  );
}
