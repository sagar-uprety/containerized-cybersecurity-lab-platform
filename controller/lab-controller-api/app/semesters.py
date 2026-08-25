"""Canonical semester values accepted by portal forms."""

SEMESTERS = (
    "SS 2026",
    "WS 2026/27",
    "SS 2027",
    "WS 2027/28",
    "SS 2028",
    "WS 2028/29",
    "SS 2029",
    "WS 2029/30",
    "SS 2030",
)


def validate_semester(value: object) -> str:
    semester = str(value or "").strip()
    if semester not in SEMESTERS:
        raise ValueError(f"semester must be one of: {', '.join(SEMESTERS)}")
    return semester
