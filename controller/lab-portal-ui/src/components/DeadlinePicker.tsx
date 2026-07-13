import { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar, X } from "lucide-react";

interface DeadlinePickerProps {
  deadline: string | null;
  busy?: boolean;
  saving?: boolean;
  onSave: (iso: string | null) => void;
}

function fmtTrigger(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function DeadlinePicker({ deadline, busy, saving, onSave }: DeadlinePickerProps) {
  const origDate = deadline ? new Date(deadline) : null;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(origDate && !isNaN(origDate.getTime()) ? origDate : undefined);
  const [time, setTime] = useState(origDate ? origDate.toTimeString().slice(0, 5) : "23:59");

  useEffect(() => {
    const next = deadline ? new Date(deadline) : null;
    setDate(next && !isNaN(next.getTime()) ? next : undefined);
    setTime(next ? next.toTimeString().slice(0, 5) : "23:59");
  }, [deadline]);

  const isOverdue = !!(origDate && origDate < new Date());

  function commit(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate) {
      onSave(null);
      setOpen(false);
      return;
    }
    const [h, m] = nextTime.split(":").map(Number);
    const combined = new Date(nextDate);
    combined.setHours(h || 0, m || 0, 0, 0);
    onSave(combined.toISOString());
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSave(null);
  }

  const triggerClass = isOverdue
    ? "deadline-trigger deadline-trigger-overdue"
    : origDate
      ? "deadline-trigger deadline-trigger-set"
      : "deadline-trigger";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerClass} disabled={busy}>
          <Calendar size={13} />
          {saving ? "Saving..." : origDate ? fmtTrigger(origDate) : "Set deadline"}
          {origDate && !saving && (
            <span className="deadline-trigger-clear" onClick={handleClear}>
              <X size={12} />
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className="deadline-popover">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={setDate}
            autoFocus
          />
          <div className="deadline-popover-time">
            <label htmlFor="deadline-time">Time</label>
            <input
              id="deadline-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="deadline-popover-actions">
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!date} onClick={() => commit(date, time)}>
              Save
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
