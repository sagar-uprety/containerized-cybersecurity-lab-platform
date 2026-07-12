import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  confirmDanger,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      className="confirm-dialog"
    >
      <div className="confirm-dialog-body">
        <h3 className="confirm-dialog-title">{title}</h3>
        {!children && message && (
          <p className="confirm-dialog-message">{message}</p>
        )}
        {children}
        {children && message && (
          <p className="text-sm-muted mb-md" style={{ lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
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
