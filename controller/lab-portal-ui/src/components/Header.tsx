import type { User } from "../types";
import Link from "./Link";
import { LogOut, LayoutDashboard, BookOpen, Users, Clock } from "lucide-react";

interface HeaderProps {
  user: User;
  onLogout: () => void;
  pendingCount?: number;
}

export default function Header({ user, onLogout, pendingCount }: HeaderProps) {
  const isInstructor = user.role === "instructor";
  const brandHref = isInstructor ? "/instructor" : "/";

  return (
    <header className="header">
      <Link href={brandHref} className="header-brand">Thesis Lab Portal</Link>
      <nav className="header-nav">
        {isInstructor && (
          <>
            <Link href="/instructor" className="btn btn-ghost btn-sm">
              <LayoutDashboard size={15} /> Dashboard
            </Link>
            <Link href="/instructor/students" className="btn btn-ghost btn-sm">
              <Users size={15} /> Students
            </Link>
            <Link href="/instructor/pending" className="btn btn-ghost btn-sm">
              <Clock size={15} /> Pending
              {pendingCount != null && pendingCount > 0 && (
                <span className="badge badge-warning" style={{ marginLeft: "0.3rem", height: 18, fontSize: "0.65rem" }}>
                  {pendingCount}
                </span>
              )}
            </Link>
          </>
        )}
        {user.role === "student" && (
          <Link href="/" className="btn btn-ghost btn-sm">
            <BookOpen size={15} /> Labs
          </Link>
        )}
      </nav>
      <div className="header-user">
        <span>
          <strong>{user.username}</strong>{" "}
          <span className="badge badge-header">{user.role}</span>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          <LogOut size={15} /> Logout
        </button>
      </div>
    </header>
  );
}
