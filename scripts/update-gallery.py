#!/usr/bin/env python3
"""Baixa as últimas 24 fotos do @wisky.3dprint e atualiza _data/instagram_posts.yml.

Cada foto é salva como 2 WebP: {code}.webp (full, usado no lightbox) e
{code}-thumb.webp (menor, usado na grade). Requer Pillow (o wrapper .sh instala).

Usa a Instagram Graph API oficial (API setup with Instagram login). Precisa
de um access token válido salvo em scripts/.ig_token (um token por linha,
sem quebra de linha extra; arquivo fora do git via .gitignore). Gere/renove
o token pelo App do Meta for Developers (produto Instagram).

Para atualizar a capa/preview do site (og-image.jpg) depois de rodar este
script, use ./scripts/generate-og-image.sh.

USO RECOMENDADO (cria venv + instala Pillow automaticamente):
    ./scripts/update-gallery.sh
"""

import json
import os
import time
import urllib.error
import urllib.request

MAX_POSTS = 24
GALLERY_DIR = "assets/img/gallery"
DATA_FILE = "_data/instagram_posts.yml"
TOKEN_FILE = "scripts/.ig_token"

GRAPH_API_BASE = "https://graph.instagram.com"
MEDIA_FIELDS = (
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,"
    "children{media_url,media_type,thumbnail_url}"
)
PAGE_SIZE = 25

# Cada foto vira 2 WebP: full (lightbox) + thumb (grade). Consistente com estoque/.
FULL_WIDTH = 1080
THUMB_WIDTH = 540
WEBP_QUALITY_FULL = 82
WEBP_QUALITY_THUMB = 80

MIN_VALID_BYTES = 5_000  # imagens do IG não vêm menor que isso

RETRY_WAITS_SECONDS = [10, 30, 60]  # backoff só pro 429 (rate limit), que é transitório


class InstagramUnavailable(Exception):
    """O IG recusou o pedido de um jeito que retry não resolve (ex.: token expirado)."""


def _load_token():
    if not os.path.exists(TOKEN_FILE):
        raise InstagramUnavailable(
            f"Token de acesso não encontrado em {TOKEN_FILE}. Gere um token (Meta for "
            "Developers → app → Instagram) e salve o valor nesse arquivo."
        )
    token = open(TOKEN_FILE, encoding="utf-8").read().strip()
    if not token:
        raise InstagramUnavailable(f"Arquivo {TOKEN_FILE} está vazio.")
    return token


def _get_json(url):
    last_error = None
    for wait in [0] + RETRY_WAITS_SECONDS:
        if wait:
            print(f"Rate limit do Instagram (429) — esperando {wait}s antes de tentar de novo...")
            time.sleep(wait)
        try:
            with urllib.request.urlopen(url) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 429:
                last_error = InstagramUnavailable(
                    f"Instagram bloqueou por rate limit (429) mesmo após retries: {body}"
                )
                continue
            raise InstagramUnavailable(
                f"Instagram recusou o pedido (HTTP {exc.code}): {body}. "
                f"Se o token expirou, gere um novo e atualize {TOKEN_FILE}."
            ) from exc
    raise last_error


def _pick_media_url(node):
    """Escolhe a imagem de capa do post: thumbnail pra vídeo/reel, 1º item pra carrossel."""
    media_type = node.get("media_type")
    if media_type == "VIDEO":
        return node.get("thumbnail_url") or node.get("media_url")
    if media_type == "CAROUSEL_ALBUM":
        children = (node.get("children") or {}).get("data", [])
        if not children:
            return None
        first = children[0]
        if first.get("media_type") == "VIDEO":
            return first.get("thumbnail_url") or first.get("media_url")
        return first.get("media_url")
    return node.get("media_url")


def _code_from_permalink(permalink):
    """Extrai o shortcode do permalink (.../reel/CODE/ ou .../p/CODE/)."""
    parts = [p for p in (permalink or "").split("/") if p]
    return parts[-1] if parts else None


def collect_posts():
    """Reúne até MAX_POSTS posts via Instagram Graph API, paginando por 'paging.next'.

    Retorna uma lista normalizada de dicts {code, type, image_url, caption}. Se a
    paginação falhar no meio, retorna o que já foi coletado (sem quebrar)."""
    token = _load_token()
    url = f"{GRAPH_API_BASE}/me/media?fields={MEDIA_FIELDS}&limit={PAGE_SIZE}&access_token={token}"
    posts = []

    while url and len(posts) < MAX_POSTS:
        try:
            data = _get_json(url)
        except Exception as exc:
            print(f"Paginação interrompida (mantendo {len(posts)} posts): {exc}")
            break

        for node in data.get("data", []):
            code = _code_from_permalink(node.get("permalink"))
            image_url = _pick_media_url(node)
            if not code or not image_url:
                continue
            post_type = "reel" if node.get("media_type") == "VIDEO" else "p"
            # Só o título: primeira linha da legenda (o restante é a descrição do post).
            caption = (node.get("caption") or "").split("\n")[0].strip()
            posts.append({"code": code, "type": post_type, "image_url": image_url, "caption": caption})

        url = (data.get("paging") or {}).get("next")

    return posts[:MAX_POSTS]


def _save_webp_variants(content, code):
    """Gera {code}.webp (full, lightbox) e {code}-thumb.webp (thumb, grade)."""
    from io import BytesIO
    from PIL import Image

    with Image.open(BytesIO(content)) as im:
        im = im.convert("RGB")
        w, h = im.size

        full_w = min(w, FULL_WIDTH)  # nunca faz upscale
        full = im if full_w == w else im.resize((full_w, round(h * full_w / w)), Image.LANCZOS)
        full.save(f"{GALLERY_DIR}/{code}.webp", "WEBP", quality=WEBP_QUALITY_FULL, method=6)

        thumb_w = min(w, THUMB_WIDTH)
        thumb = im.resize((thumb_w, round(h * thumb_w / w)), Image.LANCZOS)
        thumb.save(f"{GALLERY_DIR}/{code}-thumb.webp", "WEBP", quality=WEBP_QUALITY_THUMB, method=6)


def _code_of(filename):
    """Código base de um arquivo da galeria (remove sufixos -thumb e .webp)."""
    base = filename[:-5] if filename.endswith(".webp") else filename
    if base.endswith("-thumb"):
        base = base[:-6]
    return base


def prune_orphans(keep_paths):
    """Remove .webp em GALLERY_DIR (full + thumb) que não estão mais no feed.

    Trava de segurança: se a coleta veio muito menor que o que já existe no
    disco (provável falha/bloqueio da API), não apaga nada."""
    keep_codes = {_code_of(os.path.basename(p)) for p in keep_paths}
    if not keep_codes:
        return []

    existing = [n for n in os.listdir(GALLERY_DIR) if n.endswith(".webp")]
    existing_codes = {_code_of(n) for n in existing}
    if len(keep_codes) < len(existing_codes) * 0.5:
        print(
            f"Prune de órfãs ignorado: coleta ({len(keep_codes)}) bem menor que o disco "
            f"({len(existing_codes)}) — possível falha da API"
        )
        return []

    removed = [n for n in existing if _code_of(n) not in keep_codes]
    for name in removed:
        os.remove(os.path.join(GALLERY_DIR, name))
    return removed


def main():
    try:
        import PIL  # noqa: F401
    except ImportError:
        raise SystemExit(
            "Pillow é necessário para gerar os WebP da galeria. "
            "Rode ./scripts/update-gallery.sh (cria o venv e instala)."
        )

    os.makedirs(GALLERY_DIR, exist_ok=True)

    try:
        posts = collect_posts()
    except InstagramUnavailable as exc:
        raise SystemExit(
            f"Não deu pra falar com o Instagram agora ({exc}). "
            "A galeria atual foi mantida sem alterações — tente rodar de novo mais tarde."
        )
    lines = ["posts:"]
    image_paths = []
    warnings = []

    for post in posts:
        code = post["code"]
        post_type = post["type"]
        image_path = f"{GALLERY_DIR}/{code}.webp"  # full (lightbox); a grade usa o -thumb
        web_path = f"/assets/img/gallery/{code}.webp"

        try:
            img_req = urllib.request.Request(post["image_url"], headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(img_req) as img_response:
                content = img_response.read()
            if len(content) < MIN_VALID_BYTES:
                warnings.append(f"  {code}: download muito pequeno ({len(content)} bytes), pode estar quebrado")
            _save_webp_variants(content, code)
        except Exception as exc:
            warnings.append(f"  {code}: falha no download/conversão ({exc})")
            continue

        alt = post.get("caption", "")
        if len(alt) > 150:
            alt = alt[:147].rstrip() + "..."
        alt = alt.replace("\\", " ").replace('"', "'")

        lines += [
            f'  - id: "{code}"',
            f'    type: "{post_type}"',
            f'    image: "{web_path}"',
        ]
        if alt:
            lines.append(f'    caption: "{alt}"')
        image_paths.append(image_path)

    with open(DATA_FILE, "w", encoding="utf-8") as data_file:
        data_file.write("\n".join(lines) + "\n")

    print(f"Atualizado: {len(image_paths)} posts em {GALLERY_DIR}")
    if warnings:
        print(f"Avisos ({len(warnings)} entrada(s) com problema):")
        for w in warnings:
            print(w)

    removed = prune_orphans(image_paths)
    if removed:
        print(f"Removidas {len(removed)} imagem(ns) órfã(s)")

    print("Para atualizar a capa do site, rode ./scripts/generate-og-image.sh")


if __name__ == "__main__":
    main()
