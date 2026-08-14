import { useState, useEffect, useCallback } from "react";
import { KeyRound, Ban, CircleCheck, Plus } from "lucide-react";
import type { User, Instructor } from "../types";
import AdminLayout from "../components/AdminLayout";
import AlertError from "../components/AlertError";
import ConfirmModal from "../components/ConfirmModal";
import IconButton from "../components/IconButton";
import PageHeader from "../components/PageHeader";
import CopyButton from "../components/CopyButton";
import { showToast } from "../components/Toast";
import {
  getInstructors,
  createInstructor,
  disableInstructor,
  enableInstructor,
  resetInstructorPassword,
} from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminInstructors({ user, onLogout }: Props) {
  const [instructors, setInstructors] = useState<Instructor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const [disableTarget, setDisableTarget] = useState<Instructor | null>(null);
  const [resetTarget, setResetTarget] = useState<Instructor | null>(null);

  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useDocumentTitle("Instructors");

  const refresh = useCallback(() => {
    getInstructors()
      .then(setInstructors)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createInstructor(newEmail.trim());
      setNewEmail("");
      setNewOpen(false);
      refresh();
      setCredentials({ email: result.email, password: result.initial_password });
      showToast("Instructor created");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    setBusy(true);
    setError(null);
    try {
      await disableInstructor(disableTarget.id);
      setDisableTarget(null);
      refresh();
      showToast("Instructor disabled");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(instructor: Instructor) {
    setBusy(true);
    setError(null);
    try {
      await enableInstructor(instructor.id);
      refresh();
      showToast("Instructor enabled");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    if (!resetTarget) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resetInstructorPassword(resetTarget.id);
      const email = resetTarget.email;
      setResetTarget(null);
      refresh();
      setCredentials({ email, password: result.new_password });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Instructors"
        description="Instructors are isolated from each other — each owns their own groups, labs, and deadlines."
        breadcrumbs={[{ label: "Admin" }, { label: "Instructors" }]}
        actions={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus /> New instructor
          </Button>
        }
      />

      <AlertError message={error} className="mb-4" />

      {!instructors && !error && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Skeleton className="h-[200px] w-full rounded-none" />
        </div>
      )}

      {instructors && instructors.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No instructors yet. Create one to get started.
        </div>
      )}

      {instructors && instructors.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{i.email}</div>
                    {i.must_change_password && (
                      <div className="text-xs text-muted-foreground">Password not yet changed</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.active ? (
                      <Badge variant="outline" className="gap-1.5 text-success">
                        <CircleCheck className="size-3.5" /> Active
                      </Badge>
                    ) : (
                      <Badge className="gap-1.5 border-transparent bg-destructive-bg text-destructive">
                        <Ban className="size-3.5" /> Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(i.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={KeyRound}
                        label={`Reset password for ${i.email}`}
                        onClick={() => setResetTarget(i)}
                      />
                      {i.active ? (
                        <IconButton
                          icon={Ban}
                          label={`Disable ${i.email}`}
                          danger
                          onClick={() => setDisableTarget(i)}
                        />
                      ) : (
                        <IconButton
                          icon={CircleCheck}
                          label={`Enable ${i.email}`}
                          onClick={() => handleEnable(i)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New instructor</DialogTitle>
            <DialogDescription>
              A random password is generated. The instructor must change it on first login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-1.5">
              <Label htmlFor="new-instructor-email">Email</Label>
              <Input
                id="new-instructor-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Creating…" : "Create instructor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!disableTarget}
        title={`Disable ${disableTarget?.email || "instructor"}?`}
        message="They will no longer be able to log in. Their groups, labs, and deadlines are kept as-is and can be restored by re-enabling the account."
        confirmLabel={busy ? "Disabling…" : "Disable"}
        confirmDanger
        onConfirm={confirmDisable}
        onCancel={() => setDisableTarget(null)}
      />

      <ConfirmModal
        open={!!resetTarget}
        title={`Reset password for ${resetTarget?.email || "instructor"}?`}
        message="A new random password is generated and their current password stops working immediately."
        confirmLabel={busy ? "Resetting…" : "Reset password"}
        confirmDanger
        onConfirm={confirmReset}
        onCancel={() => setResetTarget(null)}
      />

      <Dialog open={!!credentials} onOpenChange={(next) => { if (!next) setCredentials(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credentials</DialogTitle>
            <DialogDescription>
              Shown once. Share this password with the instructor — it can't be retrieved again after closing this dialog.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <div className="mt-1 text-sm text-foreground">{credentials.email}</div>
              </div>
              <div>
                <Label>Password</Label>
                <div className="mt-1 flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <code className="flex-1 text-sm text-foreground">{credentials.password}</code>
                  <CopyButton value={credentials.password} label="Copy password" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button size="sm" onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
