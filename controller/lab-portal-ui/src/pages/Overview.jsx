import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { getLabs } from "../api.js";

export default function Overview({ user, onLogout }) {
  const [labs, setLabs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLabs()
      .then(setLabs)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Available Labs</h1>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-muted)", color: "var(--red)" }}>
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
          <div className="labs-grid">
            {labs.map((lab) => (
              <article key={lab.id} className="lab-card">
                <div className="lab-card-header">
                  <span className="lab-card-title">{lab.title}</span>
                  <StatusBadge status={lab.status} />
                </div>
                <div className="lab-card-meta">
                  <span className="badge">{lab.difficulty}</span>
                  <span className="badge">{lab.duration_minutes} min</span>
                </div>
                <p className="lab-card-story">{lab.story?.situation}</p>
                <div className="lab-card-actions">
                  <a href={`/labs/${lab.id}`} className="btn btn-primary btn-sm btn-block-mobile">
                    Open Lab
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
