#!/usr/bin/env python3
"""Extrai o dataset de perfis de impressora usado pelo Conversor 3MF
(`/conversor-3mf/`) a partir do código-fonte de uma ferramenta de referência
que declara `const PERFIS = { chave: {"nome":..., "base": {...}}, ... }`.

Gera assets/data/printer-profiles.json com o mesmo formato — só os dados de
perfil (nome/marca/base de configurações), sem HTML/CSS/JS/textos da
ferramenta original.

USO:
    python3 scripts/extract-printer-profiles.py <arquivo-fonte.txt>

Rode de novo sempre que quiser atualizar/adicionar impressoras ao conversor.
"""

import html
import json
import re
import sys

OUTPUT_PATH = "assets/data/printer-profiles.json"


def extract_balanced_object(text, start_brace):
    depth = 0
    in_str = False
    esc = False
    i = start_brace
    while i < len(text):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start_brace:i + 1]
        i += 1
    raise ValueError("chaves não balanceadas — não encontrei o fim do objeto PERFIS")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        raw = f.read()

    text = html.unescape(raw)

    marker = "const PERFIS = {"
    marker_pos = text.find(marker)
    if marker_pos == -1:
        raise SystemExit("não encontrei 'const PERFIS = {' no arquivo fonte")

    start_brace = text.find("{", marker_pos)
    obj_text = extract_balanced_object(text, start_brace)

    # JS permite chave de nível superior sem aspas (ex.: `bbl_a1: {...}`);
    # JSON exige aspas — só o nível superior precisa disso, o resto do objeto
    # (dentro de "base": {...}) já vem com todas as chaves entre aspas.
    obj_text = re.sub(r'(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):(\s*\{)', r'\1"\2":\3', obj_text)

    perfis = json.loads(obj_text)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(perfis, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(perfis)} impressoras gravadas em {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
