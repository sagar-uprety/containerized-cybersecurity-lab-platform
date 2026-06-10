const CHECK_LABELS = {
  // redis-exposed
  redis_unauth_blocked: "Unauthorized Redis access is blocked",
  redis_acl_enforced: "Redis access controls are enforced",
  demo_app_healthy: "Demo application is reachable",
  // ssh-weak-config
  ssh_password_auth: "Password-based SSH authentication is disabled",
  ssh_fail2ban_active: "SSH brute-force protection is active",
  ssh_key_auth: "SSH key authentication works",
  // ldap-anonymous-bind
  ldap_anonymous_search: "Anonymous LDAP searches are blocked",
  ldap_tls_enforced: "LDAP encryption (TLS) is enforced",
  // unpatched-apache-cve
  apache_exploit: "Path-traversal vulnerability is patched",
  apache_home: "Apache web server is reachable",
  // firewall-source-port-bypass
  fw_direct_highport: "Direct high-port access to internal server is blocked",
  fw_sourceport80: "Source-port 80 bypass is blocked",
  fw_outbound_http: "Outbound HTTP connectivity works",
};

function labelFor(name) {
  return CHECK_LABELS[name] || name;
}

export default function CheckResult({ result, visible }) {
  if (!visible || !result) return null;

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
