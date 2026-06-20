import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import {
  getInstructorStudents,
  getGroups,
  getInstructorLabs,
  createStudent,
  deleteStudent,
  createGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  assignGroupLab,
  unassignGroupLab,
} from "../api.js";

export default function InstructorManage({ user, onLogout }) {
  const [students, setStudents] = useState(null);
  const [groups, setGroups] = useState(null);
  const [labs, setLabs] = useState([]);
  const [error, setError] = useState(null);

  const [newEmail, setNewEmail] = useState("");
  const [newGroup, setNewGroup] = useState("");
  // Shown exactly once, right after creating a student.
  const [createdCredential, setCreatedCredential] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([getInstructorStudents(), getGroups()]);
      setStudents(s);
      setGroups(g);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    getInstructorLabs()
      .then((data) => setLabs(data.map((l) => ({ id: l.id, title: l.title }))))
      .catch(() => setLabs([]));
  }, [refresh]);

  function run(action) {
    setError(null);
    return action()
      .then(refresh)
      .catch((err) => setError(err.message));
  }

  async function handleCreateStudent(e) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createStudent(newEmail.trim());
      setCreatedCredential(created);
      setNewEmail("");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Manage Students &amp; Groups</h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
          Add students by email, organize them into groups, and assign labs to
          groups. Students only see labs assigned to a group they belong to.
        </p>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {createdCredential && (
          <div className="panel" style={{ borderColor: "var(--tum-blue)", marginBottom: "1.5rem" }}>
            <strong>Student created.</strong> Share this initial password now — it
            is shown only once:
            <div style={{ marginTop: "0.5rem", fontFamily: "monospace" }}>
              {createdCredential.email} ({createdCredential.student_id}) —{" "}
              <strong>{createdCredential.initial_password}</strong>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: "0.5rem" }}
              onClick={() => setCreatedCredential(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Students */}
        <h2 style={{ fontSize: "1.15rem", margin: "1rem 0", color: "var(--ink-secondary)" }}>
          Students
        </h2>
        <form onSubmit={handleCreateStudent} className="toolbar" style={{ marginBottom: "1rem" }}>
          <input
            type="email"
            placeholder="student@tum.de"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ maxWidth: 280 }}
          />
          <button type="submit" className="btn btn-primary">Add student</button>
        </form>

        {!students && <div className="empty-state">Loading students…</div>}
        {students && students.length === 0 && (
          <div className="empty-state">No students yet.</div>
        )}
        {students && students.length > 0 && (
          <table className="data-table" style={{ width: "100%", marginBottom: "2rem" }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>ID</th>
                <th>Groups</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id}>
                  <td>{s.email}</td>
                  <td>{s.student_id}</td>
                  <td>{s.groups.length ? s.groups.join(", ") : "—"}</td>
                  <td>
                    {s.must_change_password ? (
                      <span className="badge">password pending</span>
                    ) : (
                      <span className="badge">active</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        if (window.confirm(`Remove ${s.email}? This tears down their labs.`)) {
                          run(() => deleteStudent(s.student_id));
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Groups */}
        <h2 style={{ fontSize: "1.15rem", margin: "1rem 0", color: "var(--ink-secondary)" }}>
          Groups
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createGroup(newGroup.trim())).then(() => setNewGroup(""));
          }}
          className="toolbar"
          style={{ marginBottom: "1rem" }}
        >
          <input
            type="text"
            placeholder="Group name (e.g. WS25-SecLab)"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            required
            style={{ maxWidth: 280 }}
          />
          <button type="submit" className="btn btn-primary">Create group</button>
        </form>

        {!groups && <div className="empty-state">Loading groups…</div>}
        {groups && groups.length === 0 && (
          <div className="empty-state">No groups yet.</div>
        )}
        {groups && groups.length > 0 && (
          <div className="labs-grid">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                students={students || []}
                labs={labs}
                onChange={run}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function GroupCard({ group, students, labs, onChange }) {
  const [memberPick, setMemberPick] = useState("");
  const [labPick, setLabPick] = useState("");

  const nonMembers = students.filter(
    (s) => !group.members.some((m) => m.student_id === s.student_id)
  );
  const unassignedLabs = labs.filter((l) => !group.labs.includes(l.id));

  return (
    <article className="lab-card">
      <div className="lab-card-header">
        <span className="lab-card-title">{group.name}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (window.confirm(`Delete group ${group.name}?`)) {
              onChange(() => deleteGroup(group.id));
            }
          }}
        >
          Delete
        </button>
      </div>

      <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
        <strong>Members</strong>
        {group.members.length === 0 && <div style={{ color: "var(--muted)" }}>None</div>}
        {group.members.map((m) => (
          <div key={m.student_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{m.email}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(() => removeGroupMember(group.id, m.student_id))}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="toolbar" style={{ marginTop: "0.5rem" }}>
          <select value={memberPick} onChange={(e) => setMemberPick(e.target.value)}>
            <option value="">Add member…</option>
            {nonMembers.map((s) => (
              <option key={s.student_id} value={s.student_id}>{s.email}</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={!memberPick}
            onClick={() => {
              onChange(() => addGroupMember(group.id, memberPick));
              setMemberPick("");
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
        <strong>Assigned labs</strong>
        {group.labs.length === 0 && <div style={{ color: "var(--muted)" }}>None</div>}
        {group.labs.map((labId) => (
          <div key={labId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{labId}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(() => unassignGroupLab(group.id, labId))}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="toolbar" style={{ marginTop: "0.5rem" }}>
          <select value={labPick} onChange={(e) => setLabPick(e.target.value)}>
            <option value="">Assign lab…</option>
            {unassignedLabs.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={!labPick}
            onClick={() => {
              onChange(() => assignGroupLab(group.id, labPick));
              setLabPick("");
            }}
          >
            Assign
          </button>
        </div>
      </div>
    </article>
  );
}
