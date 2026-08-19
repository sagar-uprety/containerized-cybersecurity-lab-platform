import { useState, useEffect } from "react";
import type { User, EnrollmentOption } from "../types";
import StudentLayout from "../components/StudentLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { getEnrollmentOptions, requestEnrollment } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Enrollment({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [enrollments, setEnrollments] = useState<EnrollmentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrollLoading, setEnrollLoading] = useState<number | null>(null);

  useDocumentTitle("Enrollment");

  useEffect(() => {
    getEnrollmentOptions()
      .then(setEnrollments)
      .catch((err: Error) => setError(err.message));
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

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="Enrollment" description="Request to join any group you need, including several in the same semester. Your instructor approves each request. If two of your groups assign the same lab, you complete it once per group and each result is tracked separately." />

      <AlertError message={error} className="mb-6" />

      {!enrollments && !error && (
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

      {enrollments && enrollments.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No groups are open for enrollment yet.
        </div>
      )}

      {enrollments && enrollments.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((group) => (
            <Card key={group.id}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-foreground">{group.name}</div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {group.semester && <Badge variant="outline">{group.semester}</Badge>}
                    {group.is_active === false && (
                      <Badge className="border-transparent bg-muted text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                </div>
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
                  {group.is_active !== false && !group.status && (
                    <Button size="sm" disabled={enrollLoading === group.id} onClick={() => handleEnroll(group.id)}>
                      {enrollLoading === group.id ? "Requesting…" : "Request to join"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </StudentLayout>
  );
}
