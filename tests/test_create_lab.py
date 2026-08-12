"""Contract test for the instructor-facing lab scaffold command."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from copy import deepcopy
from pathlib import Path

import jsonschema
import yaml

from tools.create_lab import create_lab
from tools.pre_commit.validate_scenarios import validate_scenario

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "controller"))

from labctl_core.manifest import build_manifest  # noqa: E402
from labctl_core.podman import container_run_args  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="create-lab-contract-") as temp_name:
        temp_root = Path(temp_name)
        templates = temp_root / "labs" / "templates-contract"
        templates.mkdir(parents=True)
        shutil.copy2(
            ROOT / "labs" / "templates-contract" / "scenario.schema.json",
            templates / "scenario.schema.json",
        )
        shutil.copytree(ROOT / "labs" / "sample-lab", temp_root / "labs" / "sample-lab")
        (temp_root / "docs" / "labs").mkdir(parents=True)

        created = create_lab(
            temp_root,
            "example-security-lab",
            'Example "Quoted" Security Lab',
            "advanced",
        )
        assert len(created) == 4

        lab_dir = temp_root / "labs" / "example-security-lab"
        assert not (lab_dir / "docs" / "AUTHORING.md").exists()
        scenario_path = lab_dir / "scenario.yaml"
        scenario = yaml.safe_load(scenario_path.read_text(encoding="utf-8"))
        schema = json.loads((templates / "scenario.schema.json").read_text(encoding="utf-8"))
        jsonschema.validate(instance=scenario, schema=schema)

        assert scenario["id"] == "example-security-lab"
        assert scenario["title"] == 'Example "Quoted" Security Lab'
        assert scenario["difficulty"] == "advanced"
        assert scenario["documentation"]["student_guide_url"] == (
            "/docs/labs/example-security-lab/"
        )
        assert scenario["build"]["images"][0]["name"] == (
            "thesis-labs/example-security-lab-service:latest"
        )
        assert "sample-lab" not in scenario_path.read_text(encoding="utf-8")

        unsafe_mount = deepcopy(scenario)
        unsafe_mount["containers"][0]["volumes"].append(
            {"host_path": "/etc", "target": "/host-etc", "read_only": True}
        )
        scenario_path.write_text(yaml.safe_dump(unsafe_mount), encoding="utf-8")
        assert any(
            "host_path must stay under" in error
            for error in validate_scenario(schema, scenario_path)
        )

        missing_network = deepcopy(scenario)
        missing_network["containers"][0].pop("networks")
        scenario_path.write_text(yaml.safe_dump(missing_network), encoding="utf-8")
        assert any(
            "must declare networks" in error for error in validate_scenario(schema, scenario_path)
        )

        expected_stubs = {
            "example-security-lab.md": (
                '--8<-- "labs/example-security-lab/docs/student-guide.md"\n'
            ),
            "example-security-lab-solution.md": (
                '--8<-- "labs/example-security-lab/docs/solution-notes.md"\n'
            ),
            "example-security-lab-instructor.md": (
                '--8<-- "labs/example-security-lab/docs/instructor-guide.md"\n'
            ),
        }
        for filename, expected in expected_stubs.items():
            assert (temp_root / "docs" / "labs" / filename).read_text(encoding="utf-8") == (
                expected
            )

        try:
            create_lab(temp_root, "example-security-lab", "Duplicate", "beginner")
        except FileExistsError:
            pass
        else:
            raise AssertionError("duplicate lab creation overwrote existing files")

        try:
            create_lab(temp_root, "Bad Lab ID", "Invalid", "beginner")
        except ValueError:
            pass
        else:
            raise AssertionError("invalid lab id was accepted")

        sample = yaml.safe_load(
            (ROOT / "labs" / "sample-lab" / "scenario.yaml").read_text(encoding="utf-8")
        )
        context = {
            "lab_id": "sample-lab",
            "student_id": "student01",
            "runtime_project": "sample-lab_student01",
            "thesis_platform_name": "thesis-labs",
            "student_password": "dummy-password",
            "ttyd_credential": "student01:dummy-password",
            "host_bind_ip": "0.0.0.0",
            "ssh_port": 22001,
            "browser_terminal_port": 19001,
            "lab_source_root": "/opt/thesis-labs/labs",
            "resources": sample["resources"],
            "images": {},
        }
        manifest = build_manifest(sample, context)
        workstation = next(
            item for item in manifest["containers"] if item["hostname"] == "workstation"
        )
        # SITREP.txt was retired; the workstation must no longer carry its mount.
        assert not any(
            vol["target"] == "/opt/lab/student/SITREP.txt" for vol in workstation["volumes"]
        )
        args = container_run_args(
            {
                "name": "read-only-test",
                "image": "example.invalid/test:latest",
                "volumes": [{"source": "/source", "target": "/target", "read_only": True}],
            }
        )
        assert "/source:/target:ro" in args


if __name__ == "__main__":
    main()
