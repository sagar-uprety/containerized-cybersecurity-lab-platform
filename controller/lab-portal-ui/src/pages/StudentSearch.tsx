import { useState, useEffect } from "react";
import type { User } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import StatusBadge from "../components/StatusBadge";
import Link from "../components/Link";
import { getInstructorStudents, getInstructorStudentDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { useDebounce } from "../utils/useDebounce";

interface Props {
  user: User;
  onLogout: () => void;
}

interface StudentListItem {
  student_id: string;
  username: string;
}

interface StudentData {
  student_id: string;
  sessions: Array<{
    lab_id: string;
    lab_title: string;
    status?: string;
    started_at?: number;
    last_seen?: number;
    check_result?: { status?: string };
    feedback_submitted?: boolean;
  }>;
}

export default function StudentSearch({ user, onLogout }: Props) {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentTitle("Student Results");

  useEffect(() => {
    getInstructorStudents()
      .then((data) => setStudents(data.map((s) => ({ student_id: s.student_id, username: s.email || s.username || s.student_id }))))
      .catch((err: Error) => setError(err.message));
  }, []);

  const filteredStudents = students.filter((s) =>
    s.student_id.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    s.username.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  async function handleSelectStudent(studentId: string) {
    setSelectedStudent(studentId);
    setLoading(true);
    setError(null);
    try {
      const data = await getInstructorStudentDetail(studentId);
      setStudentData(data as unknown as StudentData);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Link href="/instructor" className="back-link">← Back to instructor dashboard</Link>
        <h1>Student Results</h1>

        <div className="panel mb-lg">
          <div className="form-group mb-0">
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

        <AlertError message={error} />

        {debouncedSearch && filteredStudents.length > 0 && !selectedStudent && (
          <div className="panel mb-lg">
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
            <h2>{studentData.student_id}</h2>

            {studentData.sessions.length === 0 && (
              <p className="text-sm-muted">No sessions found.</p>
            )}

            {studentData.sessions.map((session) => (
              <div key={session.lab_id} className="panel">
                <div className="flex-center flex-wrap gap-sm">
                  <span style={{ fontWeight: 600 }}>{session.lab_title}</span>
                  <StatusBadge status={session.status} />
                  {session.check_result && (
                    <span className={`badge ${session.check_result.status === "fixed" ? "badge-success" : "badge-danger"}`}>
                      {session.check_result.status?.toUpperCase()}
                    </span>
                  )}
                  {session.feedback_submitted && (
                    <span className="badge badge-success">Feedback</span>
                  )}
                </div>
                <div className="text-sm-muted" style={{ marginTop: "var(--sp-1)" }}>
                  {session.started_at && (
                    <span>Started {new Date(session.started_at * 1000).toLocaleString()}</span>
                  )}
                  {session.last_seen && (
                    <span> · Last seen {new Date(session.last_seen * 1000).toLocaleString()}</span>
                  )}
                </div>
                <div style={{ marginTop: "var(--sp-2)" }}>
                  <Link href={`/instructor/labs/${session.lab_id}/${studentData.student_id}`} className="btn btn-sm">
                    View Session
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
