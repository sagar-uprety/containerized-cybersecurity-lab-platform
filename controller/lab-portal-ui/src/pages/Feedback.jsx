import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import { getLabFeedback, submitFeedback } from "../api.js";

export default function Feedback({ user, labId, onLogout }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sectionA, setSectionA] = useState("");
  const [sectionBRating, setSectionBRating] = useState(3);
  const [sectionB, setSectionB] = useState("");

  useEffect(() => {
    getLabFeedback(labId).then(setInfo).catch((err) => setError(err.message));
  }, [labId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitFeedback(labId, {
        csrfToken: info.csrf_token,
        sessionId: info.session_id,
        sectionA,
        sectionBRating,
        sectionB,
      });
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
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
        <a href="/" className="back-link">&larr; Back to overview</a>
        <h1>Lab Feedback</h1>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-muted)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {info?.already_submitted ? (
          <div className="panel submitted-panel">
            <p>Feedback for this lab session has already been submitted. Thank you.</p>
            <p style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
              Session: {info.session_id?.slice(0, 8)}...
            </p>
            <a href="/" className="btn btn-primary" style={{ marginTop: "1rem" }}>
              Return to Overview
            </a>
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
                <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
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
                <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                  Rate the clarity of the lab guide and instructions.
                </p>
                <div className="form-group">
                  <label className="form-label">
                    Rating (1 = very unclear, 5 = very clear)
                  </label>
                  <select
                    value={sectionBRating}
                    onChange={(e) => setSectionBRating(Number(e.target.value))}
                    required
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
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
