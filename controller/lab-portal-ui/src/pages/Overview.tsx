import { useState, useEffect, useMemo } from "react";
import type { User, Lab } from "../types";
import StudentLayout from "../components/StudentLayout";
import StatusBadge from "../components/StatusBadge";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import Link from "../components/Link";
import { getLabs } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTimestamp } from "../utils/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Overview({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");

  useDocumentTitle("Assigned Labs");

  useEffect(() => {
    getLabs()
      .then(setLabs)
      .catch((err: Error) => setError(err.message));
  }, []);

  // A student may now belong to several groups; derive the filter's options from whatever
  // groups actually appear in the assignments, rather than a separate API call.
  const groupOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const lab of labs ?? []) {
      if (lab.group.id != null && !seen.has(lab.group.id)) {
        seen.set(lab.group.id, groupLabel(lab.group));
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [labs]);

  const filteredLabs = useMemo(() => {
    if (groupFilter === "all") return labs ?? [];
    const gid = Number(groupFilter);
    return (labs ?? []).filter((lab) => lab.group.id === gid);
  }, [labs, groupFilter]);

  const isPastDue = (lab: Lab) =>
    Boolean(lab.deadline && new Date(lab.deadline).getTime() < Date.now());

  const activeLabs = filteredLabs.filter((lab) => !isPastDue(lab));
  const pastLabs = filteredLabs.filter(isPastDue);

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="Assigned Labs" description="Start, monitor, and submit feedback for the labs your instructors have assigned to you." />

      <AlertError message={error} className="mb-6" />

      {!labs && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {labs && labs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No labs have been assigned yet. Visit Enrollment to join a group.
        </div>
      )}

      {labs && labs.length > 0 && (
        <>
          {groupOptions.length > 1 && (
            <div className="mb-6 flex items-center gap-2">
              <Label htmlFor="group-filter" className="text-sm text-muted-foreground">Group</Label>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger id="group-filter" size="sm" className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groupOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Active labs</h2>
            {activeLabs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No active labs right now - see Past labs below.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeLabs.map((lab) => (
                  <LabCard key={lab.assignment_id} lab={lab} pastDue={false} />
                ))}
              </div>
            )}
          </section>

          {pastLabs.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Past labs</h2>
              <p className="mb-3 -mt-2 text-sm text-muted-foreground">Deadline has passed. Shown for reference only.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastLabs.map((lab) => (
                  <LabCard key={lab.assignment_id} lab={lab} pastDue={true} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </StudentLayout>
  );
}

function groupLabel(group: Lab["group"]): string {
  if (group.name && group.semester) return `${group.name} · ${group.semester}`;
  return group.name ?? group.semester ?? "Group";
}

function LabCard({ lab, pastDue }: { lab: Lab; pastDue: boolean }) {
  const groupArchived = lab.group.is_archived === true;
  return (
    <Card className={cn((pastDue || groupArchived) && "bg-muted/40")}>
      <CardContent className="flex h-full flex-col items-start gap-3">
        <div className="flex w-full items-start justify-between gap-2">
          <span className="font-medium text-foreground">{lab.title}</span>
          <StatusBadge status={lab.status} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{lab.difficulty}</Badge>
          {(lab.group.name || lab.group.semester) && (
            <Badge className="border-transparent bg-muted text-muted-foreground">
              {groupLabel(lab.group)}
            </Badge>
          )}
          {groupArchived && (
            <Badge className="border-transparent bg-muted text-muted-foreground">
              Group archived
            </Badge>
          )}
          {lab.deadline && <DeadlineBadge deadline={lab.deadline} />}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {lab.story?.situation}
        </p>
        <Button asChild size="sm" variant={pastDue ? "outline" : "default"} className="mt-auto">
          <Link href={`/labs/${lab.id}?group=${lab.group.id}`}>Open lab</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const d = new Date(deadline);
  const now = new Date();
  const hoursLeft = (d.getTime() - now.getTime()) / 3600000;
  const passed = hoursLeft < 0;
  const urgent = hoursLeft < 24 && hoursLeft > 0;
  const formatted = fmtTimestamp(deadline);

  return (
    <Badge
      className={cn(
        "border-transparent",
        passed || urgent
          ? "bg-destructive-bg text-destructive"
          : "bg-muted text-muted-foreground",
      )}
    >
      {passed ? `Deadline passed ${formatted}` : `Due ${formatted}`}
    </Badge>
  );
}
