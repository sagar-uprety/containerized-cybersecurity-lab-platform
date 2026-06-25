import { useEffect, useRef } from "react";

export default function ConfirmModal({ open, title, message, confirmLabel, confirmDanger, onConfirm, onCancel, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    else if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => { if (e.target === dialogRef.current) onCancel(); }}
      style={{
        border: "none",
        borderRadius: "var(--radius)",
        padding: 0,
        maxWidth: 420,
        width: "90vw",
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        background: "var(--surface)",
      }}
    >
      <div style={{ padding: "1.5rem" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          {title}
        </h3>
        {!children && message && (
          <p style={{ fontSize: "0.9rem", color: "var(--ink-secondary)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
            {message}
          </p>
        )}
        {children}
        {children && message && (
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.5, marginBottom: "1rem" }}>
            {message}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn btn-sm ${confirmDanger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
