import { Users, Activity } from "lucide-react";
import type { User } from "../types";
import AppShell, { type NavItem } from "./AppShell";

interface AdminLayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AdminLayout({ user, onLogout, children }: AdminLayoutProps) {
  const navItems: NavItem[] = [
    { href: "/admin", label: "Instructors", icon: Users, match: (p) => p === "/admin" || p.startsWith("/admin/instructors") },
    { href: "/admin/system-usage", label: "System Usage", icon: Activity, match: (p) => p === "/admin/system-usage" },
  ];

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      roleLabel="Admin"
      brandHref="/admin"
      navItems={navItems}
      accountPasswordHref="/admin/account/password"
    >
      {children}
    </AppShell>
  );
}
