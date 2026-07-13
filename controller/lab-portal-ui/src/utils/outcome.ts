export interface OutcomeStyle {
  label: string;
  badgeClass: string;
}

// Shared session-outcome → display mapping. Raw values come from lifecycle
// event actions ("end", "stop", "auto_stop", ...) and must never be shown
// to instructors as-is (e.g. "end".toUpperCase() reads as "END", not "Ended").
const OUTCOME_MAP: Record<string, OutcomeStyle> = {
  end: { label: "Ended", badgeClass: "badge" },
  stop: { label: "Stopped", badgeClass: "badge-warning" },
  auto_stop: { label: "Auto-stopped", badgeClass: "badge-warning" },
  destroy: { label: "Destroyed", badgeClass: "badge-danger" },
  start: { label: "Running", badgeClass: "badge-success" },
  running: { label: "Running", badgeClass: "badge-success" },
};

export function outcomeStyle(outcome?: string | null): OutcomeStyle {
  if (outcome && OUTCOME_MAP[outcome]) return OUTCOME_MAP[outcome];
  return { label: outcome || "—", badgeClass: "badge" };
}
