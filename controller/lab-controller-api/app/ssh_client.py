import subprocess
import logging
from app.config import settings

logger = logging.getLogger(__name__)

def run_labctl(verb: str, lab_id: str, student_id: str):
    """
    Executes: ssh labadmin@x01 labctl <verb> <lab_id> <student_id>
    """
    cmd = [
        "ssh",
        "-i", settings.SSH_KEY_PATH,
        "-o", f"StrictHostKeyChecking={settings.SSH_STRICT_HOST_KEY_CHECKING}",
        "-o", f"UserKnownHostsFile={settings.SSH_KNOWN_HOSTS}",
        "-o", "PasswordAuthentication=no",
        "-o", "BatchMode=yes",
        f"{settings.WORKER_USER}@{settings.WORKER_HOST}",
        "labctl", verb, lab_id, student_id
    ]
    
    logger.info("Executing labctl verb=%s lab=%s student=%s", verb, lab_id, student_id)
    
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
        logger.error(f"SSH Command timed out for {verb} {lab_id} {student_id}")
        return False, "", "Timeout"
    except Exception as e:
        logger.error(f"SSH Command error: {e}")
        return False, "", str(e)

