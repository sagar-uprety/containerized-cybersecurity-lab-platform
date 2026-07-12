import { useState, useEffect } from "react";
import type { User, FeedbackInfo } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import Breadcrumbs from "../components/Breadcrumbs";
import Link from "../components/Link";
import RatingInput from "../components/RatingInput";
import { getLabFeedback, submitFeedback } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";

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
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </>
    );
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Breadcrumbs items={[{ label: "Labs", href: "/" }, { label: "Feedback" }]} />
        <h1>Lab Feedback</h1>

        <AlertError message={error} />

        {info?.already_submitted ? (
          <div className="panel submitted-panel">
            <p>Feedback for this lab session has already been submitted. Thank you.</p>
            <p className="text-mono-data">
              Session: {info.session_id?.slice(0, 8)}...
            </p>
            <Link href="/" className="btn btn-primary mb-0" style={{ marginTop: "var(--sp-4)" }}>
              Return to Overview
            </Link>
          </div>
        ) : (
          <>
            <div className="ethical-notice">
              This feedback form is part of the thesis evaluation process. Your responses are used
              to improve the lab platform and are <strong>not linked to your grade</strong>.
              Participation is mandatory so we can measure learning outcomes, but individual
              responses remain confidential.
            </div>

            <form onSubmit={handleSubmit}>
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Section A &mdash; Reflection</span>
                </div>
                <p className="text-sm-muted">
                  Free-text reflection on what you learned during this lab.
                </p>
                <div className="form-group">
                  <textarea
                    rows={6}
                    value={sectionA}
                    onChange={(e) => setSectionA(e.target.value)}
                    placeholder="What was the most surprising thing you discovered? What would you do differently next time?"
                    required
                  />
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Section B &mdash; Evaluation</span>
                </div>
                <p className="text-sm-muted">
                  Rate the clarity of the lab guide and instructions.
                </p>
                <div className="form-group">
                  <label className="form-label">
                    Rating (1 = very unclear, 5 = very clear)
                  </label>
                  <RatingInput
                    value={sectionBRating}
                    onChange={setSectionBRating}
                  />
                </div>
                <p className="text-sm-muted">
                  Free-text feedback on what was confusing or could be improved.
                </p>
                <div className="form-group">
                  <textarea
                    rows={4}
                    value={sectionB}
                    onChange={(e) => setSectionB(e.target.value)}
                    placeholder="Which step was hardest to follow? What additional hint would have helped?"
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
