import { useState, useEffect } from "react";
import type { User, FeedbackInfo } from "../types";
import StudentLayout from "../components/StudentLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import DataChip from "../components/DataChip";
import Link from "../components/Link";
import RatingInput from "../components/RatingInput";
import { getLabFeedback, submitFeedback } from "../api";
import { navigate } from "../utils/navigate";
import { showToast } from "../components/Toast";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";

interface FeedbackProps {
  user: User;
  labId: string;
  groupId?: number;
  onLogout: () => void;
}

export default function Feedback({ user, labId, groupId, onLogout }: FeedbackProps) {
  const [info, setInfo] = useState<FeedbackInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(3);
  const [comment, setComment] = useState("");
  const [issueCategory, setIssueCategory] = useState("none");

  useDocumentTitle("Lab Feedback");

  const groupValid = groupId != null && !Number.isNaN(groupId);

  useEffect(() => {
    if (!groupValid) return;
    let cancelled = false;
    setInfo(null);
    setError(null);
    getLabFeedback(labId, groupId!)
      .then((data: FeedbackInfo) => { if (!cancelled) setInfo(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [labId, groupId, groupValid]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupValid) return;
    setSubmitting(true);
    try {
      const result = await submitFeedback(labId, {
        csrfToken: info!.csrf_token,
        sessionId: info!.session_id,
        rating,
        comment,
        issueCategory: issueCategory === "none" ? undefined : issueCategory,
        groupId: groupId!,
      });
      // Show the toast before navigating so it survives the route swap —
      // ToastContainer is mounted once at the app root and persists across pages.
      showToast("Feedback submitted. Thank you!");
      navigate(result?.redirect || "/results");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  }

  function handleSkip() {
    navigate(groupValid ? `/results?group=${groupId}` : "/results");
  }

  if (!groupValid) {
    return (
      <StudentLayout user={user} onLogout={onLogout}>
        <PageHeader title="Lab feedback" breadcrumbs={[{ label: "Labs", href: "/" }, { label: "Feedback" }]} />
        <AlertError message="No group specified for this feedback. Open this page from the lab you just ended." />
      </StudentLayout>
    );
  }

  if (!info && !error) {
    return (
      <StudentLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-72 w-full" />
      </StudentLayout>
    );
  }

  const groupLabel = info?.group?.name && info.group.semester
    ? `${info.group.name} · ${info.group.semester}`
    : info?.group?.name ?? info?.group?.semester ?? undefined;

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Lab feedback"
        breadcrumbs={[{ label: "Labs", href: "/" }, { label: "Feedback" }]}
        actions={groupLabel ? <Badge className="border-transparent bg-muted text-muted-foreground">{groupLabel}</Badge> : undefined}
      />

      <AlertError message={error} className="mb-6" />

      {info?.already_submitted ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground">Feedback for this lab session has already been submitted. Thank you.</p>
            {info.session_id && <DataChip>{info.session_id.slice(0, 8)}…</DataChip>}
            <Button asChild className="mt-2">
              <Link href="/">Return to overview</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert className="mb-6 border-primary/20 bg-accent">
            <Info className="text-primary" />
            <AlertDescription className="text-foreground">
              Quick feedback helps us make this lab better. It's <strong>not linked to your grade</strong>,
              and totally optional. We keep your identity attached only briefly, to stop duplicate
              submissions, then your answers are reviewed without your name on them.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardContent className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Your feedback</h2>
                  <p className="text-sm text-muted-foreground">Rate the clarity of the lab guide and instructions.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Rating (1 = very unclear, 5 = very clear)</Label>
                  <RatingInput value={rating} onChange={setRating} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="feedback-category">Primary issue, if any</Label>
                  <Select value={issueCategory} onValueChange={setIssueCategory}>
                    <SelectTrigger id="feedback-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific issue</SelectItem>
                      <SelectItem value="instructions">Instructions unclear</SelectItem>
                      <SelectItem value="checker">Checker result unexpected</SelectItem>
                      <SelectItem value="environment">Environment problem</SelectItem>
                      <SelectItem value="difficulty">Difficulty or prerequisite gap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">Free-text feedback on what was confusing or could be improved (optional).</p>
                <Textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Which step was hardest to follow? What additional hint would have helped?"
                  maxLength={4000}
                />
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit feedback"}
              </Button>
              <Button type="button" variant="outline" disabled={submitting} onClick={handleSkip}>
                Skip feedback
              </Button>
            </div>
          </form>
        </>
      )}
    </StudentLayout>
  );
}
