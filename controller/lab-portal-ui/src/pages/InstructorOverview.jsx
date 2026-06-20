import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import { getInstructorLabs } from "../api.js";

export default function InstructorOverview({ user, onLogout }) {
  const [labs, setLabs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getInstructorLabs()
      .then(setLabs)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Welcome, Instructor</h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
          Monitor lab sessions, track student progress, and access lab guides.
        </p>

        <div className="toolbar" style={{ marginBottom: "1.5rem" }}>
          <a href="/instructor/search" className="btn btn-primary">
            View Student Results
          </a>
          <a href="/instructor/manage" className="btn">
            Manage Students &amp; Groups
          </a>
        </div>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {!labs && !error && (
          <div className="labs-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="lab-card">
                <div className="skeleton" style={{ height: 20, width: "60%" }} />
                <div className="skeleton" style={{ height: 16, width: "40%" }} />
                <div className="skeleton" style={{ height: 40, width: "100%" }} />
              </div>
            ))}
          </div>
        )}

        {labs && labs.length === 0 && (
          <div className="empty-state">No labs configured.</div>
        )}

        {labs && labs.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "1rem", color: "var(--ink-secondary)" }}>
              Live Labs
            </h2>
            <div className="labs-grid">
              {labs.map((lab) => (
                <article key={lab.id} className="lab-card">
                  <div className="lab-card-header">
                    <span className="lab-card-title">{lab.title}</span>
                  </div>
                  <div className="lab-card-meta">
                    <span className="badge">{lab.difficulty}</span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                    {lab.active_sessions} active session{lab.active_sessions !== 1 ? "s" : ""} / {lab.total_students} total students
                  </div>
                  <div className="lab-card-actions">
                    <a href={`/instructor/labs/${lab.id}`} className="btn btn-primary btn-sm btn-block-mobile">
                      View Details
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
