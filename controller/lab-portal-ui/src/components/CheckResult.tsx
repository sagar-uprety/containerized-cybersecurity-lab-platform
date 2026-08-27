import type { CheckResultData, CheckerCheck } from "../types";
import { cn } from "@/lib/utils";

interface CheckResultProps {
  result: CheckResultData | null;
  visible: boolean;
  checkerChecks?: CheckerCheck[];
}

export default function CheckResult({ result, visible, checkerChecks }: CheckResultProps) {
  if (!visible || !result) return null;

  const labelMap: Record<string, string> = {};
  const kindMap: Record<string, "objective" | "guardrail" | undefined> = {};
  if (checkerChecks) {
    for (const check of checkerChecks) {
      labelMap[check.name] = check.label || check.name;
      kindMap[check.name] = check.kind;
    }
  }

  const isFixed = result.status === "fixed";

  return (
    <div className={cn("rounded-lg border p-4", isFixed ? "border-success/30 bg-success-bg" : "border-destructive/30 bg-destructive-bg")}>
      <div className="mb-2 text-sm font-semibold text-foreground">
        Check Result: {result.status?.toUpperCase() || "UNKNOWN"}
      </div>
      <ul className="space-y-1.5">
        {(result.checks || []).map((check) => {
          // Unknown stored checks remain unlabeled instead of receiving an incorrect kind.
          const kind = kindMap[check.name];
          return (
            <li key={check.name} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold",
                  check.passed ? "bg-success text-white" : "bg-destructive text-white"
                )}
              >
                {check.passed ? "PASS" : "FAIL"}
              </span>
              {kind && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                    kind === "guardrail"
                      ? "bg-warning-bg text-warning"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {kind === "guardrail" ? "Guardrail" : "Objective"}
                </span>
              )}
              <span className="text-foreground">{labelMap[check.name] || check.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
