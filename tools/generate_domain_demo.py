# ruff: noqa: INP001
"""Generate targeted historical demo cohorts for the four domain groups."""

from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from generate_portal_demo import (
    COMMANDS,
    DEFAULT_COMMANDS,
    FIRST_NAMES,
    LAST_NAMES,
    PROGRAMS,
    check_result,
    iso,
    load_labs,
    slug,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "controller/lab-controller-api/domain-demo-data.json"
NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)
RNG = random.Random(20260825)

ARCHIVE_GROUPS = [
    "Leon Group",
    "Noah Test Group",
    "SS 2027 - Intro to Cybersecurity",
    "WS 2025/26 - Advanced Pentesting Lab",
    "WS 2026/27 - IN2101 System Security",
]

TARGET_GROUPS = [
    {
        "name": "Network Security Fundamentals",
        "owner_email": "netsec-instructor@thesis.local",
        "semester": "WS 2026/27",
        "size": 28,
        "labs": [
            "firewall-source-port-bypass",
            "network-zone-isolation",
            "dnssec-misconfiguration",
        ],
    },
    {
        "name": "Identity and Access Management",
        "owner_email": "iam-instructor@thesis.local",
        "semester": "WS 2026/27",
        "size": 24,
        "labs": ["ssh-weak-config", "ldap-anonymous-bind", "ftp-anonymous-access"],
    },
    {
        "name": "Data and Application Security",
        "owner_email": "appsec-instructor@thesis.local",
        "semester": "WS 2026/27",
        "size": 36,
        "labs": [
            "redis-exposed",
            "mysql-permissions",
            "unpatched-apache-cve",
            "smb-open-share",
        ],
    },
    {
        "name": "Service Exposure and Hardening",
        "owner_email": "hardening-instructor@thesis.local",
        "semester": "WS 2026/27",
        "size": 31,
        "labs": ["smtp-open-relay", "survey-nginx-hardening", "banner-exposure"],
    },
]


def main() -> None:
    labs = {item["id"]: item for item in load_labs()}
    expected_labs = {lab_id for group in TARGET_GROUPS for lab_id in group["labs"]}
    missing = sorted(expected_labs - labs.keys())
    if missing:
        raise ValueError(f"Unknown domain demo labs: {', '.join(missing)}")

    users = []
    assignments = []
    sessions = []
    lifecycle_events = []
    checks = []
    commands = []
    feedback = []
    used_emails = set()
    student_number = 8000
    session_number = 1

    for group in TARGET_GROUPS:
        for lab_index, lab_id in enumerate(group["labs"]):
            assigned_at = NOW - timedelta(days=82 - lab_index * 5)
            assignments.append(
                {
                    "group_name": group["name"],
                    "lab_id": lab_id,
                    "assigned_at": iso(assigned_at),
                    "deadline": iso(NOW - timedelta(days=4 + (len(group["labs"]) - lab_index) * 3)),
                }
            )

        for student_index in range(group["size"]):
            first = RNG.choice(FIRST_NAMES)
            last = RNG.choice(LAST_NAMES)
            stem = f"{slug(first)}.{slug(last)}"
            email = f"{stem}@tum.de"
            suffix = 2
            while email in used_emails:
                email = f"{stem}{suffix}@tum.de"
                suffix += 1
            used_emails.add(email)
            internal_id = f"student{student_number}"
            approved_at = NOW - timedelta(days=76 - student_index % 9)
            users.append(
                {
                    "email": email,
                    "internal_id": internal_id,
                    "number": student_number,
                    "group_name": group["name"],
                    "semester": group["semester"],
                    "study_program": RNG.choice(PROGRAMS),
                    "created_at": iso(approved_at - timedelta(days=3)),
                    "requested_at": iso(approved_at - timedelta(days=2)),
                    "approved_at": iso(approved_at),
                }
            )
            student_number += 1

            for lab_index, lab_id in enumerate(group["labs"]):
                lab = labs[lab_id]
                session_count = RNG.choices([0, 1, 2, 3], weights=[0.1, 0.4, 0.35, 0.15])[0]
                for attempt in range(session_count):
                    days_ago = max(
                        2,
                        58 - ((student_index * 7 + lab_index * 13 + attempt * 17) % 54),
                    )
                    start = NOW - timedelta(
                        days=days_ago,
                        hours=RNG.randint(1, 9),
                        minutes=RNG.randint(0, 55),
                    )
                    duration = RNG.randint(22, 112)
                    end = start + timedelta(minutes=duration)
                    session_id = f"domain-demo-session-{session_number:05d}"
                    terminal_id = f"domain-demo-terminal-{session_number:05d}"
                    outcome = RNG.choices(
                        ["end", "stop", "auto_stop", "reset"],
                        weights=[0.5, 0.27, 0.13, 0.1],
                    )[0]
                    close_reason = "idle" if outcome == "auto_stop" else f"student_{outcome}"
                    sessions.append(
                        {
                            "id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "group_name": group["name"],
                            "started_at": iso(start),
                            "ended_at": iso(end),
                            "outcome": outcome,
                            "close_reason": close_reason,
                        }
                    )
                    lifecycle_events.append(
                        {
                            "id": f"domain-demo-event-start-{session_number:05d}",
                            "session_id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "actor_id": internal_id,
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
                            "id": f"domain-demo-check-baseline-{session_number:05d}",
                            "session_id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "group_name": group["name"],
                            "actor_id": "system",
                            "actor_type": "system",
                            "phase": "baseline",
                            "occurred_at": iso(start + timedelta(minutes=2)),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                            "check_result": baseline,
                        }
                    )
                    progress = min(1.0, 0.3 + attempt * 0.34 + RNG.random() * 0.48)
                    student_result = check_result(lab, progress)
                    checks.append(
                        {
                            "id": f"domain-demo-check-student-{session_number:05d}",
                            "session_id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "group_name": group["name"],
                            "actor_id": internal_id,
                            "actor_type": "student",
                            "phase": "student",
                            "occurred_at": iso(end - timedelta(minutes=3)),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                            "check_result": student_result,
                        }
                    )
                    lifecycle_events.append(
                        {
                            "id": f"domain-demo-event-check-{session_number:05d}",
                            "session_id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "actor_id": internal_id,
                            "actor_type": "student",
                            "action": "check",
                            "result": "success",
                            "reason": "student",
                            "occurred_at": iso(end - timedelta(minutes=3)),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 2.5), 3),
                        }
                    )
                    for command_index, command in enumerate(
                        RNG.sample(COMMANDS.get(lab_id, DEFAULT_COMMANDS), 2)
                    ):
                        commands.append(
                            {
                                "id": f"domain-demo-command-{session_number:05d}-{command_index}",
                                "lab_session_id": session_id,
                                "terminal_session_id": terminal_id,
                                "student_id": internal_id,
                                "lab_id": lab_id,
                                "event": "command",
                                "command": command,
                                "occurred_at": iso(
                                    start + timedelta(minutes=6 + command_index * 11)
                                ),
                            }
                        )
                    lifecycle_events.append(
                        {
                            "id": f"domain-demo-event-close-{session_number:05d}",
                            "session_id": session_id,
                            "student_id": internal_id,
                            "lab_id": lab_id,
                            "actor_id": "scheduler" if outcome == "auto_stop" else internal_id,
                            "actor_type": "system" if outcome == "auto_stop" else "student",
                            "action": outcome,
                            "result": "success",
                            "reason": close_reason,
                            "occurred_at": iso(end),
                            "operation_duration_seconds": round(RNG.uniform(0.5, 4), 3),
                        }
                    )
                    if outcome == "end" and session_number % 4 == 0:
                        feedback.append(
                            {
                                "id": f"domain-demo-feedback-{session_number:05d}",
                                "lab_session_id": session_id,
                                "student_id": internal_id,
                                "lab_id": lab_id,
                                "section_a": (
                                    "The exercise connected the observed exposure to a concrete "
                                    "configuration decision."
                                ),
                                "section_b_rating": 3 + session_number % 3,
                                "section_b": (
                                    "The investigation flow was realistic and the checker made "
                                    "progress clear."
                                ),
                                "issue_category": [None, "instructions", "difficulty"][
                                    session_number % 3
                                ],
                                "occurred_at": iso(end),
                            }
                        )
                    session_number += 1

    payload = {
        "schema_version": 1,
        "generated_at": iso(NOW),
        "archive_groups": ARCHIVE_GROUPS,
        "semester_updates": {"System Security (Survey)": "SS 2026"},
        "groups": TARGET_GROUPS,
        "users": users,
        "assignments": assignments,
        "sessions": sessions,
        "lifecycle_events": lifecycle_events,
        "checks": checks,
        "commands": commands,
        "feedback": feedback,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(
        f"Wrote {OUTPUT} ({len(users)} users, {len(sessions)} sessions, "
        f"{len(checks)} checks, {len(commands)} commands)\n"
    )


if __name__ == "__main__":
    main()
