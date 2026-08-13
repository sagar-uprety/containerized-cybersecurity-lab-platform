import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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
  SidebarGroupLabel,
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
  contextLabel?: string;
  contextItems?: NavItem[];
  accountPasswordHref?: string;
  /** Opt out of the centered max-width content column, for workspace views (e.g. the lab terminal split-pane) that should use all available width. */
  fullWidth?: boolean;
  children: ReactNode;
}

export default function AppShell({ user, onLogout, roleLabel, brandHref, navItems, contextLabel, contextItems, accountPasswordHref, fullWidth, children }: AppShellProps) {
  const [path, setPath] = useState(() => window.location.pathname + window.location.hash);
  const initial = (user.username || "?").charAt(0).toUpperCase();

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname + window.location.hash);
    window.addEventListener("hashchange", updatePath);
    window.addEventListener("popstate", updatePath);
    return () => {
      window.removeEventListener("hashchange", updatePath);
      window.removeEventListener("popstate", updatePath);
    };
  }, []);

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
            {contextItems && contextItems.length > 0 && (
              <SidebarGroup>
                {contextLabel && <SidebarGroupLabel className="truncate">{contextLabel}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {contextItems.map(({ href, label, icon: Icon, match }) => (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild isActive={match(path)} tooltip={label}>
                          <Link href={href}>
                            <Icon />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
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
            <div className="px-2 pt-1 group-data-[collapsible=icon]:hidden">
              <Link
                href="/privacy-policy"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Privacy Policy
              </Link>
            </div>
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
