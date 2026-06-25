import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import { getInstructorLabDetail } from "../api.js";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function InstructorLabDetail({ user, labId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getInstructorLabDetail(labId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [labId]);

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <a href="/instructor" className="back-link" onClick={(e) => { e.preventDefault(); nav("/instructor"); }}>
            &larr; Back to Dashboard
          </a>
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)" }}>{error}</div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </>
    );
  }

  const { scenario, feedback_count } = data;
  const docs = scenario.documentation || {};

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/instructor" className="back-link" onClick={(e) => { e.preventDefault(); window.history.back(); }}>
          &larr; Back to Group
        </a>

        <h1>{scenario.title}</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {scenario.difficulty && <span className="badge">{scenario.difficulty}</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {docs.student_guide_url && (
            <a href={docs.student_guide_url} target="_blank" rel="noreferrer" className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0, textDecoration: "none", color: "var(--ink)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Lab Guide</div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Student-facing guide with discovery steps and hints</div>
              </div>
              <span style={{ color: "var(--tum-blue)", fontSize: "0.85rem" }}>Open &rarr;</span>
            </a>
          )}

          {docs.solution_guide_url && (
            <a href={docs.solution_guide_url} target="_blank" rel="noreferrer" className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0, textDecoration: "none", color: "var(--ink)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Solution Guide</div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Full remediation steps (instructor only)</div>
              </div>
              <span style={{ color: "var(--tum-blue)", fontSize: "0.85rem" }}>Open &rarr;</span>
            </a>
          )}

          {docs.instructor_guide_url && (
            <a href={docs.instructor_guide_url} target="_blank" rel="noreferrer" className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0, textDecoration: "none", color: "var(--ink)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Instructor Guide</div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Teaching notes, common mistakes, hint policy</div>
              </div>
              <span style={{ color: "var(--tum-blue)", fontSize: "0.85rem" }}>Open &rarr;</span>
            </a>
          )}

          {feedback_count > 0 && (
            <a href={`/api/instructor/feedback/${labId}`} target="_blank" rel="noreferrer" className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0, textDecoration: "none", color: "var(--ink)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Student Feedback</div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{feedback_count} response{feedback_count !== 1 ? "s" : ""} submitted</div>
              </div>
              <span style={{ color: "var(--tum-blue)", fontSize: "0.85rem" }}>View &rarr;</span>
            </a>
          )}
        </div>
      </div>
    </>
  );
}
