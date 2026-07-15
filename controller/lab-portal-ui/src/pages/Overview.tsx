import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";

export default function Overview({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("My Labs");

  useEffect(() => {
    getLabs()
      .then(setLabs)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="My labs" description="Start, monitor, and submit feedback for your assigned labs." />

      <AlertError message={error} className="mb-6" />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Your labs</h2>

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labs.map((lab) => {
              const deadlinePassed = Boolean(
                lab.deadline && new Date(lab.deadline).getTime() < Date.now(),
              );
              const groupInactive = lab.group?.is_active === false;
              return (
                <Card key={lab.id} className={cn((deadlinePassed || groupInactive) && "bg-muted/40")}>
                  <CardContent className="flex h-full flex-col items-start gap-3">
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{lab.title}</span>
                      <StatusBadge status={lab.status} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">{lab.difficulty}</Badge>
                      {(lab.group?.semester || lab.group?.name) && (
                        <Badge className="border-transparent bg-muted text-muted-foreground">
                          {lab.group?.semester ?? lab.group?.name}
                        </Badge>
                      )}
                      {groupInactive && (
                        <Badge className="border-transparent bg-muted text-muted-foreground">
                          Group inactive
                        </Badge>
                      )}
                      {lab.deadline && <DeadlineBadge deadline={lab.deadline} />}
                    </div>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {lab.story?.situation}
                    </p>
                    {!deadlinePassed && (
                      <Button asChild size="sm" className="mt-auto">
                        <Link href={`/labs/${lab.id}`}>Open lab</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
