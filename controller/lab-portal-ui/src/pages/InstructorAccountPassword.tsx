import PasswordChange from "./PasswordChange";
import Link from "../components/Link";

interface Props {
  onChanged: () => void;
  onLogout: () => void;
}

// Self-service password change for an already-authenticated instructor,
// reached from the sidebar account menu. Reuses PasswordChange's form as-is
// (same component the forced first-login gate uses) — only adds a way back.
export default function InstructorAccountPassword({ onChanged, onLogout }: Props) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: "1.5rem", left: "1.5rem" }}>
        <Link href="/instructor" className="back-link">← Back to Dashboard</Link>
      </div>
      <PasswordChange onChanged={onChanged} onLogout={onLogout} />
    </div>
  );
}
