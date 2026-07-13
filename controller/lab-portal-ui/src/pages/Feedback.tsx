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
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";

interface FeedbackProps {
  user: User;
  labId: string;
  onLogout: () => void;
}

export default function Feedback({ user, labId, onLogout }: FeedbackProps) {
  const [info, setInfo] = useState<FeedbackInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sectionA, setSectionA] = useState("");
  const [sectionBRating, setSectionBRating] = useState(3);
  const [sectionB, setSectionB] = useState("");

  useDocumentTitle("Lab Feedback");

  useEffect(() => {
    getLabFeedback(labId)
      .then((data: FeedbackInfo) => setInfo(data))
      .catch((err: Error) => setError(err.message));
  }, [labId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitFeedback(labId, {
        csrfToken: info!.csrf_token,
        sessionId: info!.session_id,
        sectionA,
        sectionBRating,
        sectionB,
      });
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  }

  if (!info && !error) {
    return (
      <StudentLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-72 w-full" />
      </StudentLayout>
    );
  }

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader title="Lab feedback" breadcrumbs={[{ label: "Labs", href: "/" }, { label: "Feedback" }]} />

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
              This feedback form is part of the thesis evaluation process. Your responses are used
              to improve the lab platform and are <strong>not linked to your grade</strong>.
              Participation is mandatory so we can measure learning outcomes, but individual
              responses remain confidential.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Section A — Reflection</div>
                  <p className="text-sm text-muted-foreground">Free-text reflection on what you learned during this lab.</p>
                </div>
                <Textarea
                  rows={6}
                  value={sectionA}
                  onChange={(e) => setSectionA(e.target.value)}
                  placeholder="What was the most surprising thing you discovered? What would you do differently next time?"
                  required
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Section B — Evaluation</div>
                  <p className="text-sm text-muted-foreground">Rate the clarity of the lab guide and instructions.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Rating (1 = very unclear, 5 = very clear)</Label>
                  <RatingInput value={sectionBRating} onChange={setSectionBRating} />
                </div>
                <p className="text-sm text-muted-foreground">Free-text feedback on what was confusing or could be improved.</p>
                <Textarea
                  rows={4}
                  value={sectionB}
                  onChange={(e) => setSectionB(e.target.value)}
                  placeholder="Which step was hardest to follow? What additional hint would have helped?"
                  required
                />
              </CardContent>
            </Card>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit feedback"}
            </Button>
          </form>
        </>
      )}
    </StudentLayout>
  );
}
