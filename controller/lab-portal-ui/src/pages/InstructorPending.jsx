import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header.jsx";
import { getGroups, getGroupDetail, approveMembers, rejectMembers } from "../api.js";
import { showToast } from "../components/Toast.jsx";

function nav(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function InstructorPending({ user, onLogout }) {
  const [groups, setGroups] = useState(null);
  const [pendingByGroup, setPendingByGroup] = useState({});
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const gs = await getGroups();
      const withPending = gs.filter((g) => g.pending_count > 0);
      setGroups(withPending);
      const details = await Promise.all(
        withPending.map((g) => getGroupDetail(g.id))
      );
      const byGroup = {};
      for (const d of details) {
        if (d.pending_members?.length > 0) {
          byGroup[d.id] = { ...d };
        }
      }
      setPendingByGroup(byGroup);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleSelect(groupId, userId) {
    const key = `${groupId}:${userId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAllForGroup(groupId) {
    const members = pendingByGroup[groupId]?.pending_members || [];
    const keys = members.map((m) => `${groupId}:${m.user_id}`);
    setSelected((prev) => {
      const allSelected = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  async function handleBulkAction(action) {
    if (selected.size === 0) return;
    setActionLoading(true);
    setError(null);
    const byGroup = {};
    for (const key of selected) {
      const [gid, uid] = key.split(":");
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(parseInt(uid, 10));
    }
    try {
      for (const [gid, uids] of Object.entries(byGroup)) {
        const csrf = pendingByGroup[parseInt(gid, 10)]?.csrf_token;
        if (action === "approve") await approveMembers(parseInt(gid, 10), uids, csrf);
        else await rejectMembers(parseInt(gid, 10), uids, csrf);
      }
      showToast(`${action === "approve" ? "Approved" : "Rejected"} ${selected.size} student${selected.size !== 1 ? "s" : ""}`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const totalPending = Object.values(pendingByGroup).reduce(
    (acc, g) => acc + (g.pending_members?.length || 0), 0
  );

  // Flatten all pending into a single table with group column
  const allPending = [];
  for (const [gid, g] of Object.entries(pendingByGroup)) {
    const groupId = parseInt(gid, 10);
    for (const m of (g.pending_members || [])) {
      allPending.push({ ...m, groupId, groupName: g.name });
    }
  }

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/instructor" className="back-link" onClick={(e) => { e.preventDefault(); nav("/instructor"); }}>
          &larr; Back to Dashboard
        </a>

        <h1>Pending Approvals</h1>

        {error && (
          <div className="panel" style={{ borderColor: "var(--red-border)", background: "var(--red-bg)", color: "var(--red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {!groups && !error && (
          <div className="skeleton" style={{ height: 200 }} />
        )}

        {groups && totalPending === 0 && (
          <div className="empty-state">No pending approvals across any group.</div>
        )}

        {allPending.length > 0 && (
          <>
            {selected.size > 0 && (
              <div className="toolbar" style={{ paddingTop: 0, marginBottom: "0.5rem" }}>
                <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => handleBulkAction("approve")}>
                  Approve {selected.size} selected
                </button>
                <button className="btn btn-sm" disabled={actionLoading} onClick={() => handleBulkAction("reject")}
                  style={{ color: "var(--red)", borderColor: "var(--red-border)" }}>
                  Reject
                </button>
              </div>
            )}

            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <table className="data-table" style={{ width: "100%", marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={allPending.length > 0 && allPending.every((m) => selected.has(`${m.groupId}:${m.user_id}`))}
                        onChange={() => {
                          const allKeys = allPending.map((m) => `${m.groupId}:${m.user_id}`);
                          const allSelected = allKeys.every((k) => selected.has(k));
                          setSelected(allSelected ? new Set() : new Set(allKeys));
                        }}
                      />
                    </th>
                    <th>Email</th>
                    <th>Group</th>
                    <th>Program</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {allPending.map((m) => (
                    <tr key={`${m.groupId}:${m.user_id}`}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selected.has(`${m.groupId}:${m.user_id}`)}
                          onChange={() => toggleSelect(m.groupId, m.user_id)}
                        />
                      </td>
                      <td style={{ fontWeight: 500 }}>{m.email}</td>
                      <td>
                        <span className="badge">{m.groupName}</span>
                      </td>
                      <td>{m.study_program || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {m.requested_at ? new Date(m.requested_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
