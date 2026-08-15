#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export ANSIBLE_CONFIG="$PROJECT_ROOT/config/ansible.cfg"
ANSIBLE="$PROJECT_ROOT/.venv/bin/ansible"
INVENTORY="$PROJECT_ROOT/infra/inventory.ini"

check_vm() {
    local vm=$1
    echo ""
    echo "══════════════════════════════════════════════════"
    echo "  $vm"
    echo "══════════════════════════════════════════════════"

    $ANSIBLE "$vm" -i "$INVENTORY" -m shell -a '
echo "--- CPU ---"
top -bn1 | head -5
echo ""
echo "--- MEMORY ---"
free -h
echo ""
echo "--- DISK ---"
df -h /
echo ""
echo "--- PODMAN ---"
podman stats --no-stream 2>/dev/null || echo "(podman not running or no containers)"
' 2>&1 || true
}

echo "VM Resource Check - $(date)"
check_vm "x01"
check_vm "x02"
