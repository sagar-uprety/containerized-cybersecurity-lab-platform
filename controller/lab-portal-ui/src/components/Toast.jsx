import { useState, useEffect, useCallback } from "react";

let toastId = 0;
let addToastFn = null;

export function showToast(message, type = "success") {
  if (addToastFn) addToastFn({ id: ++toastId, message, type });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  addToastFn = useCallback((toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 3000);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", right: "1.5rem",
      display: "flex", flexDirection: "column", gap: "0.5rem", zIndex: 9999,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "0.65rem 1rem",
            borderRadius: "var(--radius)",
            fontSize: "0.88rem",
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            animation: "toast-in 0.2s ease-out",
            ...(t.type === "success"
              ? { background: "var(--green)", color: "#fff" }
              : t.type === "error"
              ? { background: "var(--red)", color: "#fff" }
              : { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)" }),
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
