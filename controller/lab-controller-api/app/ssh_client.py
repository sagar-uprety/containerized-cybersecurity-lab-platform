import logging
import subprocess
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def _ssh_base_cmd() -> list[str]:
    return [
        "ssh",
        "-i",
        settings.SSH_KEY_PATH,
        "-o",
        f"StrictHostKeyChecking={settings.SSH_STRICT_HOST_KEY_CHECKING}",
        "-o",
        f"UserKnownHostsFile={settings.SSH_KNOWN_HOSTS}",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "BatchMode=yes",
        "-o",
        "ControlMaster=auto",
        "-o",
        "ControlPath=/tmp/ssh-portal-%r@%h:%p",
        "-o",
        "ControlPersist=600",
        f"{settings.WORKER_USER}@{settings.WORKER_HOST}",
    ]


def run_labctl(verb: str, lab_id: str, student_id: str, lab_password: Optional[str] = None):
    """
    Executes: ssh labadmin@x01 labctl <verb> <lab_id> <student_id>

    When `lab_password` is given (start/reset), it is written to the ssh process
    stdin - never argv - so the restricted wrapper (which logs argv and forbids
    special characters) cannot expose it. labctl reads it on stdin.
    """
    cmd = [*_ssh_base_cmd(), "labctl", verb, lab_id, student_id]

    logger.info("Executing labctl verb=%s lab=%s student=%s", verb, lab_id, student_id)

    # Pass the password on stdin (newline-terminated) only when provided.
    stdin_input = f"{lab_password}\n" if lab_password else None

    try:
        result = subprocess.run(
            cmd,
            input=stdin_input,
            capture_output=True,
            text=True,
            timeout=settings.SSH_COMMAND_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            logger.error(f"SSH Command Failed. Exit: {result.returncode}, STDERR: {result.stderr}")
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        logger.exception("SSH command timed out for %s %s %s", verb, lab_id, student_id)
        return False, "", "Timeout"
    except Exception as exc:
        logger.exception("SSH command error")
        return False, "", str(exc)


def run_labctl_system_status():
    """Executes: ssh labadmin@x01 labctl system-status (no lab/student args)."""
    cmd = [*_ssh_base_cmd(), "labctl", "system-status"]
    logger.info("Executing labctl system-status")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.SSH_COMMAND_TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            logger.error(f"SSH Command Failed. Exit: {result.returncode}, STDERR: {result.stderr}")
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        logger.exception("SSH command timed out for system-status")
        return False, "", "Timeout"
    except Exception as exc:
        logger.exception("SSH command error")
        return False, "", str(exc)
