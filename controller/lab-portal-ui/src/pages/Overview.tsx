import { useState, useEffect } from "react";
import type { User, Lab, EnrollmentOption } from "../types";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import AlertError from "../components/AlertError";
import Link from "../components/Link";
import { getLabs, getEnrollmentOptions, requestEnrollment } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { fmtTimestamp } from "../utils/time";

export default function Overview({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrollLoading, setEnrollLoading] = useState<number | null>(null);

  useDocumentTitle("My Labs");

  useEffect(() => {
    Promise.all([
      getLabs().catch((err: Error) => { setError(err.message); return null; }),
      getEnrollmentOptions().catch(() => [] as EnrollmentOption[]),
    ]).then(([labsData, enrollData]) => {
      if (labsData) setLabs(labsData);
      setEnrollments(enrollData);
    });
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

  const hasApprovedGroup =
    enrollments != null && enrollments.some((e) => e.status === "approved");

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <AlertError message={error} />

        {/* Enrollment Options */}
        {enrollments && enrollments.length > 0 && (
          <>
            <h1>Available Enrollments</h1>
            <p className="text-sm-muted mb-md">
              Request to join a group to access its labs. Your instructor will
              approve your request.
            </p>
            <div className="labs-grid mb-lg">
              {enrollments.map((group) => (
                <article key={group.id} className="lab-card">
                  <div className="lab-card-header">
                    <span className="lab-card-title">{group.name}</span>
                  </div>
                  <div className="text-sm-muted">
                    {group.member_count} member
                    {group.member_count !== 1 ? "s" : ""}
                  </div>
                  <div className="lab-card-actions">
                    {group.status === "approved" && (
                      <span className="badge badge-enrolled">Enrolled</span>
                    )}
                    {group.status === "pending" && (
                      <span className="badge badge-pending">Pending Approval</span>
                    )}
                    {!group.status && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={enrollLoading === group.id}
                        onClick={() => handleEnroll(group.id)}
                      >
                        {enrollLoading === group.id
                          ? "Requesting..."
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
        <h1>
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
                  <Link
                    href={`/labs/${lab.id}`}
                    className="btn btn-primary btn-sm btn-block-mobile"
                  >
                    Open Lab
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const d = new Date(deadline);
  const now = new Date();
  const hoursLeft = (d.getTime() - now.getTime()) / 3600000;
  const urgent = hoursLeft < 24 && hoursLeft > 0;
  const formatted = fmtTimestamp(deadline);

  return (
    <span
      className={`badge ${urgent ? "badge-deadline-urgent" : "badge-deadline"}`}
    >
      Due {formatted}
    </span>
  );
}
