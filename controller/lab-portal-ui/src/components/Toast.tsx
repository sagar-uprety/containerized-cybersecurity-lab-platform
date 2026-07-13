import { toast } from "sonner";
import { Toaster } from "./ui/sonner";

export function showToast(message: string, type: "success" | "error" | "info" = "success"): void {
  if (type === "error") toast.error(message);
  else if (type === "info") toast.info(message);
  else toast.success(message);
}

export default function ToastContainer() {
  return <Toaster position="bottom-right" />;
}
