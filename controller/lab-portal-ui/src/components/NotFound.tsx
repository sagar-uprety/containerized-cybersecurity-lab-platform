import Link from "./Link";
import { useDocumentTitle } from "../utils/useDocumentTitle";

export default function NotFound() {
  useDocumentTitle("Page Not Found");
  return (
    <div className="container" style={{ textAlign: "center", paddingTop: "4rem" }}>
      <h1>404 — Page Not Found</h1>
      <p className="text-sm-muted mb-md">
        The page you're looking for doesn't exist.
      </p>
      <Link href="/" className="btn btn-primary">Go Home</Link>
    </div>
  );
}
