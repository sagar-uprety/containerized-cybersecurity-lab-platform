import { useEffect, useState } from "react";
import type { Intervention, InterventionStatus, ReviewReasonCode } from "../types";
import { createIntervention, getInterventions, updateIntervention } from "../api";
import AlertError from "./AlertError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Plus } from "lucide-react";

const REASONS: Array<{ value: ReviewReasonCode; label: string }> = [
  { value: "overdue_incomplete", label: "Overdue incomplete" },
  { value: "not_started_near_deadline", label: "Not started near deadline" },
  { value: "repeated_criterion_failure", label: "Repeated criterion failure" },
  { value: "no_check_recorded", label: "Started, no check recorded" },
  { value: "environment_error", label: "Environment error" },
];

const STATUS_STYLES: Record<InterventionStatus, string> = {
  open: "border-transparent bg-warning-bg text-warning",
  contacted: "border-transparent bg-accent text-primary",
  resolved: "border-transparent bg-success-bg text-success",
};

interface Props {
  studentId: string;
  groupId: number;
  labs: Array<{ lab_id: string; lab_title: string }>;
}

export default function InterventionPanel({ studentId, groupId, labs }: Props) {
  const [items, setItems] = useState<Intervention[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState<ReviewReasonCode>("repeated_criterion_failure");
  const [labId, setLabId] = useState("none");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  function load() {
    getInterventions({ groupId, studentId }).then(setItems).catch((err: Error) => setError(err.message));
  }

  useEffect(load, [groupId, studentId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createIntervention({ studentId, groupId, labId: labId === "none" ? undefined : labId, reason, note: note.trim(), followUpAt: followUpAt || undefined });
      setOpen(false);
      setNote("");
      setFollowUpAt("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(item: Intervention, status: InterventionStatus) {
    try {
      const updated = await updateIntervention(item.id, { status });
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle><h2>Support follow-up</h2></CardTitle>
          <CardDescription>Record observable reason, action, and follow-up. Notes never change grades.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus /> Add follow-up</Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Add support follow-up</DialogTitle>
                <DialogDescription>Use evidence visible on this page. Avoid inferred motivation or misconduct.</DialogDescription>
              </DialogHeader>
              <FieldGroup className="my-5">
                <Field>
                  <FieldLabel htmlFor="intervention-reason">Reason</FieldLabel>
                  <Select value={reason} onValueChange={(value) => setReason(value as ReviewReasonCode)}>
                    <SelectTrigger id="intervention-reason"><SelectValue /></SelectTrigger>
                    <SelectContent>{REASONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="intervention-lab">Lab</FieldLabel>
                  <Select value={labId} onValueChange={setLabId}>
                    <SelectTrigger id="intervention-lab"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">General support</SelectItem>{labs.map((lab) => <SelectItem key={lab.lab_id} value={lab.lab_id}>{lab.lab_title}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="intervention-note">Action note</FieldLabel>
                  <Textarea id="intervention-note" value={note} onChange={(event) => setNote(event.target.value)} required minLength={4} placeholder="What support will be offered?" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="intervention-follow-up">Follow-up date</FieldLabel>
                  <Input id="intervention-follow-up" type="date" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
                </Field>
              </FieldGroup>
              <DialogFooter><Button type="submit" disabled={saving || note.trim().length < 4}>{saving ? "Saving…" : "Save follow-up"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <AlertError message={error} className="mb-4" />
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No support follow-ups recorded.</div>
        ) : (
          <div className="divide-y rounded-lg border">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_STYLES[item.status]}>{item.status}</Badge>
                    <span className="text-sm font-medium">{REASONS.find((reasonItem) => reasonItem.value === item.reason)?.label}</span>
                    {item.lab_id && <Badge variant="outline">{labs.find((lab) => lab.lab_id === item.lab_id)?.lab_title || item.lab_id}</Badge>}
                  </div>
                  <p className="text-sm text-foreground">{item.note}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Owner: {item.owner}</span>
                    {item.follow_up_at && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> Follow up {new Date(`${item.follow_up_at.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  </div>
                </div>
                {item.status !== "resolved" ? (
                  <div className="flex gap-2">
                    {item.status === "open" && <Button size="sm" variant="outline" onClick={() => setStatus(item, "contacted")}>Mark contacted</Button>}
                    <Button size="sm" variant="outline" onClick={() => setStatus(item, "resolved")}>Resolve</Button>
                  </div>
                ) : <Button size="sm" variant="ghost" onClick={() => setStatus(item, "open")}>Reopen</Button>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
