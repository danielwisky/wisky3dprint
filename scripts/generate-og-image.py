#!/usr/bin/env python3
"""Gera assets/img/og-image.jpg (1200x630) com grid 3x2 das 6 primeiras fotos
da galeria, usada como preview ao compartilhar o link do site.

Lê a ordem dos posts em _data/instagram_posts.yml (mantido por
update-gallery.py), então rode update-gallery.sh antes se quiser a capa
com as fotos mais recentes. Requer Pillow (o wrapper .sh instala).

USO RECOMENDADO (cria venv + instala Pillow automaticamente):
    ./scripts/generate-og-image.sh
"""

import os
import re

GALLERY_DIR = "assets/img/gallery"
DATA_FILE = "_data/instagram_posts.yml"
OG_IMAGE_PATH = "assets/img/og-image.jpg"
OG_TITLE = "Wisky 3D Print"
OG_SUBTITLE = "Impressão 3D sob encomenda"
OG_HANDLE = "@wisky.3dprint"

IMAGE_LINE_RE = re.compile(r'^\s*image:\s*"(.+)"\s*$')


def _gallery_image_paths(limit):
    """Lê _data/instagram_posts.yml e retorna os caminhos locais das `limit`
    primeiras imagens, na mesma ordem em que aparecem no arquivo."""
    paths = []
    with open(DATA_FILE, encoding="utf-8") as data_file:
        for line in data_file:
            match = IMAGE_LINE_RE.match(line)
            if not match:
                continue
            paths.append(match.group(1).lstrip("/"))
            if len(paths) >= limit:
                break
    return paths


def generate_og_image(image_paths):
    """Gera assets/img/og-image.jpg (1200x630) com grid 3x2 das primeiras imagens.
    Requer Pillow; se faltar, imprime aviso e segue."""
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageFilter
    except ImportError:
        print("Pillow não instalado — pulando og-image. (pip install Pillow)")
        return

    if len(image_paths) < 6:
        print(f"Poucas imagens ({len(image_paths)}/6) para og-image. Pulando.")
        return

    W, H = 1200, 630
    cols, rows = 3, 2
    tile_w, tile_h = W // cols, H // rows  # 400 x 315

    canvas = Image.new("RGB", (W, H), (7, 11, 18))

    for idx, path in enumerate(image_paths[:6]):
        with Image.open(path) as img:
            img = img.convert("RGB")
            src_w, src_h = img.size
            target_ratio = tile_w / tile_h
            src_ratio = src_w / src_h
            if src_ratio > target_ratio:
                new_w = int(src_h * target_ratio)
                left = (src_w - new_w) // 2
                img = img.crop((left, 0, left + new_w, src_h))
            else:
                new_h = int(src_w / target_ratio)
                top = (src_h - new_h) // 2
                img = img.crop((0, top, src_w, top + new_h))
            img = img.resize((tile_w, tile_h), Image.LANCZOS)
            x = (idx % cols) * tile_w
            y = (idx // cols) * tile_h
            canvas.paste(img, (x, y))

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, W, H), fill=(7, 11, 18, 140))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=1))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(canvas)
    title_font = _load_font(72, bold=True)
    subtitle_font = _load_font(34)
    handle_font = _load_font(28, bold=True)

    title_w = draw.textlength(OG_TITLE, font=title_font)
    subtitle_w = draw.textlength(OG_SUBTITLE, font=subtitle_font)
    handle_w = draw.textlength(OG_HANDLE, font=handle_font)

    title_x = (W - title_w) // 2
    title_y = H // 2 - 90
    draw.text((title_x, title_y), OG_TITLE, fill=(238, 242, 248), font=title_font)

    subtitle_x = (W - subtitle_w) // 2
    subtitle_y = title_y + 90
    draw.text((subtitle_x, subtitle_y), OG_SUBTITLE, fill=(141, 152, 171), font=subtitle_font)

    handle_x = (W - handle_w) // 2
    handle_y = subtitle_y + 60
    draw.text((handle_x, handle_y), OG_HANDLE, fill=(0, 229, 204), font=handle_font)

    canvas.save(OG_IMAGE_PATH, "JPEG", quality=88, optimize=True)
    print(f"og-image gerada em {OG_IMAGE_PATH}")


def _load_font(size, bold=False):
    from PIL import ImageFont
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main():
    try:
        import PIL  # noqa: F401
    except ImportError:
        raise SystemExit(
            "Pillow é necessário para gerar o og-image. "
            "Rode ./scripts/generate-og-image.sh (cria o venv e instala)."
        )

    if not os.path.exists(DATA_FILE):
        raise SystemExit(f"{DATA_FILE} não encontrado. Rode ./scripts/update-gallery.sh primeiro.")

    image_paths = _gallery_image_paths(limit=6)
    generate_og_image(image_paths)


if __name__ == "__main__":
    main()
