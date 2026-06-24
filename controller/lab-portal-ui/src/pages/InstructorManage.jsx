import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import { getGroups, createGroup, deleteGroup } from "../api.js";

export default function InstructorManage({ user, onLogout }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [newGroup, setNewGroup] = useState("");

  const refresh = useCallback(async () => {
    try {
      const g = await getGroups();
      setGroups(g);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function run(action) {
    setError(null);
    return action()
      .then(refresh)
      .catch((err) => setError(err.message));
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Manage Groups</h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
          Create groups for each semester/lab combination. Students request to
          join groups after signing up. Click a group to manage members and
          assign labs.
        </p>

        {error && (
          <div
            className="panel"
            style={{
              borderColor: "var(--red-border)",
              color: "var(--red)",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createGroup(newGroup.trim())).then(() => setNewGroup(""));
          }}
          className="toolbar"
          style={{ marginBottom: "1.5rem" }}
        >
          <input
            type="text"
            placeholder="Group name (e.g. WS 2026/27 — Security Lab)"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            required
            style={{ maxWidth: 360 }}
          />
          <button type="submit" className="btn btn-primary">
            Create group
          </button>
        </form>

        {!groups && <div className="empty-state">Loading groups…</div>}
        {groups && groups.length === 0 && (
          <div className="empty-state">No groups yet. Create one above.</div>
        )}

        {groups && groups.length > 0 && (
          <div className="labs-grid">
            {groups.map((g) => (
              <article
                key={g.id}
                className="lab-card"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  window.history.pushState(
                    {},
                    "",
                    `/instructor/groups/${g.id}`
                  );
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              >
                <div className="lab-card-header">
                  <span className="lab-card-title">{g.name}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete group "${g.name}"?`)) {
                        run(() => deleteGroup(g.id));
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--muted)",
                    marginTop: "0.5rem",
                  }}
                >
                  <div>
                    {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                    {g.pending_count > 0 && (
                      <span
                        className="badge"
                        style={{
                          marginLeft: "0.5rem",
                          backgroundColor: "var(--yellow-bg, #fef3c7)",
                          color: "var(--yellow-text, #92400e)",
                        }}
                      >
                        {g.pending_count} pending
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: "0.25rem" }}>
                    {g.lab_count} lab{g.lab_count !== 1 ? "s" : ""} assigned
                  </div>
                  {g.created_at && (
                    <div style={{ marginTop: "0.25rem" }}>
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
