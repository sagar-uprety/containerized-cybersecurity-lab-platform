import { useEffect } from "react";

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} - Thesis Lab Portal` : "Thesis Lab Portal";
  }, [title]);
}
