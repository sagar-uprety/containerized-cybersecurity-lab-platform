import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LayoutDashboard, Users, Clock, KeyRound, LogOut, ChevronsUpDown } from "lucide-react";
import type { User } from "../types";
import Link from "./Link";
import { navigate } from "../utils/navigate";

interface InstructorLayoutProps {
  user: User;
  onLogout: () => void;
  pendingCount?: number;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/instructor", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/instructor" },
  { href: "/instructor/students", label: "Students", icon: Users, match: (p: string) => p.startsWith("/instructor/students") },
  { href: "/instructor/pending", label: "Pending Approvals", icon: Clock, match: (p: string) => p.startsWith("/instructor/pending") },
];

export default function InstructorLayout({ user, onLogout, pendingCount, children }: InstructorLayoutProps) {
  const path = window.location.pathname;
  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <div className="instructor-shell">
      <aside className="instructor-sidebar">
        <Link href="/instructor" className="instructor-sidebar-brand">Thesis Lab Portal</Link>

        <nav className="instructor-sidebar-nav">
          {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              className={`instructor-sidebar-link${match(path) ? " instructor-sidebar-link-active" : ""}`}
            >
              <Icon size={16} />
              {label}
              {href === "/instructor/pending" && pendingCount != null && pendingCount > 0 && (
                <span className="instructor-sidebar-badge">{pendingCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="instructor-sidebar-footer">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="instructor-account-trigger">
                <span className="instructor-account-avatar">{initial}</span>
                <span className="instructor-account-meta">
                  <div className="instructor-account-email">{user.username}</div>
                  <div className="instructor-account-role">Instructor</div>
                </span>
                <ChevronsUpDown size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content" side="top" align="start" sideOffset={8}>
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => navigate("/instructor/account/password")}
                >
                  <KeyRound size={15} /> Change Password
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="dropdown-menu-separator" />
                <DropdownMenu.Item className="dropdown-menu-item dropdown-menu-item-danger" onSelect={onLogout}>
                  <LogOut size={15} /> Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>

      <main className="instructor-main">{children}</main>
    </div>
  );
}
