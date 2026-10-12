#!/usr/bin/env bash
# Wrapper que usa o virtualenv local (.venv) se existir.
# Cria o venv + instala Pillow automaticamente na primeira execução.
set -euo pipefail

cd "$(dirname "$0")/.."
source scripts/_venv.sh

exec "${VENV_DIR}/bin/python" scripts/generate-og-image.py "$@"
