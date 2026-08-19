import { useState, useEffect, useCallback } from "react";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { Layers, BookMarked, Plus, Archive } from "lucide-react";
import { getInstructorAnalytics, createGroup } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import type { User, InstructorAnalyticsData, AnalyticsGroup } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEMESTERS } from "../utils/semesters";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function InstructorGroups({ user, onLogout }: Props) {
  const [data, setData] = useState<InstructorAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [newGroupSemester, setNewGroupSemester] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  useDocumentTitle("Groups");

  const refresh = useCallback(async () => {
    try {
      setData(await getInstructorAnalytics(undefined, statusFilter));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim() || !newGroupSemester) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(newGroup.trim(), newGroupSemester.trim());
      setNewGroup("");
      setNewGroupSemester("");
      setNewGroupOpen(false);
      await refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const filteredGroups = data?.groups?.filter((g: AnalyticsGroup) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  function handleGroupKeyDown(e: React.KeyboardEvent, groupId: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/instructor/groups/${groupId}`);
    }
  }

  const totalPending = data?.groups?.reduce((sum, g) => sum + g.pending_count, 0) ?? 0;

  return (
    <InstructorLayout user={user} onLogout={onLogout} pendingCount={totalPending}>
      <PageHeader
        title="Groups"
        description="Every group you teach, at a glance."
        breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: "Groups" }]}
        actions={
          data ? (
            <>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Layers className="size-3.5" /> {data.total_groups} group{data.total_groups !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <BookMarked className="size-3.5" /> {data.total_labs} lab{data.total_labs !== 1 ? "s" : ""}
              </Badge>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active groups</SelectItem>
                  <SelectItem value="archived">
                    Archived{data.archived_groups_count > 0 ? ` (${data.archived_groups_count})` : ""}
                  </SelectItem>
                  <SelectItem value="all">All groups</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : undefined
        }
      />

      <AlertError message={error} className="mb-6" />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {filteredGroups.length > 3 && (
          <Input
            type="text"
            placeholder="Filter groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
        )}
        <Button size="sm" onClick={() => setNewGroupOpen(true)}>
          <Plus /> New group
        </Button>
      </div>

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="mt-2.5 h-3.5 w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && filteredGroups.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {search ? "No groups match your filter." : "No groups yet. Create one to get started."}
        </div>
      )}

      {filteredGroups.length > 0 && (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((g: AnalyticsGroup) => (
            <Card
              key={g.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/instructor/groups/${g.id}`)}
              onKeyDown={(e) => handleGroupKeyDown(e, g.id)}
              className="h-full cursor-pointer py-5 transition-colors hover:bg-accent/40 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardContent className="flex h-full flex-col gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className="font-medium text-foreground">{g.name}</div>
                    {g.is_archived && (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Archive className="size-3" /> Archived
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{g.total_students} student{g.total_students !== 1 ? "s" : ""}</Badge>
                    <Badge variant="outline">{g.labs_assigned} lab{g.labs_assigned !== 1 ? "s" : ""}</Badge>
                    {g.pending_count > 0 && (
                      <Badge className="border-transparent bg-warning-bg text-warning">{g.pending_count} pending approval{g.pending_count !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <span>Achieved <strong className="text-foreground">{g.completed_assignments}/{g.eligible_assignments}</strong></span>
                  <span>Overdue <strong className={g.overdue_incomplete > 0 ? "text-warning" : "text-foreground"}>{g.overdue_incomplete}</strong></span>
                  <span>Active now <strong className="text-foreground">{g.active_now_students}/{g.total_students}</strong></span>
                  <span>Active this week <strong className="text-foreground">{g.active_students}/{g.total_students}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              Create a group for a semester or cohort. Students request to join after signing up.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="e.g. Security Fundamentals"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                autoFocus
                required
              />
              <Select value={newGroupSemester} onValueChange={setNewGroupSemester}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select semester…" /></SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={creating || !newGroup.trim() || !newGroupSemester}>
                {creating ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </InstructorLayout>
  );
}
