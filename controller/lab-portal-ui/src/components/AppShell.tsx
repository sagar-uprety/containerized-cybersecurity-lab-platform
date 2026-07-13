import type { ComponentType, ReactNode } from "react";
import { ShieldCheck, KeyRound, LogOut, ChevronsUpDown } from "lucide-react";
import type { User } from "../types";
import Link from "./Link";
import { navigate } from "../utils/navigate";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType;
  match: (path: string) => boolean;
  badge?: number;
}

interface AppShellProps {
  user: User;
  onLogout: () => void;
  roleLabel: string;
  brandHref: string;
  navItems: NavItem[];
  accountPasswordHref?: string;
  /** Opt out of the centered max-width content column — for workspace views (e.g. the lab terminal split-pane) that should use all available width. */
  fullWidth?: boolean;
  children: ReactNode;
}

export default function AppShell({ user, onLogout, roleLabel, brandHref, navItems, accountPasswordHref, fullWidth, children }: AppShellProps) {
  const path = window.location.pathname;
  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link href={brandHref}>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <ShieldCheck className="size-4.5" />
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-semibold">Thesis Lab Portal</span>
                      <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map(({ href, label, icon: Icon, match, badge }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={match(path)} tooltip={label}>
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badge != null && badge > 0 && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="lg">
                      <Avatar size="sm">
                        <AvatarFallback className="rounded-md bg-primary text-primary-foreground">{initial}</AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left leading-tight">
                        <span className="truncate text-sm font-medium">{user.username}</span>
                        <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-56">
                    {accountPasswordHref && (
                      <>
                        <DropdownMenuItem onSelect={() => navigate(accountPasswordHref)}>
                          <KeyRound /> Change password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={onLogout}>
                      <LogOut /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-foreground md:hidden">Thesis Lab Portal</span>
          </header>
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            {fullWidth ? children : <div className="mx-auto w-full max-w-[1400px]">{children}</div>}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
