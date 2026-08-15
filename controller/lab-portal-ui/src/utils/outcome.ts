export interface OutcomeStyle {
  label: string;
  badgeClass: string;
}

// Shared session-outcome → display mapping. Raw values come from lifecycle
// event actions ("end", "stop", "auto_stop", ...) and must never be shown
// to instructors as-is (e.g. "end".toUpperCase() reads as "END", not "Ended").
const NEUTRAL = "border-transparent bg-muted text-muted-foreground";
const WARNING = "border-transparent bg-warning-bg text-warning";
const DANGER = "border-transparent bg-destructive-bg text-destructive";
const SUCCESS = "border-transparent bg-success-bg text-success";

const OUTCOME_MAP: Record<string, OutcomeStyle> = {
  end: { label: "Ended", badgeClass: NEUTRAL },
  stop: { label: "Stopped", badgeClass: WARNING },
  auto_stop: { label: "Auto-stopped", badgeClass: WARNING },
  reset: { label: "Reset", badgeClass: NEUTRAL },
  interrupted: { label: "Interrupted", badgeClass: WARNING },
  destroy: { label: "Destroyed", badgeClass: DANGER },
  start: { label: "Running", badgeClass: SUCCESS },
  running: { label: "Running", badgeClass: SUCCESS },
};

export function outcomeStyle(outcome?: string | null, closeReason?: string | null): OutcomeStyle {
  if (outcome === "auto_stop" && closeReason === "idle") {
    return { label: "Idle timeout", badgeClass: WARNING };
  }
  if (outcome === "auto_stop" && closeReason === "max_runtime") {
    return { label: "Maximum runtime", badgeClass: WARNING };
  }
  if (outcome && OUTCOME_MAP[outcome]) return OUTCOME_MAP[outcome];
  return { label: outcome || "-", badgeClass: NEUTRAL };
}
