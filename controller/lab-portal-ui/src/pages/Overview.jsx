import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { getLabs, getEnrollmentOptions, requestEnrollment } from "../api.js";

export default function Overview({ user, onLogout }) {
  const [labs, setLabs] = useState(null);
  const [enrollments, setEnrollments] = useState(null);
  const [error, setError] = useState(null);
  const [enrollLoading, setEnrollLoading] = useState(null);

  useEffect(() => {
    getLabs()
      .then(setLabs)
      .catch((err) => setError(err.message));
    getEnrollmentOptions()
      .then(setEnrollments)
      .catch(() => setEnrollments([]));
  }, []);

  async function handleEnroll(groupId) {
    setEnrollLoading(groupId);
    setError(null);
    try {
      await requestEnrollment(groupId);
      const updated = await getEnrollmentOptions();
      setEnrollments(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnrollLoading(null);
    }
  }

  const hasApprovedGroup =
    enrollments && enrollments.some((e) => e.status === "approved");

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        {error && (
          <div className="panel" style={{ borderColor: "var(--red-muted)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Enrollment Options */}
        {enrollments && enrollments.length > 0 && (
          <>
            <h1>Available Enrollments</h1>
            <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
              Request to join a group to access its labs. Your instructor will
              approve your request.
            </p>
            <div className="labs-grid" style={{ marginBottom: "2rem" }}>
              {enrollments.map((group) => (
                <article key={group.id} className="lab-card">
                  <div className="lab-card-header">
                    <span className="lab-card-title">{group.name}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--muted)",
                      marginTop: "0.5rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {group.member_count} member
                    {group.member_count !== 1 ? "s" : ""}
                  </div>
                  <div className="lab-card-actions">
                    {group.status === "approved" && (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: "var(--green-bg, #dcfce7)",
                          color: "var(--green-text, #166534)",
                        }}
                      >
                        Enrolled
                      </span>
                    )}
                    {group.status === "pending" && (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: "var(--yellow-bg, #fef3c7)",
                          color: "var(--yellow-text, #92400e)",
                        }}
                      >
                        Pending Approval
                      </span>
                    )}
                    {!group.status && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={enrollLoading === group.id}
                        onClick={() => handleEnroll(group.id)}
                      >
                        {enrollLoading === group.id
                          ? "Requesting…"
                          : "Request to Join"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* Labs */}
        <h1 style={enrollments?.length > 0 ? { marginTop: "1rem" } : {}}>
          {hasApprovedGroup ? "Your Labs" : "Available Labs"}
        </h1>

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
          <div className="empty-state">
            {hasApprovedGroup
              ? "No labs have been assigned to your group yet."
              : "Join a group above to see available labs."}
          </div>
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
                  {lab.deadline && (
                    <DeadlineBadge deadline={lab.deadline} />
                  )}
                </div>
                <p className="lab-card-story">{lab.story?.situation}</p>
                <div className="lab-card-actions">
                  <a
                    href={`/labs/${lab.id}`}
                    className="btn btn-primary btn-sm btn-block-mobile"
                  >
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

function DeadlineBadge({ deadline }) {
  const d = new Date(deadline);
  const now = new Date();
  const hoursLeft = (d - now) / 3600000;
  const urgent = hoursLeft < 24 && hoursLeft > 0;
  const formatted = d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <span
      className="badge"
      style={{
        backgroundColor: urgent ? "var(--red-bg)" : "var(--amber-bg)",
        color: urgent ? "var(--red)" : "var(--amber)",
        border: `1px solid ${urgent ? "var(--red-border)" : "var(--amber-border)"}`,
      }}
    >
      Due {formatted}
    </span>
  );
}
