import { useState, useEffect } from "react";
import { CalendarIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className={cn(
            "gap-1.5 font-normal",
            isOverdue && "border-destructive/40 bg-destructive-bg text-destructive",
            origDate && !isOverdue && "border-primary/30 bg-accent text-primary"
          )}
        >
          <CalendarIcon className="size-3.5" />
          {saving ? "Saving…" : origDate ? fmtTrigger(origDate) : "Set deadline"}
          {origDate && !saving && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <Calendar mode="single" selected={date} onSelect={setDate} autoFocus />
        <div className="flex items-center gap-2 border-t border-border pt-2.5">
          <Label htmlFor="deadline-time" className="text-xs text-muted-foreground">Time</Label>
          <Input
            id="deadline-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-8 w-auto"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" size="sm" disabled={!date} onClick={() => commit(date, time)}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
