#!/usr/bin/env python3
"""Gera thumbs (`*-thumb.webp`) para as fotos da loja em assets/img/estoque/.

O grid da loja (/loja/) servia a imagem original (até 1200x1600px, ~150KB) em
cada card, mesmo em telas pequenas. Este script gera uma versão reduzida de
cada foto, no mesmo espírito do que scripts/update-gallery.py já faz para a
galeria do Instagram: o grid passa a usar o thumb (leve) e o lightbox (zoom)
continua usando a imagem original em alta resolução.

USO RECOMENDADO (cria venv + instala Pillow automaticamente):
    ./scripts/generate-estoque-thumbs.sh

Rode de novo sempre que adicionar fotos novas em assets/img/estoque/ — o
script pula fotos que já têm thumb atualizado.
"""

import os

ESTOQUE_DIR = "assets/img/estoque"
THUMB_WIDTH = 480
WEBP_QUALITY_THUMB = 80


def _is_original(filename):
    return filename.endswith(".webp") and not filename.endswith("-thumb.webp")


def main():
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit(
            "Pillow é necessário para gerar os thumbs. "
            "Rode ./scripts/generate-estoque-thumbs.sh (cria o venv e instala)."
        )

    originais = sorted(f for f in os.listdir(ESTOQUE_DIR) if _is_original(f))
    gerados = []
    pulados = []

    for nome in originais:
        origem = os.path.join(ESTOQUE_DIR, nome)
        destino = os.path.join(ESTOQUE_DIR, nome[:-5] + "-thumb.webp")

        if os.path.exists(destino) and os.path.getmtime(destino) >= os.path.getmtime(origem):
            pulados.append(nome)
            continue

        with Image.open(origem) as im:
            im = im.convert("RGB")
            w, h = im.size
            thumb_w = min(w, THUMB_WIDTH)  # nunca faz upscale
            thumb_h = round(h * thumb_w / w)
            thumb = im.resize((thumb_w, thumb_h), Image.LANCZOS)
            thumb.save(destino, "WEBP", quality=WEBP_QUALITY_THUMB, method=6)
        gerados.append(nome)

    print(f"Thumbs gerados: {len(gerados)}")
    for nome in gerados:
        print(f"  {nome}")
    if pulados:
        print(f"Já atualizados (pulados): {len(pulados)}")


if __name__ == "__main__":
    main()
