import { useState, useEffect } from "react";
import type { User, Lab, EnrollmentOption } from "../types";
import StudentLayout from "../components/StudentLayout";
import StatusBadge from "../components/StatusBadge";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import Link from "../components/Link";
import { getLabs, getEnrollmentOptions, requestEnrollment } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTimestamp } from "../utils/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Overview({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrollLoading, setEnrollLoading] = useState<number | null>(null);

  useDocumentTitle("My Labs");

  useEffect(() => {
    Promise.all([
      getLabs().catch((err: Error) => { setError(err.message); return null; }),
      getEnrollmentOptions().catch(() => [] as EnrollmentOption[]),
    ]).then(([labsData, enrollData]) => {
      if (labsData) setLabs(labsData);
      setEnrollments(enrollData);
    });
  }, []);

  async function handleEnroll(groupId: number) {
    setEnrollLoading(groupId);
    setError(null);
    try {
      await requestEnrollment(groupId);
      const updated = await getEnrollmentOptions();
      setEnrollments(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrollLoading(null);
    }
  }

  const hasApprovedGroup =
    enrollments != null && enrollments.some((e) => e.status === "approved");

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="My labs" description="Start, monitor, and submit feedback for your assigned labs." />

      <AlertError message={error} className="mb-6" />

      {enrollments && enrollments.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-foreground">Available enrollments</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Request to join a group to access its labs. Your instructor will approve your request.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((group) => (
              <Card key={group.id}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="font-medium text-foreground">{group.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {group.member_count} member{group.member_count !== 1 ? "s" : ""}
                  </div>
                  <div className="mt-auto">
                    {group.status === "approved" && (
                      <Badge className="border-transparent bg-success-bg text-success">Enrolled</Badge>
                    )}
                    {group.status === "pending" && (
                      <Badge className="border-transparent bg-warning-bg text-warning">Pending approval</Badge>
                    )}
                    {!group.status && (
                      <Button size="sm" disabled={enrollLoading === group.id} onClick={() => handleEnroll(group.id)}>
                        {enrollLoading === group.id ? "Requesting…" : "Request to join"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{hasApprovedGroup ? "Your labs" : "Available labs"}</h2>

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
            {hasApprovedGroup
              ? "No labs have been assigned to your group yet."
              : "Join a group above to see available labs."}
          </div>
        )}

        {labs && labs.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labs.map((lab) => (
              <Card key={lab.id}>
                <CardContent className="flex h-full flex-col items-start gap-3">
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{lab.title}</span>
                    <StatusBadge status={lab.status} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{lab.difficulty}</Badge>
                    {lab.deadline && <DeadlineBadge deadline={lab.deadline} />}
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{lab.story?.situation}</p>
                  <Button asChild size="sm" className="mt-auto">
                    <Link href={`/labs/${lab.id}`}>Open lab</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </StudentLayout>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const d = new Date(deadline);
  const now = new Date();
  const hoursLeft = (d.getTime() - now.getTime()) / 3600000;
  const urgent = hoursLeft < 24 && hoursLeft > 0;
  const formatted = fmtTimestamp(deadline);

  return (
    <Badge className={cn("border-transparent", urgent ? "bg-destructive-bg text-destructive" : "bg-muted text-muted-foreground")}>
      Due {formatted}
    </Badge>
  );
}
