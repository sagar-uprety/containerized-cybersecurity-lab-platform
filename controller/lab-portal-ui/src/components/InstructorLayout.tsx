import { LayoutDashboard, Users, Clock } from "lucide-react";
import type { User } from "../types";
import AppShell, { type NavItem } from "./AppShell";

interface InstructorLayoutProps {
  user: User;
  onLogout: () => void;
  pendingCount?: number;
  children: React.ReactNode;
}

export default function InstructorLayout({ user, onLogout, pendingCount, children }: InstructorLayoutProps) {
  const navItems: NavItem[] = [
    { href: "/instructor", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/instructor" },
    { href: "/instructor/students", label: "Students", icon: Users, match: (p) => p.startsWith("/instructor/students") },
    { href: "/instructor/pending", label: "Pending Approvals", icon: Clock, match: (p) => p.startsWith("/instructor/pending"), badge: pendingCount },
  ];

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      roleLabel="Instructor"
      brandHref="/instructor"
      navItems={navItems}
      accountPasswordHref="/instructor/account/password"
    >
      {children}
    </AppShell>
  );
}
