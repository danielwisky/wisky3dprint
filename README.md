# Wisky 3D Print

Landing page de impressão 3D sob encomenda: [wisky3dprint.com.br](https://wisky3dprint.com.br)

Stack: Jekyll · deploy automático via GitHub Actions · galeria sincronizada com [@wisky.3dprint](https://www.instagram.com/wisky.3dprint)

## Local

```bash
bundle install
bundle exec jekyll serve   # http://localhost:4000
```

Ruby 3.3+ (ver `.ruby-version`).

## Galeria

```bash
./scripts/update-gallery.sh
git add assets/img/gallery/ _data/instagram_posts.yml \
  && git commit -m "Atualiza galeria" && git push
```

O wrapper cria um virtualenv local em `.venv/` na primeira execução, instala
[Pillow](https://pillow.readthedocs.io/) e roda `scripts/update-gallery.py`,
que precisa de um access token válido em `scripts/.ig_token` (fora do git).
Cada execução renova o token por mais 60 dias e regrava o arquivo; se ele
expirar (script parado por mais de ~60 dias), gere outro no app do Meta for
Developers (produto Instagram) e salve nesse arquivo. O script:

- baixa as fotos mais recentes (até 24) via Instagram Graph API para
  `assets/img/gallery/` (full + `-thumb`, em WebP)
- regrava `_data/instagram_posts.yml`
- remove imagens órfãs (posts que saíram do feed), com trava de segurança que
  evita apagar em massa se a API falhar

### Capa do site (og-image)

A imagem usada como preview ao compartilhar o link (`assets/img/og-image.jpg`)
é gerada separadamente, a partir das 6 fotos mais recentes já baixadas pela
galeria:

```bash
./scripts/generate-og-image.sh
git add assets/img/og-image.jpg && git commit -m "Atualiza capa do site" && git push
```

Rode `update-gallery.sh` antes, caso queira a capa com as fotos mais atuais.

### Exibição

A galeria mostra os primeiros posts e revela o resto com um botão **"Carregar
mais"** (sem recarregar a página). Os itens excedentes começam ocultos, então
suas imagens só são baixadas quando reveladas. Ajuste em `_config.yml`:

```yaml
instagram:
  max_posts: 24   # quantos posts entram na galeria

gallery:
  initial: 12     # quantos aparecem antes de "Carregar mais"
  batch: 12       # quantos cada clique revela
```

> Se a API falhar logo de cara (ex.: token expirado), nada é alterado. Se falhar
> no meio da paginação, o script mantém o que já conseguiu coletar.

## Testes e diagnóstico

```bash
npm ci
npm test                                  # testes JS (node:test), também rodam na CI
npm run console-check -- <url> [url...]   # erros de console/rede via Playwright (HEADED=1 abre o Chrome)
```

`scripts/extract-printer-profiles.py` regenera `assets/data/printer-profiles.json`
(perfis de impressora do Conversor 3MF); veja o docstring do script.

## Loja

A vitrine em `/loja` lista as peças cadastradas em `_data/estoque.yml`. Para
adicionar, editar ou remover uma peça, edite esse arquivo: o próprio arquivo
tem instruções de uso (categoria, preço, fotos, selo de "Pronta entrega" etc.)
em comentários no topo. As fotos ficam em `assets/img/estoque/` e podem ser
convertidas para `.webp` com `cwebp -q 85 origem.jpg -o destino.webp`.

Depois de adicionar fotos novas, rode `./scripts/generate-estoque-thumbs.sh`
para gerar a versão leve (`*-thumb.webp`) usada no grid — o clique na foto
(zoom) continua abrindo a imagem original em alta resolução. O script pula
fotos que já têm thumb atualizado, então é seguro rodar sempre.

## SEO / Analytics

- `google_analytics` em `_config.yml` tem o Measurement ID do GA4 (mesma
  property usada em danielwisky.github.io). Deixe em branco (`""`) pra
  desativar.
- Dados estruturados (JSON-LD) ficam em `_includes/structured-data.html`:
  perfil do negócio, FAQ e a lista de produtos da loja (com preço já com
  desconto de oferta aplicado).
- `404.html` é a página de erro customizada.

## Deploy

Push na `main` → GitHub Actions publica no Pages. Repositório precisa ser **público** (plano free).
