import json
import logging
import re
import sys

from labctl_core.config import RuntimePaths
from labctl_core.lifecycle import LabctlError, LabRuntime
from labctl_core.scenario import ScenarioError, load_scenario
from labctl_core.system_status import system_status

LAB_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
STUDENT_ID_PATTERN = re.compile(r"^student[0-9]{2,4}$")


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main() -> None:
    setup_logging()

    if len(sys.argv) < 2:
        print("Usage: labctl <verb> <lab_id> <student_id>", file=sys.stderr)
        print("       labctl destroy-all <lab_id>", file=sys.stderr)
        print("       labctl destroy-all --all-labs", file=sys.stderr)
        print("       labctl validate <lab_id>", file=sys.stderr)
        sys.exit(1)

    verb, args = sys.argv[1], sys.argv[2:]

    if verb == "validate":
        if len(args) != 1 or not LAB_ID_PATTERN.fullmatch(args[0]):
            print("Usage: labctl validate <lab_id>", file=sys.stderr)
            sys.exit(1)
        try:
            load_scenario(RuntimePaths(), args[0])
        except ScenarioError as exc:
            logging.error("%s", exc)  # noqa: TRY400 - expected CLI error, no stack trace needed.
            sys.exit(1)
        print(f"{args[0]}: valid")
        return

    if verb == "system-status":
        print(json.dumps(system_status()))
        return

    if verb == "destroy-all":
        runtime = LabRuntime()
        try:
            if args and args[0] == "--all-labs":
                runtime.destroy_all_labs()
            elif len(args) == 1:
                lab_id = args[0]
                if not LAB_ID_PATTERN.fullmatch(lab_id):
                    logging.error("Invalid lab_id format: %s", lab_id)
                    sys.exit(1)
                runtime.destroy_all(lab_id)
            else:
                print("Usage: labctl destroy-all <lab_id>", file=sys.stderr)
                print("       labctl destroy-all --all-labs", file=sys.stderr)
                sys.exit(1)
        except LabctlError:
            logging.exception("destroy-all failed")
            sys.exit(1)
        return

    if len(sys.argv) != 4:
        print("Usage: labctl <verb> <lab_id> <student_id>", file=sys.stderr)
        sys.exit(1)

    lab_id, student_id = args[0], args[1]
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
