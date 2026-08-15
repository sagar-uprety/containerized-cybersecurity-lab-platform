import { useState, useEffect } from "react";
import type { User, InstructorFeedbackSummary } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { getInstructorFeedback, getInstructorLabDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTimestamp } from "../utils/time";
import { Star, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Props {
  user: User;
  labId: string;
  onLogout: () => void;
}

const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  instructions: "Instructions unclear",
  checker: "Checker result unexpected",
  environment: "Environment problem",
  difficulty: "Difficulty or prerequisite gap",
};

export default function InstructorFeedback({ user, labId, onLogout }: Props) {
  const [summary, setSummary] = useState<InstructorFeedbackSummary | null>(null);
  const [labTitle, setLabTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(labTitle ? `Feedback - ${labTitle}` : "Lab Feedback");

  useEffect(() => {
    setSummary(null);
    setError(null);
    Promise.all([getInstructorFeedback(labId), getInstructorLabDetail(labId)])
      .then(([feedback, detail]) => {
        setSummary(feedback);
        setLabTitle(detail.scenario.title);
      })
      .catch((err: Error) => setError(err.message));
  }, [labId]);

  const breadcrumbs = [
    { label: "Dashboard", href: "/instructor" },
    { label: labTitle || labId, href: `/instructor/labs/${labId}` },
    { label: "Feedback" },
  ];

  if (error && !summary) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <PageHeader title="Lab feedback" breadcrumbs={breadcrumbs} />
        <AlertError message={error} />
      </InstructorLayout>
    );
  }

  if (!summary) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-48 w-full" />
      </InstructorLayout>
    );
  }

  const maxRatingCount = Math.max(1, ...Object.values(summary.rating_distribution || {}));
  const maxCategoryCount = Math.max(1, ...Object.values(summary.issue_categories || {}));
  const belowThreshold = summary.feedback_count > 0 && summary.rating_distribution === null;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Lab feedback"
        description={labTitle || undefined}
        breadcrumbs={breadcrumbs}
        actions={<Badge variant="outline">{summary.feedback_count} response{summary.feedback_count !== 1 ? "s" : ""}</Badge>}
      />

      {summary.feedback_count === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No feedback submitted for this lab yet.
        </div>
      )}

      {belowThreshold && (
        <Alert className="mb-6 border-primary/20 bg-accent">
          <Info className="text-primary" />
          <AlertDescription className="text-foreground">
            {summary.feedback_count} response{summary.feedback_count !== 1 ? "s" : ""} submitted so far, but ratings
            and comments are only shown once at least 5 students have responded - this protects individual students
            from being identifiable in a small group.
          </AlertDescription>
        </Alert>
      )}

      {summary.feedback_count > 0 && !belowThreshold && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Average clarity rating</h2>
                  <div className="flex items-center gap-1 text-lg font-semibold text-foreground">
                    <Star className="size-4.5 fill-warning text-warning" />
                    {summary.feedback_average ?? "-"}
                    <span className="text-sm font-normal text-muted-foreground">/5</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((score) => {
                    const count = summary.rating_distribution?.[String(score)] ?? 0;
                    return (
                      <div key={score} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-3 text-right">{score}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(count / maxRatingCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-5 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Reported issues</h2>
                {!summary.issue_categories || Object.keys(summary.issue_categories).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No specific issue category was reported.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(summary.issue_categories)
                      .sort(([, a], [, b]) => b - a)
                      .map(([category, count]) => (
                        <div key={category} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="w-36 shrink-0 truncate text-foreground">
                            {ISSUE_CATEGORY_LABELS[category] || category}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-warning"
                              style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-5 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Comments</h2>
            {summary.responses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No free-text comments were submitted.</p>
            ) : (
              <div className="space-y-3">
                {summary.responses.map((response) => (
                  <Card key={response.response_id}>
                    <CardContent className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {response.issue_category && (
                            <Badge className={cn("border-transparent bg-warning-bg text-warning")}>
                              {ISSUE_CATEGORY_LABELS[response.issue_category] || response.issue_category}
                            </Badge>
                          )}
                          {response.synthetic && <Badge variant="outline">Demo data</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtTimestamp(response.timestamp)}</span>
                      </div>
                      <p className="text-sm text-foreground">{response.comment}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorLayout>
  );
}
