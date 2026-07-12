import { useState, useEffect, useCallback, type KeyboardEvent } from "react";
import type { User, Group } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import ConfirmModal from "../components/ConfirmModal";
import { getGroups, createGroup, deleteGroup } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function InstructorManage({ user, onLogout }: Props) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  useDocumentTitle("Manage Groups");

  const refresh = useCallback(async () => {
    try {
      setGroups(await getGroups());
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createGroup(newGroup.trim());
      setNewGroup("");
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteGroup(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  function handleCardClick(g: Group) {
    navigate(`/instructor/groups/${g.id}`);
  }

  function handleCardKeyDown(e: KeyboardEvent, g: Group) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(g); }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <h1>Manage Groups</h1>
        <p className="text-sm-muted mb-lg">
          Create groups for each semester/lab combination. Students request to
          join groups after signing up. Click a group to manage members and
          assign labs.
        </p>

        <AlertError message={error} />

        <form onSubmit={handleCreate} className="toolbar mb-lg">
          <input
            type="text"
            placeholder="Group name (e.g. WS 2026/27 — Security Lab)"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            required
            style={{ maxWidth: 360 }}
          />
          <button type="submit" className="btn btn-primary">Create group</button>
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
                role="link"
                tabIndex={0}
                onClick={() => handleCardClick(g)}
                onKeyDown={(e) => handleCardKeyDown(e, g)}
              >
                <div className="lab-card-header">
                  <span className="lab-card-title">{g.name}</span>
                  <button
                    className="btn btn-ghost-dark btn-sm"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }}
                  >
                    Delete
                  </button>
                </div>
                <div className="text-sm-muted">
                  <div>
                    {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                    {g.pending_count > 0 && (
                      <span className="badge badge-warning" style={{ marginLeft: "var(--sp-2)" }}>
                        {g.pending_count} pending
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: "var(--sp-1)" }}>
                    {g.lab_count} lab{g.lab_count !== 1 ? "s" : ""} assigned
                  </div>
                  {g.created_at && (
                    <div style={{ marginTop: "var(--sp-1)" }}>
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This will remove all members and lab assignments. This cannot be undone."
        confirmLabel="Delete Group"
        confirmDanger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
