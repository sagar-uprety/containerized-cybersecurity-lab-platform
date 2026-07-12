import type { CheckResultData, CheckerCheck } from "../types";

interface CheckResultProps {
  result: CheckResultData | null;
  visible: boolean;
  checkerChecks?: CheckerCheck[];
}

export default function CheckResult({ result, visible, checkerChecks }: CheckResultProps) {
  if (!visible || !result) return null;

  const labelMap: Record<string, string> = {};
  if (checkerChecks) {
    for (const check of checkerChecks) {
      labelMap[check.name] = check.label || check.name;
    }
  }

  const isFixed = result.status === "fixed";
  const panelClass = `panel check-panel ${isFixed ? "check-fixed" : "check-vulnerable"}`;

  return (
    <div className={panelClass}>
      <div className="panel-header">
        <span className="panel-title">
          Check Result: {result.status?.toUpperCase() || "UNKNOWN"}
        </span>
      </div>
      <ul className="check-list">
        {(result.checks || []).map((check) => (
          <li key={check.name} className="check-item">
            <span className={`check-tag ${check.passed ? "check-pass" : "check-fail"}`}>
              {check.passed ? "PASS" : "FAIL"}
            </span>
            <span>{labelMap[check.name] || check.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
