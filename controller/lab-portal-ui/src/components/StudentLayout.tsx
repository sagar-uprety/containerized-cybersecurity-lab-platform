import { BookOpen, BarChart3, Users } from "lucide-react";
import type { User } from "../types";
import AppShell, { type NavItem } from "./AppShell";

interface StudentLayoutProps {
  user: User;
  onLogout: () => void;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export default function StudentLayout({ user, onLogout, fullWidth, children }: StudentLayoutProps) {
  const navItems: NavItem[] = [
    { href: "/", label: "My Labs", icon: BookOpen, match: (p) => p === "/" || p.startsWith("/labs") },
    { href: "/enrollment", label: "Enrollment", icon: Users, match: (p) => p.startsWith("/enrollment") },
    { href: "/results", label: "My Results", icon: BarChart3, match: (p) => p.startsWith("/results") },
  ];

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      roleLabel="Student"
      brandHref="/"
      navItems={navItems}
      accountPasswordHref="/account/password"
      fullWidth={fullWidth}
    >
      {children}
    </AppShell>
  );
}
