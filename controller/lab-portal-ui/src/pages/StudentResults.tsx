import { useState, useEffect } from "react";
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
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("My Results");

  useEffect(() => {
    getStudentResults()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Lab</TableHead>
                  <TableHead>Difficulty</TableHead>
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
                    key={lab.lab_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => navigate(`/results/${lab.lab_id}`)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/results/${lab.lab_id}`); } }}
                  >
                    <TableCell className="font-medium text-foreground">{lab.lab_title}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{lab.difficulty}</Badge></TableCell>
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
