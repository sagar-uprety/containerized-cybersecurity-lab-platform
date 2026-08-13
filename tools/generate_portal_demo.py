"""Generate the canonical deterministic portal demo fixture from scenario.yaml files."""

from __future__ import annotations

import json
import random
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "controller/lab-controller-api/demo-data.json"
NOW = datetime(2026, 7, 13, 12, 0, tzinfo=timezone.utc)
RNG = random.Random(20260713)

FIRST_NAMES = [
    "Anna",
    "Lukas",
    "Sophie",
    "Maximilian",
    "Lena",
    "Felix",
    "Marie",
    "Jonas",
    "Laura",
    "David",
    "Hannah",
    "Paul",
    "Emma",
    "Leon",
    "Lea",
    "Tim",
    "Julia",
    "Niklas",
    "Sarah",
    "Simon",
    "Mia",
    "Elias",
    "Clara",
    "Jan",
    "Nina",
    "Tom",
    "Johanna",
    "Moritz",
    "Katharina",
    "Philipp",
    "Ayse",
    "Mehmet",
    "Chen",
    "Wei",
    "Priya",
    "Arjun",
    "Elif",
    "Yusuf",
    "Ivan",
    "Olga",
]
LAST_NAMES = [
    "Mueller",
    "Schmidt",
    "Schneider",
    "Fischer",
    "Weber",
    "Meyer",
    "Wagner",
    "Becker",
    "Hoffmann",
    "Schulz",
    "Koch",
    "Bauer",
    "Richter",
    "Klein",
    "Wolf",
    "Neumann",
    "Schwarz",
    "Zimmermann",
    "Braun",
    "Krueger",
    "Yildiz",
    "Demir",
    "Wang",
    "Li",
    "Sharma",
    "Patel",
    "Kaya",
    "Aydin",
    "Ivanov",
    "Petrov",
]
PROGRAMS = [
    "Informatics",
    "Data Engineering & Analytics",
    "Robotics, Cognition, Intelligence",
    "Information Systems",
    "Electrical Engineering",
]
SEMESTERS = ["WS 2025/26", "SS 2026", "WS 2026/27"]
COMMANDS = {
    "redis-exposed": [
        "redis-cli -h redis-host ping",
        "redis-cli -h redis-host ACL LIST",
        "vim /etc/redis/redis.conf",
    ],
    "ssh-weak-config": ["ssh lab-user@ssh-host", "sudo sshd -T", "vim /etc/ssh/sshd_config"],
    "ldap-anonymous-bind": [
        "ldapsearch -x -H ldap://ldap-host",
        "ldapwhoami -x -H ldap://ldap-host",
        "vim /etc/ldap/slapd.conf",
    ],
    "firewall-source-port-bypass": [
        "iptables -L -n -v",
        "curl --local-port 80 http://10.99.0.1:8080",
        "vim /etc/iptables/rules.v4",
    ],
    "unpatched-apache-cve": [
        "curl -I http://apache-host",
        "apache2 -v",
        "sudo apt-get install --only-upgrade apache2",
    ],
    "smb-open-share": [
        "smbclient -L //smb-host -N",
        "smbclient //smb-host/public -N -c ls",
        "vim /etc/samba/smb.conf",
    ],
    "smtp-open-relay": [
        "telnet smtp-host 25",
        "nc -v smtp-host 25",
        "vim /etc/postfix/main.cf",
    ],
    "sample-a-standalone": [
        "curl http://localhost:8080/records",
        'curl -X POST http://localhost:8080/records -d \'{"name":"test"}\'',
        "vim /opt/records-service/records-service.py",
    ],
}

# Generic fallback for any lab without lab-specific demo commands (new samples,
# survey labs, or future scenarios). Keeps demo-dataset generation robust so a
# newly added lab id never breaks the portal deploy.
DEFAULT_COMMANDS = [
    "nmap -sV target-host",
    "curl -sI http://target-host:8080/",
    "vim /lab/config",
]


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z.]", "", normalized.lower())


def load_labs():
    labs = []
    for path in sorted((ROOT / "labs").glob("*/scenario.yaml")):
        scenario = yaml.safe_load(path.read_text(encoding="utf-8"))
        labs.append(
            {
                "id": path.parent.name,
                "title": scenario["title"],
                "difficulty": scenario["difficulty"],
                "story": scenario["story"],
                "checker_version": scenario["checker"]["version"],
                "criteria": [
                    {"name": item["name"], "label": item["label"], "kind": item["kind"]}
                    for item in scenario["checker"]["checks"]
                ],
            }
        )
    return labs


def check_result(lab, progress: float, baseline: bool = False):
    checks = []
    objective_index = 0
    objective_count = sum(1 for item in lab["criteria"] if item["kind"] == "objective")
    for criterion in lab["criteria"]:
        if criterion["kind"] == "guardrail":
            passed = True
            matched = ["vulnerable", "fixed"]
            observed = "fixed"
        else:
            objective_index += 1
            threshold = 0.2 + (objective_index / (objective_count + 1)) * 0.65
            passed = False if baseline else progress >= threshold
            matched = ["fixed" if passed else "vulnerable"]
            observed = matched[0]
        checks.append(
            {
                **criterion,
                "passed": passed,
                "observed_state": observed,
                "matched_states": matched,
                "exit_code": 0,
                "output": "FIXED" if passed else "VULNERABLE",
            }
        )
    objectives = [item for item in checks if item["kind"] == "objective"]
    fixed = sum(1 for item in objectives if item["passed"])
    status = "fixed" if fixed == len(objectives) else "vulnerable" if fixed == 0 else "partial"
    return {
        "status": status,
        "passed": status == "fixed",
        "checker_version": lab["checker_version"],
        "checks": checks,
    }


def main():
    labs = load_labs()
    groups = [
        {
            "id": 1,
            "name": "WS 2026/27 - IN2101 System Security",
            "semester": "WS 2026/27",
            "is_active": True,
            "created_at": iso(NOW - timedelta(days=55)),
        },
        {
            "id": 2,
            "name": "SS 2026 - Security Fundamentals",
            "semester": "SS 2026",
            "is_active": False,
            "created_at": iso(NOW - timedelta(days=110)),
        },
        {
            "id": 3,
            "name": "WS 2025/26 - Advanced Pentesting Lab",
            "semester": "WS 2025/26",
            "is_active": False,
            "created_at": iso(NOW - timedelta(days=210)),
        },
        {
            "id": 4,
            "name": "SS 2027 - Intro to Cybersecurity",
            "semester": "SS 2027",
            "is_active": True,
            "created_at": iso(NOW - timedelta(days=10)),
        },
    ]
    group_sizes = {1: 24, 2: 30, 3: 11, 4: 17}
    pending_counts = {1: 2, 2: 0, 3: 0, 4: 3}
    users = []
    memberships = []
    seen_emails = set()
    user_id = 1
    for group in groups:
        for index in range(group_sizes[group["id"]]):
            first = RNG.choice(FIRST_NAMES)
            last = RNG.choice(LAST_NAMES)
            stem = f"{slug(first)}.{slug(last)}"
            email = f"{stem}@tum.de"
            suffix = 1
            while email in seen_emails:
                email = f"{stem}{suffix}@tum.de"
                suffix += 1
            seen_emails.add(email)
            student_id = f"student{user_id:02d}"
            users.append(
                {
                    "id": user_id,
                    "internal_id": student_id,
                    "number": user_id,
                    "email": email,
                    "semester": RNG.choice(SEMESTERS),
                    "study_program": RNG.choice(PROGRAMS),
                }
            )
            pending = index < pending_counts[group["id"]]
            requested = NOW - timedelta(days=RNG.randint(1, 4) if pending else RNG.randint(12, 45))
            memberships.append(
                {
                    "group_id": group["id"],
                    "user_id": user_id,
                    "status": "pending" if pending else "approved",
                    "requested_at": iso(requested),
                    "approved_at": None if pending else iso(requested + timedelta(days=1)),
                }
            )
            user_id += 1

    lab_ids = [lab["id"] for lab in labs]
    assignments_by_group = {1: lab_ids, 2: lab_ids[:3], 3: lab_ids, 4: lab_ids}
    group_labs = []
    assignment_index = 1
    for group in groups:
        for position, lab_id in enumerate(assignments_by_group[group["id"]]):
            assigned_at = NOW - timedelta(days=65 - position * 8 - group["id"] * 2)
            deadline = None
            if group["id"] == 1 and position < 2:
                deadline = NOW - timedelta(days=7 - position * 3)
            elif group["id"] == 4 and position == 0:
                deadline = NOW + timedelta(days=2)
            elif position % 2 == 0:
                deadline = NOW + timedelta(days=14 + position)
            group_labs.append(
                {
                    "id": assignment_index,
                    "group_id": group["id"],
                    "lab_id": lab_id,
                    "assigned_at": iso(assigned_at),
                    "deadline": iso(deadline) if deadline else None,
                }
            )
            assignment_index += 1

    lifecycle_events = []
    sessions = []
    checks = []
    commands = []
    approved = {item["user_id"]: item for item in memberships if item["status"] == "approved"}
    users_by_id = {item["id"]: item for item in users}
    labs_by_id = {item["id"]: item for item in labs}
    session_counter = 1
    for membership in memberships:
        if membership["status"] != "approved":
            continue
        student = users_by_id[membership["user_id"]]
        for assignment in [
            item for item in group_labs if item["group_id"] == membership["group_id"]
        ]:
            lab = labs_by_id[assignment["lab_id"]]
            session_count = RNG.choices([0, 1, 2, 3], weights=[0.12, 0.38, 0.32, 0.18])[0]
            eligible = max(
                datetime.fromisoformat(assignment["assigned_at"].replace("Z", "+00:00")),
                datetime.fromisoformat(membership["approved_at"].replace("Z", "+00:00")),
            )
            for attempt in range(session_count):
                start = max(
                    eligible + timedelta(days=1 + attempt * 3),
                    NOW - timedelta(days=45 - attempt * 5),
                )
                start += timedelta(hours=RNG.randint(0, 8), minutes=RNG.randint(0, 50))
                duration = RNG.randint(18, 105)
                end = start + timedelta(minutes=duration)
                session_id = f"demo-session-{session_counter:05d}"
                terminal_id = f"demo-terminal-{session_counter:05d}"
                outcome = RNG.choices(
                    ["end", "stop", "auto_stop", "reset"], weights=[0.45, 0.3, 0.15, 0.1]
                )[0]
                close_reason = "idle" if outcome == "auto_stop" else f"student_{outcome}"
                sessions.append(
                    {
                        "id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "group_id": membership["group_id"],
                        "started_at": iso(start),
                        "ended_at": iso(end),
                        "outcome": outcome,
                        "close_reason": close_reason,
                    }
                )
                lifecycle_events.append(
                    {
                        "id": f"demo-event-start-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "actor_id": student["email"],
                        "actor_type": "student",
                        "action": "start",
                        "result": "success",
                        "reason": None,
                        "occurred_at": iso(start),
                        "operation_duration_seconds": round(RNG.uniform(2, 8), 3),
                    }
                )
                baseline = check_result(lab, 0, baseline=True)
                checks.append(
                    {
                        "id": f"demo-check-baseline-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "group_id": membership["group_id"],
                        "actor_id": "system",
                        "actor_type": "system",
                        "phase": "baseline",
                        "occurred_at": iso(start + timedelta(minutes=2)),
                        "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                        "check_result": baseline,
                    }
                )
                lifecycle_events.append(
                    {
                        "id": f"demo-event-check-baseline-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "actor_id": "system",
                        "actor_type": "system",
                        "action": "check",
                        "result": "success",
                        "reason": "baseline",
                        "occurred_at": iso(start + timedelta(minutes=2)),
                        "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                    }
                )
                progress = min(1.0, 0.22 + attempt * 0.38 + RNG.random() * 0.35)
                student_result = check_result(lab, progress)
                checks.append(
                    {
                        "id": f"demo-check-student-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "group_id": membership["group_id"],
                        "actor_id": student["email"],
                        "actor_type": "student",
                        "phase": "student",
                        "occurred_at": iso(end - timedelta(minutes=3)),
                        "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                        "check_result": student_result,
                    }
                )
                lifecycle_events.append(
                    {
                        "id": f"demo-event-check-student-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "actor_id": student["email"],
                        "actor_type": "student",
                        "action": "check",
                        "result": "success",
                        "reason": "student",
                        "occurred_at": iso(end - timedelta(minutes=3)),
                        "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                    }
                )
                if outcome == "end":
                    final_result = check_result(lab, progress)
                    checks.append(
                        {
                            "id": f"demo-check-final-{session_counter:05d}",
                            "session_id": session_id,
                            "student_id": student["internal_id"],
                            "lab_id": lab["id"],
                            "group_id": membership["group_id"],
                            "actor_id": "system",
                            "actor_type": "system",
                            "phase": "final",
                            "occurred_at": iso(end - timedelta(minutes=1)),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                            "check_result": final_result,
                        }
                    )
                    lifecycle_events.append(
                        {
                            "id": f"demo-event-check-final-{session_counter:05d}",
                            "session_id": session_id,
                            "student_id": student["internal_id"],
                            "lab_id": lab["id"],
                            "actor_id": "system",
                            "actor_type": "system",
                            "action": "check",
                            "result": "success",
                            "reason": "final",
                            "occurred_at": iso(end - timedelta(minutes=1)),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                        }
                    )
                for command_position, command in enumerate(
                    RNG.sample(COMMANDS.get(lab["id"], DEFAULT_COMMANDS), 2)
                ):
                    commands.append(
                        {
                            "id": f"demo-command-{session_counter:05d}-{command_position}",
                            "lab_session_id": session_id,
                            "terminal_session_id": terminal_id,
                            "student_id": student["internal_id"],
                            "lab_id": lab["id"],
                            "event": "command",
                            "command": command,
                            "occurred_at": iso(start + timedelta(minutes=5 + command_position * 9)),
                        }
                    )
                lifecycle_events.append(
                    {
                        "id": f"demo-event-close-{session_counter:05d}",
                        "session_id": session_id,
                        "student_id": student["internal_id"],
                        "lab_id": lab["id"],
                        "actor_id": "scheduler" if outcome == "auto_stop" else student["email"],
                        "actor_type": "system" if outcome == "auto_stop" else "student",
                        "action": outcome,
                        "result": "success",
                        "reason": close_reason,
                        "occurred_at": iso(end),
                        "operation_duration_seconds": round(RNG.uniform(0.5, 4), 3),
                    }
                )
                session_counter += 1

    # Explicit open and environment-error examples.
    first_student = users_by_id[min(approved)]
    open_lab = labs[0]
    open_session_id = f"demo-session-{session_counter:05d}"
    sessions.append(
        {
            "id": open_session_id,
            "student_id": first_student["internal_id"],
            "lab_id": open_lab["id"],
            "group_id": 1,
            "started_at": iso(NOW - timedelta(minutes=75)),
            "ended_at": None,
            "outcome": "running",
            "close_reason": None,
        }
    )
    lifecycle_events.append(
        {
            "id": "demo-event-open",
            "session_id": open_session_id,
            "student_id": first_student["internal_id"],
            "lab_id": open_lab["id"],
            "actor_id": first_student["email"],
            "actor_type": "student",
            "action": "start",
            "result": "success",
            "reason": None,
            "occurred_at": iso(NOW - timedelta(minutes=75)),
            "operation_duration_seconds": 3.2,
        }
    )
    open_baseline = check_result(open_lab, 0, baseline=True)
    checks.append(
        {
            "id": "demo-check-open-baseline",
            "session_id": open_session_id,
            "student_id": first_student["internal_id"],
            "lab_id": open_lab["id"],
            "group_id": 1,
            "actor_id": "system",
            "actor_type": "system",
            "phase": "baseline",
            "occurred_at": iso(NOW - timedelta(minutes=73)),
            "operation_duration_seconds": 1.2,
            "check_result": open_baseline,
        }
    )
    lifecycle_events.append(
        {
            "id": "demo-event-open-baseline",
            "session_id": open_session_id,
            "student_id": first_student["internal_id"],
            "lab_id": open_lab["id"],
            "actor_id": "system",
            "actor_type": "system",
            "action": "check",
            "result": "success",
            "reason": "baseline",
            "occurred_at": iso(NOW - timedelta(minutes=73)),
            "operation_duration_seconds": 1.2,
        }
    )
    lifecycle_events.append(
        {
            "id": "demo-event-error",
            "session_id": None,
            "student_id": users_by_id[3]["internal_id"],
            "lab_id": labs[1]["id"],
            "actor_id": users_by_id[3]["email"],
            "actor_type": "student",
            "action": "start",
            "result": "error",
            "reason": "worker_unavailable",
            "occurred_at": iso(NOW - timedelta(days=3)),
            "operation_duration_seconds": 4.1,
        }
    )

    feedback = []
    feedback_targets = {
        lab["id"]: (3 if lab["id"] == "unpatched-apache-cve" else 7) for lab in labs
    }
    for lab_id, count in feedback_targets.items():
        candidates = [
            item for item in sessions if item["lab_id"] == lab_id and item["outcome"] == "end"
        ][:count]
        for index, lab_session in enumerate(candidates):
            feedback.append(
                {
                    "id": f"demo-feedback-{lab_id}-{index}",
                    "lab_session_id": lab_session["id"],
                    "student_id": lab_session["student_id"],
                    "lab_id": lab_id,
                    "section_a": (
                        "The lab connected the vulnerability to a concrete configuration decision."
                    ),
                    "section_b_rating": 2 + (index % 4),
                    "section_b": (
                        "The checker feedback was useful; one remediation step could be clearer."
                    ),
                    "issue_category": ["instructions", "checker", "difficulty", None][index % 4],
                    "occurred_at": lab_session["ended_at"],
                }
            )

    interventions = [
        {
            "student_id": users[4]["internal_id"],
            "group_id": 1,
            "lab_id": labs[0]["id"],
            "reason": "repeated_criterion_failure",
            "note": "Review the unresolved objective and offer the first conceptual hint.",
            "owner": "instructor@thesis.local",
            "status": "open",
            "follow_up_at": iso(NOW + timedelta(days=2)),
        },
        {
            "student_id": users[28]["internal_id"],
            "group_id": 2,
            "lab_id": labs[1]["id"],
            "reason": "no_check_recorded",
            "note": "Confirm access and ask the student to submit a technical check.",
            "owner": "instructor@thesis.local",
            "status": "contacted",
            "follow_up_at": iso(NOW + timedelta(days=1)),
        },
    ]
    payload = {
        "schema_version": 1,
        "generated_at": iso(NOW),
        "labs": labs,
        "groups": groups,
        "users": users,
        "memberships": memberships,
        "group_labs": group_labs,
        "sessions": sessions,
        "lifecycle_events": lifecycle_events,
        "checks": checks,
        "commands": commands,
        "feedback": feedback,
        "interventions": interventions,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(
        f"Wrote {OUTPUT} ({len(users)} users, {len(sessions)} sessions, {len(checks)} checks)\n"
    )


if __name__ == "__main__":
    main()
