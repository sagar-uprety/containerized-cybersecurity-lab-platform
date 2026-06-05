import logging
import re
import sys

from labctl_core.lifecycle import LabctlError, LabRuntime

LAB_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
STUDENT_ID_PATTERN = re.compile(r"^student[0-9]{2,4}$")


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main() -> None:
    setup_logging()

    if len(sys.argv) != 4:
        print("Usage: labctl <verb> <lab_id> <student_id>", file=sys.stderr)
        sys.exit(1)

    verb, lab_id, student_id = sys.argv[1], sys.argv[2], sys.argv[3]
    if not LAB_ID_PATTERN.fullmatch(lab_id):
        logging.error("Invalid lab_id format: %s", lab_id)
        sys.exit(1)
    if not STUDENT_ID_PATTERN.fullmatch(student_id):
        logging.error("Invalid student_id format: %s", student_id)
        sys.exit(1)

    runtime = LabRuntime()
    verbs = {
        "start": runtime.start,
        "stop": runtime.stop,
        "reset": runtime.reset,
        "destroy": runtime.destroy,
        "check": runtime.check,
        "status": runtime.status,
    }
    if verb not in verbs:
        logging.error("Unknown verb: %s", verb)
        sys.exit(1)

    try:
        verbs[verb](lab_id, student_id)
    except LabctlError as exc:
        logging.error("%s", exc)  # noqa: TRY400 - expected CLI error, no stack trace needed.
        sys.exit(1)
