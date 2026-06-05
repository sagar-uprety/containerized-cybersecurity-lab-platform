import os
from pathlib import Path


class RuntimePaths:
    def __init__(self) -> None:
        base_dir = Path(os.environ.get("THESIS_LABS_BASE_DIR", "/opt/thesis-labs"))
        state_dir = Path(os.environ.get("THESIS_LABS_STATE_DIR", "/var/lib/thesis-labs"))

        if not base_dir.exists() and Path("labs").exists():
            base_dir = Path.cwd()
            state_dir = base_dir / "state"

        self.base_dir = base_dir
        self.state_dir = state_dir
        self.labs_dir = base_dir / "labs"
        self.rendered_dir = state_dir / "rendered"
        self.results_dir = state_dir / "results"
        self.student_credentials = Path(
            os.environ.get("THESIS_LABS_STUDENT_CREDENTIALS", "/etc/thesis-labs/students.yml")
        )

    def command_log_path(self, volume_mountpoint: str) -> Path:
        return Path(volume_mountpoint) / "commands.jsonl"

    def ensure_state_dirs(self) -> None:
        self.rendered_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)
