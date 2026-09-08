#!/usr/bin/env bash
# Wrapper que usa o virtualenv local (.venv) se existir.
# Cria o venv + instala Pillow automaticamente na primeira execução.
set -euo pipefail

cd "$(dirname "$0")/.."

VENV_DIR=".venv"
# Força o PyPI público: algumas máquinas têm PIP_CONFIG_FILE apontando pra
# um mirror corporativo que não tem/autoriza pacotes pessoais.
PIP_INDEX_ARGS=(--index-url https://pypi.org/simple)

if [ ! -x "${VENV_DIR}/bin/python" ]; then
  echo "Criando virtualenv em ${VENV_DIR}..."
  python3 -m venv "${VENV_DIR}"
  "${VENV_DIR}/bin/pip" install --quiet "${PIP_INDEX_ARGS[@]}" --upgrade pip
fi

if ! "${VENV_DIR}/bin/python" -c "import PIL" 2>/dev/null; then
  echo "Instalando Pillow no venv..."
  "${VENV_DIR}/bin/pip" install --quiet "${PIP_INDEX_ARGS[@]}" Pillow
fi

exec "${VENV_DIR}/bin/python" scripts/generate-estoque-thumbs.py "$@"
