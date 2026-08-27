import { useState, useEffect } from "react";
import { Pencil, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IconButton from "./IconButton";
import ConfirmModal from "./ConfirmModal";
import { cn } from "@/lib/utils";

interface DeadlinePickerProps {
  deadline: string | null;
  /** Used only to build accessible labels for the edit/remove icon buttons
   *  (e.g. "Edit deadline for Buffer Overflow Basics"). */
  labTitle: string;
  busy?: boolean;
  saving?: boolean;
  onSave: (iso: string | null) => void;
}

function fmtTrigger(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function withTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(h || 0, m || 0, 0, 0);
  return combined;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function DeadlinePicker({ deadline, labTitle, busy, saving, onSave }: DeadlinePickerProps) {
  const origDate = deadline ? new Date(deadline) : null;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(origDate && !isNaN(origDate.getTime()) ? origDate : undefined);
  const [time, setTime] = useState(origDate ? origDate.toTimeString().slice(0, 5) : "23:59");

  useEffect(() => {
    const next = deadline ? new Date(deadline) : null;
    setDate(next && !isNaN(next.getTime()) ? next : undefined);
    setTime(next ? next.toTimeString().slice(0, 5) : "23:59");
  }, [deadline]);

  // Flag a saved overdue state without blocking edits to a future deadline.
  const isOverdue = !!(origDate && origDate < new Date());
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState(false);

  const combined = date ? withTime(date, time) : undefined;
  const combinedIsPast = !!combined && combined.getTime() <= Date.now();
  const isSelectedToday = date ? date.toDateString() === new Date().toDateString() : false;

  function commit(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate) {
      setOpen(false);
      setPendingClear(true);
      return;
    }
    const combinedDate = withTime(nextDate, nextTime);
    // Belt-and-suspenders: the Save button is already disabled while the
    // picked value is in the past, but don't let a stale click through.
    if (combinedDate.getTime() <= Date.now()) return;
    setOpen(false);
    setPendingSave(combinedDate.toISOString());
  }

  return (
    <div className="flex items-center gap-1">
      <span className={cn("text-sm", isOverdue ? "font-medium text-warning" : origDate ? "text-foreground" : "text-muted-foreground")}>
        {saving ? "Saving…" : origDate ? fmtTrigger(origDate) : "No deadline set"}
        {isOverdue && !saving && " · passed"}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={`Edit deadline for ${labTitle}`}
            aria-label={`Edit deadline for ${labTitle}`}
            disabled={busy}
          >
            <Pencil size={15} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={{ before: startOfToday() }}
            autoFocus
          />
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <Label htmlFor="deadline-time" className="text-xs text-muted-foreground">Time</Label>
            <Input
              id="deadline-time"
              type="time"
              value={time}
              min={isSelectedToday ? new Date().toTimeString().slice(0, 5) : undefined}
              onChange={(e) => setTime(e.target.value)}
              className="h-8 w-auto"
            />
          </div>
          {combinedIsPast && (
            <p className="text-xs text-destructive">Pick a date and time in the future.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!date || combinedIsPast} onClick={() => commit(date, time)}>Save</Button>
          </div>
        </PopoverContent>
      </Popover>

      {origDate && !saving && (
        <IconButton icon={X} label={`Remove deadline for ${labTitle}`} onClick={() => setPendingClear(true)} disabled={busy} />
      )}

      <ConfirmModal
        open={pendingSave != null}
        title={origDate ? "Change deadline?" : "Set deadline?"}
        message={pendingSave ? `Deadline will be set to ${fmtTrigger(new Date(pendingSave))}.` : undefined}
        confirmLabel="Confirm"
        onConfirm={() => { onSave(pendingSave); setPendingSave(null); }}
        onCancel={() => setPendingSave(null)}
      />

      <ConfirmModal
        open={pendingClear}
        title="Remove deadline?"
        message="This lab will no longer have a due date for this group."
        confirmLabel="Remove deadline"
        confirmDanger
        onConfirm={() => { onSave(null); setPendingClear(false); }}
        onCancel={() => setPendingClear(false)}
      />
    </div>
  );
}
