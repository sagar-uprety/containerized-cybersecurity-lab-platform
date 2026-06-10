import { useState, useEffect } from "react";
import Header from "../components/Header.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { getInstructorStudents, getInstructorStudentDetail } from "../api.js";

export default function StudentSearch({ user, onLogout }) {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getInstructorStudents()
      .then(setStudents)
      .catch((err) => setError(err.message));
  }, []);

  const filteredStudents = students.filter((s) =>
    s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectStudent = async (studentId) => {
    setSelectedStudent(studentId);
    setLoading(true);
    setError(null);
    try {
      const data = await getInstructorStudentDetail(studentId);
      setStudentData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/instructor" className="back-link">&larr; Back to instructor dashboard</a>
        <h1>Student Results</h1>

        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Search Student</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type student ID or username..."
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {searchTerm && filteredStudents.length > 0 && !selectedStudent && (
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <div className="student-search-results">
              {filteredStudents.map((student) => (
                <div
                  key={student.student_id}
                  className="student-search-row"
                  onClick={() => handleSelectStudent(student.student_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectStudent(student.student_id)}
                >
                  <span className="student-search-id">{student.student_id}</span>
                  <span className="student-search-username">{student.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="panel">
            <div className="skeleton" style={{ height: 20, width: "60%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 100, width: "100%" }} />
          </div>
        )}

        {studentData && !loading && (
          <div>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
              {studentData.student_id}
            </h2>

            {studentData.sessions.length === 0 && (
              <p style={{ color: "var(--muted)" }}>No sessions found.</p>
            )}

            {studentData.sessions.map((session) => (
              <div key={session.lab_id} className="panel" style={{ marginBottom: "0.75rem" }}>
                <div className="session-info" style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{session.lab_title}</span>
                  <StatusBadge status={session.status} />
                  {session.check_result && (
                    <span
                      className="badge"
                      style={{
                        background: session.check_result.status === "fixed" ? "var(--green-bg)" : "var(--red-bg)",
                        color: session.check_result.status === "fixed" ? "var(--green)" : "var(--red)",
                        border: `1px solid ${session.check_result.status === "fixed" ? "var(--green-border)" : "var(--red-border)"}`,
                      }}
                    >
                      {session.check_result.status?.toUpperCase()}
                    </span>
                  )}
                  {session.feedback_submitted && (
                    <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)" }}>
                      Feedback
                    </span>
                  )}
                </div>
                <div className="session-meta" style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                  {session.started_at && (
                    <span>Started {new Date(session.started_at * 1000).toLocaleString()}</span>
                  )}
                  {session.last_seen && (
                    <span> · Last seen {new Date(session.last_seen * 1000).toLocaleString()}</span>
                  )}
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <a href={`/instructor/labs/${session.lab_id}/${studentData.student_id}`} className="btn btn-sm">
                    View Session
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
