import PasswordChange from "./PasswordChange";
import Link from "../components/Link";
import { ArrowLeft } from "lucide-react";

interface Props {
  onChanged: () => void;
  onLogout: () => void;
}

// Self-service password change for an already-authenticated instructor,
// reached from the sidebar account menu. Reuses PasswordChange's form as-is
// (same component the forced first-login gate uses) - only adds a way back.
export default function InstructorAccountPassword({ onChanged, onLogout }: Props) {
  return (
    <div className="relative">
      <Link
        href="/instructor"
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to dashboard
      </Link>
      <PasswordChange onChanged={onChanged} onLogout={onLogout} />
    </div>
  );
}
