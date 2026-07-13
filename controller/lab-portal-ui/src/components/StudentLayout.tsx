import { BookOpen } from "lucide-react";
import type { User } from "../types";
import AppShell, { type NavItem } from "./AppShell";

interface StudentLayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function StudentLayout({ user, onLogout, children }: StudentLayoutProps) {
  const navItems: NavItem[] = [
    { href: "/", label: "My Labs", icon: BookOpen, match: (p) => p === "/" || p.startsWith("/labs") },
  ];

  return (
    <AppShell user={user} onLogout={onLogout} roleLabel="Student" brandHref="/" navItems={navItems}>
      {children}
    </AppShell>
  );
}
