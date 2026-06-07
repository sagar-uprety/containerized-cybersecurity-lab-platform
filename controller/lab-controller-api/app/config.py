import os


def _bool_from_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_from_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return int(value)


class Settings:
    WORKER_HOST = os.environ.get("WORKER_HOST", "127.0.0.1")
    WORKER_USER = os.environ.get("WORKER_USER", "labadmin")
    SSH_KEY_PATH = os.environ.get("SSH_KEY_PATH", "/var/lib/thesis-labs/controller_key")
    SSH_KNOWN_HOSTS = os.environ.get("SSH_KNOWN_HOSTS", "/var/lib/thesis-labs/known_hosts")
    SSH_STRICT_HOST_KEY_CHECKING = os.environ.get("SSH_STRICT_HOST_KEY_CHECKING", "accept-new")
    SSH_COMMAND_TIMEOUT_SECONDS = _int_from_env("SSH_COMMAND_TIMEOUT_SECONDS", 60)

    SCENARIO_REGISTRY = os.environ.get("SCENARIO_REGISTRY", "/etc/thesis-labs/scenarios.txt")
    STUDENT_REGISTRY = os.environ.get("STUDENT_REGISTRY", "/etc/thesis-labs/students.txt")
    PORTAL_USERS_FILE = os.environ.get("PORTAL_USERS_FILE", "/etc/thesis-labs/portal-users.yml")
    LABS_DIR = os.environ.get("LABS_DIR", "/opt/thesis-labs/labs")
    RESULTS_DIR = os.environ.get("RESULTS_DIR", "/var/lib/thesis-labs/results")

    MAX_CONCURRENT_STUDENTS = _int_from_env("MAX_CONCURRENT_STUDENTS", 5)
    EVALUATION_MODE = _bool_from_env("EVALUATION_MODE", False)
    ENABLE_SCHEDULER = _bool_from_env("ENABLE_SCHEDULER", True)
    EVENT_LOG_PATH = os.environ.get("EVENT_LOG_PATH", "/var/log/thesis-labs/portal-events.jsonl")
    FORM_TOKEN_TTL_SECONDS = _int_from_env("FORM_TOKEN_TTL_SECONDS", 3600)
    SCHEDULER_INTERVAL_SECONDS = _int_from_env("SCHEDULER_INTERVAL_SECONDS", 60)


settings = Settings()
