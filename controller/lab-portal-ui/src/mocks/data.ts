import { mulberry32, pick, weighted, randInt } from "./rng";

const rand = mulberry32(20260713);

// ---------------------------------------------------------------------------
// Static catalog — mirrors the real labs/<id>/scenario.yaml set so mock data
// exercises the same UI paths (difficulty badges, guide links, etc).
// ---------------------------------------------------------------------------

export interface MockLab {
  id: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  story: { situation: string; role: string };
}

export const LABS: MockLab[] = [
  { id: "redis-exposed", title: "Redis Exposed Cache", difficulty: "beginner", story: { role: "SOC Analyst", situation: "An internet-facing Redis instance has no authentication configured." } },
  { id: "ssh-weak-config", title: "Weak SSH Configuration and Brute-Force Vulnerability", difficulty: "intermediate", story: { role: "Incident Responder", situation: "A jump host allows password auth with weak credentials and no rate limiting." } },
  { id: "ldap-anonymous-bind", title: "LDAP Directory Exposure with Anonymous Bind", difficulty: "intermediate", story: { role: "Security Engineer", situation: "The directory service accepts anonymous binds, leaking the full user tree." } },
  { id: "firewall-source-port-bypass", title: "Firewall Rule Misconfiguration — Source-Port Bypass", difficulty: "intermediate", story: { role: "Network Security Analyst", situation: "A stateless firewall rule trusts traffic based on source port alone." } },
  { id: "unpatched-apache-cve", title: "Unpatched Service with Known Vulnerability", difficulty: "advanced", story: { role: "Penetration Tester", situation: "A public web server runs an Apache build with a known path-traversal CVE." } },
];

const FIRST_NAMES = [
  "Anna", "Lukas", "Sophie", "Maximilian", "Lena", "Felix", "Marie", "Jonas", "Laura", "David",
  "Hannah", "Paul", "Emma", "Leon", "Lea", "Tim", "Julia", "Niklas", "Sarah", "Simon",
  "Mia", "Elias", "Clara", "Jan", "Nina", "Tom", "Johanna", "Moritz", "Katharina", "Philipp",
  "Ayşe", "Mehmet", "Chen", "Wei", "Priya", "Arjun", "Elif", "Yusuf", "Ivan", "Olga",
];
const LAST_NAMES = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz",
  "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger",
  "Yildiz", "Demir", "Wang", "Li", "Sharma", "Patel", "Kaya", "Aydin", "Ivanov", "Petrov",
];
const PROGRAMS = ["Informatics", "Data Engineering & Analytics", "Robotics, Cognition, Intelligence", "Information Systems", "Electrical Engineering"];
const SEMESTERS = ["WS 2025/26", "SS 2026", "WS 2026/27"];

export interface MockUser {
  id: number;
  internal_id: string;
  email: string;
  semester: string;
  study_program: string;
}

export interface MockGroup {
  id: number;
  name: string;
  created_at: string;
}

export interface MockMembership {
  group_id: number;
  user_id: number;
  status: "approved" | "pending";
  requested_at: string;
}

export interface MockGroupLab {
  group_id: number;
  lab_id: string;
  deadline: string | null;
}

export interface MockLifecycleEvent {
  student_id: string;
  lab_id: string;
  action: "start" | "end" | "stop" | "auto_stop" | "check";
  timestamp: string;
  result?: "success" | "error";
}

export interface MockCheckResult {
  student_id: string;
  lab_id: string;
  timestamp: string;
  check_result: {
    status: "vulnerable" | "fixed";
    passed: boolean;
    checks: Array<{ name: string; label: string; passed: boolean }>;
  };
}

export interface MockCommandEvent {
  student_id: string;
  lab_id: string;
  timestamp: string;
  command: string;
}

const COMMAND_POOL: Record<string, string[]> = {
  "redis-exposed": ["nmap -p 6379 target", "redis-cli -h target ping", "redis-cli -h target keys '*'", "redis-cli -h target config get requirepass", "vim /etc/redis/redis.conf", "systemctl restart redis"],
  "ssh-weak-config": ["nmap -p 22 target", "ssh admin@target", "hydra -l admin -P wordlist.txt ssh://target", "cat /etc/ssh/sshd_config", "vim /etc/ssh/sshd_config", "sudo systemctl restart sshd"],
  "ldap-anonymous-bind": ["ldapsearch -x -H ldap://target -b 'dc=lab,dc=local'", "ldapwhoami -x -H ldap://target", "cat /etc/ldap/slapd.conf", "vim /etc/ldap/slapd.conf", "sudo systemctl restart slapd"],
  "firewall-source-port-bypass": ["iptables -L -n -v", "nmap --source-port 88 -p 9000 target", "vim /etc/iptables/rules.v4", "ip6tables -L -n -v", "iptables-restore < rules.v4"],
  "unpatched-apache-cve": ["curl -I http://target", "curl 'http://target/cgi-bin/../../../../etc/passwd'", "apt list --installed | grep apache2", "sudo apt-get update && sudo apt-get upgrade apache2", "systemctl restart apache2"],
};

export const CHECKS_POOL: Record<string, Array<{ name: string; label: string }>> = {
  "redis-exposed": [
    { name: "auth_required", label: "Redis requires authentication" },
    { name: "bind_restricted", label: "Redis bound to localhost only" },
    { name: "protected_mode", label: "Protected mode enabled" },
  ],
  "ssh-weak-config": [
    { name: "password_auth_disabled", label: "Password authentication disabled" },
    { name: "fail2ban_active", label: "fail2ban actively banning" },
    { name: "key_auth_works", label: "Key-based auth works" },
  ],
  "ldap-anonymous-bind": [
    { name: "anonymous_bind_blocked", label: "Anonymous bind blocked" },
    { name: "acl_restricted", label: "Directory ACLs restrict read access" },
  ],
  "firewall-source-port-bypass": [
    { name: "source_port_bypass_blocked", label: "Source-port 80 bypass is blocked" },
    { name: "ipv6_rules_active", label: "IPv6 stateful firewall rules are active" },
    { name: "direct_access_blocked", label: "Direct high-port access to internal server is blocked" },
  ],
  "unpatched-apache-cve": [
    { name: "apache_patched", label: "Apache patched to non-vulnerable version" },
    { name: "traversal_blocked", label: "Path traversal blocked" },
  ],
};

function daysAgoIso(rand: () => number, minDays: number, maxDays: number, hour?: number): string {
  const days = randInt(rand, minDays, maxDays);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour ?? randInt(rand, 8, 22), randInt(rand, 0, 59), 0, 0);
  return d.toISOString();
}

function buildStore() {
  const groups: MockGroup[] = [
    { id: 1, name: "WS 2026/27 — IN2101 System Security", created_at: daysAgoIso(rand, 40, 60) },
    { id: 2, name: "SS 2026 — Security Fundamentals", created_at: daysAgoIso(rand, 90, 120) },
    { id: 3, name: "WS 2025/26 — Advanced Pentesting Lab", created_at: daysAgoIso(rand, 180, 220) },
    { id: 4, name: "SS 2027 — Intro to Cybersecurity", created_at: daysAgoIso(rand, 5, 12) },
  ];

  const users: MockUser[] = [];
  const memberships: MockMembership[] = [];
  let uid = 1;
  const emailSet = new Set<string>();

  function makeEmail(first: string, last: string): string {
    const base = `${first.toLowerCase()}.${last.toLowerCase()}`.replace(/[^a-z.]/g, "");
    let candidate = `${base}@tum.de`;
    let n = 1;
    while (emailSet.has(candidate)) {
      candidate = `${base}${n}@tum.de`;
      n += 1;
    }
    emailSet.add(candidate);
    return candidate;
  }

  const groupSizes: Record<number, number> = { 1: 24, 2: 30, 3: 11, 4: 17 };

  for (const group of groups) {
    const size = groupSizes[group.id];
    const pendingCount = group.id === 4 ? 3 : group.id === 1 ? 2 : 0; // fresher groups have open requests
    for (let i = 0; i < size; i++) {
      const first = pick(rand, FIRST_NAMES);
      const last = pick(rand, LAST_NAMES);
      const user: MockUser = {
        id: uid,
        internal_id: `student${String(uid).padStart(2, "0")}`,
        email: makeEmail(first, last),
        semester: pick(rand, SEMESTERS),
        study_program: pick(rand, PROGRAMS),
      };
      users.push(user);
      const isPending = i < pendingCount;
      memberships.push({
        group_id: group.id,
        user_id: user.id,
        status: isPending ? "pending" : "approved",
        requested_at: daysAgoIso(rand, isPending ? 0 : 3, isPending ? 4 : 45),
      });
      uid += 1;
    }
  }

  // Lab assignments per group — 2 to all 5 labs, so both real states show up:
  // some groups have labs still available to assign, some have every lab
  // assigned already ("Available Labs" section absent entirely for those).
  // Force at least one group of each kind so both are guaranteed reachable,
  // not left to chance.
  const groupLabs: MockGroupLab[] = [];
  const now = Date.now();
  groups.forEach((g, gi) => {
    const labCount = gi === 0 ? LABS.length : gi === 1 ? randInt(rand, 2, LABS.length - 1) : randInt(rand, 2, LABS.length);
    const shuffled = [...LABS].sort(() => rand() - 0.5).slice(0, labCount);
    shuffled.forEach((lab, li) => {
      let deadline: string | null = null;
      const roll = rand();
      if (gi === 0 && li === 0) {
        // first group: guarantee exactly one overdue lab so at-risk/overdue UI states are reachable
        deadline = new Date(now - randInt(rand, 3, 20) * 86400000).toISOString();
      } else if (roll < 0.12) {
        deadline = new Date(now - randInt(rand, 1, 15) * 86400000).toISOString();
      } else if (roll < 0.55) {
        deadline = new Date(now + randInt(rand, 3, 30) * 86400000).toISOString();
      }
      groupLabs.push({ group_id: g.id, lab_id: lab.id, deadline });
    });
  });

  // Sessions: lifecycle events + check results + commands per (student, assigned lab).
  const lifecycleEvents: MockLifecycleEvent[] = [];
  const checkResults: MockCheckResult[] = [];
  const commandEvents: MockCommandEvent[] = [];

  const approvedUserIds = memberships.filter((m) => m.status === "approved").map((m) => m.user_id);
  // A handful of students who never started anything (exercises "Never" last-active,
  // 0/N completion) and a handful of "star" students who pass everything they touch
  // (exercises 100% completion, no at-risk despite overdue deadlines).
  const neverActiveIds = new Set([approvedUserIds[2], approvedUserIds[9], approvedUserIds[33]].filter(Boolean));
  const starStudentIds = new Set([approvedUserIds[0], approvedUserIds[20]].filter(Boolean));

  for (const membership of memberships) {
    if (membership.status !== "approved") continue;
    if (neverActiveIds.has(membership.user_id)) continue;
    const user = users.find((u) => u.id === membership.user_id)!;
    const isStar = starStudentIds.has(membership.user_id);
    const assignedLabIds = groupLabs.filter((gl) => gl.group_id === membership.group_id).map((gl) => gl.lab_id);

    for (const labId of assignedLabIds) {
      // A minority of assignments are untouched (not attempted) — realistic spread.
      if (!isStar && rand() < 0.12) continue;

      const sessionCount = weighted(rand, [[1, 5], [2, 4], [3, 3], [4, 1]]);
      let latestPassed = false;

      for (let s = 0; s < sessionCount; s++) {
        const isLast = s === sessionCount - 1;
        const startedAt = daysAgoIso(rand, 1, 45);
        const startDate = new Date(startedAt);
        const durationMin = randInt(rand, 2, 90);
        const endDate = new Date(startDate.getTime() + durationMin * 60000);

        lifecycleEvents.push({ student_id: user.internal_id, lab_id: labId, action: "start", timestamp: startDate.toISOString() });

        const commands = COMMAND_POOL[labId] || [];
        // 8% of sessions record zero commands (e.g. student opened the
        // terminal and closed it) — exercises the "No commands recorded" state.
        const cmdCount = rand() < 0.08 ? 0 : randInt(rand, 3, Math.min(8, commands.length));
        for (let c = 0; c < cmdCount; c++) {
          const cmdTime = new Date(startDate.getTime() + (c + 1) * ((durationMin * 60000) / (cmdCount + 1)));
          // Occasionally a bare Enter keypress with no command text — exercises
          // the "(Enter)" placeholder instead of a truly blank row.
          const command = rand() < 0.06 ? "" : pick(rand, commands);
          commandEvents.push({ student_id: user.internal_id, lab_id: labId, timestamp: cmdTime.toISOString(), command });
        }

        // Weighted outcome: passing gets more likely on later attempts (realistic learning curve).
        const passChance = 0.42 + s * 0.22;
        const passed = isStar ? true : rand() < passChance;
        latestPassed = isLast ? passed : latestPassed;

        const checkDefs = CHECKS_POOL[labId] || [];
        const checks = checkDefs.map((c, i) => ({
          ...c,
          passed: passed ? true : i < Math.floor(checkDefs.length / 2) ? true : false,
        }));
        checkResults.push({
          student_id: user.internal_id,
          lab_id: labId,
          timestamp: endDate.toISOString(),
          check_result: { status: passed ? "fixed" : "vulnerable", passed, checks },
        });

        const endAction = weighted<"end" | "stop" | "auto_stop">(rand, [["end", 6], ["stop", 2], ["auto_stop", 2]]);
        lifecycleEvents.push({
          student_id: user.internal_id,
          lab_id: labId,
          action: endAction,
          timestamp: endDate.toISOString(),
          result: "success",
        });
      }
    }
  }

  lifecycleEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  checkResults.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  commandEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { groups, users, memberships, groupLabs, lifecycleEvents, checkResults, commandEvents };
}

export const store = buildStore();

export const INSTRUCTOR_USER = { username: "instructor@thesis.local", role: "instructor" as const };
export const STUDENT_USER = { username: "anna.krger@tum.de", role: "student" as const, student_id: "student01" };

// Per-lab state for the mock student session (STUDENT_USER's own lab list/detail).
export const studentLabState: Record<string, { status: "not_created" | "running" | "stopped" | "passed"; deadline: string | null }> = {
  [LABS[0].id]: { status: "passed", deadline: null },
  [LABS[1].id]: { status: "running", deadline: new Date(Date.now() + 20 * 3600 * 1000).toISOString() },
  [LABS[2].id]: { status: "stopped", deadline: new Date(Date.now() + 5 * 86400 * 1000).toISOString() },
};

let nextGroupId = Math.max(...store.groups.map((g) => g.id)) + 1;
export function allocGroupId(): number {
  return nextGroupId++;
}
