export default function CheckResult({ result, visible, checkerChecks }) {
  if (!visible || !result) return null;

  const labelMap = {};
  if (checkerChecks) {
    for (const check of checkerChecks) {
      labelMap[check.name] = check.label || check.name;
    }
  }

  function labelFor(name) {
    return labelMap[name] || name;
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
        {(result.checks || []).map((check, i) => (
          <li key={i} className="check-item">
            <span className={`check-tag ${check.passed ? "check-pass" : "check-fail"}`}>
              {check.passed ? "PASS" : "FAIL"}
            </span>
            <span>{labelFor(check.name)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
