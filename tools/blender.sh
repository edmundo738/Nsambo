#!/bin/bash
# blender.sh — corre um script python no Blender headless (bpy) deste workspace.
# Uso: tools/blender.sh meu_script.py [args…]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$REPO/app/tools/.blender-libs/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$REPO/app/tools/.venv-blender/bin/python" "$@"
