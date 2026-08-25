import { Activity, BarChart3, BookOpenCheck, Clock, Layers, LayoutDashboard, ListChecks, Library, Users } from "lucide-react";
import type { User } from "../types";
import AppShell, { type NavItem } from "./AppShell";

interface InstructorLayoutProps {
  user: User;
  onLogout: () => void;
  pendingCount?: number;
  groupContext?: {
    id: number;
    name?: string;
    hasPending?: boolean;
  };
  children: React.ReactNode;
}

export default function InstructorLayout({ user, onLogout, pendingCount, groupContext, children }: InstructorLayoutProps) {
  const navItems: NavItem[] = [
    { href: "/instructor", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/instructor" },
    { href: "/instructor/groups", label: "Groups", icon: Layers, match: (p) => p === "/instructor/groups" },
    { href: "/instructor/lab-catalogue", label: "Lab Catalogue", icon: Library, match: (p) => p.startsWith("/instructor/lab-catalogue") || p.startsWith("/instructor/labs/") },
    { href: "/instructor/students", label: "Manage students", icon: Users, match: (p) => p.startsWith("/instructor/students") },
    { href: "/instructor/pending", label: "Pending Approvals", icon: Clock, match: (p) => p.startsWith("/instructor/pending"), badge: pendingCount },
  ];

  const groupItems: NavItem[] | undefined = groupContext ? [
    { href: `/instructor/groups/${groupContext.id}`, label: "Overview", icon: LayoutDashboard, match: (p) => p === `/instructor/groups/${groupContext.id}` },
    { href: `/instructor/groups/${groupContext.id}/labs`, label: "Lab assignments", icon: BookOpenCheck, match: (p) => p === `/instructor/groups/${groupContext.id}/labs` },
    { href: `/instructor/groups/${groupContext.id}/results`, label: "Student results", icon: ListChecks, match: (p) => p === `/instructor/groups/${groupContext.id}/results` || p.includes(`/instructor/groups/${groupContext.id}/students/`) },
    { href: `/instructor/groups/${groupContext.id}/analytics`, label: "Analytics", icon: BarChart3, match: (p) => p === `/instructor/groups/${groupContext.id}/analytics` },
    { href: `/instructor/groups/${groupContext.id}/students`, label: "Manage students", icon: Users, match: (p) => p === `/instructor/groups/${groupContext.id}/students` },
    ...(groupContext.hasPending ? [{ href: `/instructor/groups/${groupContext.id}/pending`, label: "Approvals", icon: Clock, match: (p) => p === `/instructor/groups/${groupContext.id}/pending` } as NavItem] : []),
    { href: `/instructor/groups/${groupContext.id}/activity`, label: "Recent activity", icon: Activity, match: (p) => p === `/instructor/groups/${groupContext.id}/activity` },
  ] : undefined;

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      roleLabel="Instructor"
      brandHref="/instructor"
      navItems={navItems}
      contextLabel={groupContext?.name || (groupContext ? "Current group" : undefined)}
      contextItems={groupItems}
      accountPasswordHref="/instructor/account/password"
    >
      {children}
    </AppShell>
  );
}
