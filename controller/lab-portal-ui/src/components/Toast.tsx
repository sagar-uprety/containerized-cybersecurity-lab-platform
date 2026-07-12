import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle, XCircle, Info } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;
let addToastFn: ((toast: Toast) => void) | null = null;

export function showToast(message: string, type: "success" | "error" | "info" = "success"): void {
  if (addToastFn) addToastFn({ id: ++toastId, message, type });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIds = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((toast: Toast) => {
    setToasts((prev) => [...prev, toast]);
    const tid = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      timeoutIds.current.delete(toast.id);
    }, 3000);
    timeoutIds.current.set(toast.id, tid);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
      timeoutIds.current.forEach((tid) => clearTimeout(tid));
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const icons = { success: CheckCircle, error: XCircle, info: Info };

  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            <Icon size={16} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
