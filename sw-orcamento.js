---
layout: null
permalink: /sw-orcamento.js
---
// Service worker das ferramentas do site (Orçamento, Conversor 3MF e
// Colorir 3MF) — cache só do essencial pra abrir offline depois de
// instalado. Escopo cobrindo o site inteiro (ver registro em pwa.js).
//
// O nome do cache incorpora os asset_hash do JS/CSS e dos perfis do
// Conversor 3MF: assim, sempre que esses arquivos mudarem de conteúdo, o
// cache muda de nome e a limpeza no "activate" descarta a versão anterior
// — sem isso, entradas com ?v=hash antigo ficariam acumuladas pra sempre no
// mesmo cache.
{%- assign scripts = "price-formula,orcamento-calculo,model-parser,tool-utils,threemf-writer,colorir-calculo,orcamento,conversor-3mf,colorir-3mf,pwa" | split: "," %}
var CACHE_NAME = "orcamento-app{% for s in scripts %}-{{ '/assets/js/' | append: s | append: '.js' | asset_hash }}{% endfor %}-{{ '/assets/css/style.scss' | asset_hash }}-{{ '/assets/data/printer-profiles.json' | asset_hash }}";
var TIMEOUT_REDE_MS = 3000;
var URLS_TO_CACHE = [
  "{{ '/orcamento/' | relative_url }}",
  "{{ '/conversor-3mf/' | relative_url }}",
  "{{ '/colorir-3mf/' | relative_url }}",
  "{{ '/assets/css/style.css' | relative_url }}?v={{ '/assets/css/style.scss' | asset_hash }}",
{%- for s in scripts %}
  {%- assign js = '/assets/js/' | append: s | append: '.js' %}
  "{{ js | relative_url }}?v={{ js | asset_hash }}",
{%- endfor %}
  "{{ '/assets/data/printer-profiles.json' | relative_url }}?v={{ '/assets/data/printer-profiles.json' | asset_hash }}",
  "{{ '/manifest-orcamento.webmanifest' | relative_url }}",
  "{{ '/assets/img/icon-orcamento-192.png' | relative_url }}",
  "{{ '/assets/img/icon-orcamento-512.png' | relative_url }}"
];

// Bibliotecas de CDN usadas pelas ferramentas (mesmas URLs das páginas).
// Ficam fora do addAll principal: se o CDN falhar na instalação, o resto
// do app continua instalável e elas entram no cache no primeiro uso.
var CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
  "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/controls/OrbitControls.js"
];

// Só o que está no precache, JS/CSS/dados do site e as libs de CDN entram no cache em tempo de
// execução. Fotos (galeria, loja) e scripts de terceiros (Analytics) não
// são necessários offline e encheriam o cache sem limite.
var PREFIXOS_CACHEAVEIS = [
  self.location.origin + "{{ '/assets/js/' | relative_url }}",
  self.location.origin + "{{ '/assets/css/' | relative_url }}",
  self.location.origin + "{{ '/assets/data/' | relative_url }}"
];

var URLS_PRECACHE_SEM_QUERY = URLS_TO_CACHE.map(function (url) {
  return self.location.origin + url.split("?")[0];
});

function ehCacheavel(url) {
  if (CDN_URLS.indexOf(url) !== -1 || URLS_PRECACHE_SEM_QUERY.indexOf(url) !== -1) return true;
  return PREFIXOS_CACHEAVEIS.some(function (prefixo) {
    return url.indexOf(prefixo) === 0;
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS_TO_CACHE).then(function () {
        return Promise.all(CDN_URLS.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      });
    })
  );
});

// Fica em espera (sem ativar) até a página pedir explicitamente — é o que
// dispara o aviso de "nova versão disponível" em pwa.js. Sem isso
// (com skipWaiting automático no install), a troca de versão seria
// silenciosa e o usuário não saberia que atualizou.
self.addEventListener("message", function (event) {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  // Páginas (HTML) vão na rede primeiro: o escopo cobre o site inteiro e o
  // HTML não tem ?v=hash, então servir do cache primeiro mostraria a versão
  // anterior ao deploy até o próximo reload. Cache só como fallback offline
  // ou quando a rede demora demais (conexão fraca que pendura em vez de falhar).
  if (event.request.mode === "navigate") {
    // Chave sem query string: uma entrada por página (links com ?utm_*,
    // ?fbclid etc. não acumulam cópias) e /orcamento/?acesso-vip acha a
    // /orcamento/ precacheada.
    var url = new URL(event.request.url);
    var chave = url.origin + url.pathname;
    var copia = null;
    var rede = fetch(event.request).then(function (response) {
      if (response && response.ok) copia = response.clone();
      return response;
    });

    // Termina de gravar no cache mesmo se o timeout já respondeu com a cópia.
    event.waitUntil(rede.then(function () {
      if (!copia) return;
      return caches.open(CACHE_NAME).then(function (cache) {
        return cache.put(chave, copia);
      });
    }).catch(function () {}));

    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        function doCache() {
          return cache.match(chave);
        }

        var timeout = new Promise(function (resolve) {
          setTimeout(function () {
            doCache().then(function (cached) {
              if (cached) resolve(cached);
            });
          }, TIMEOUT_REDE_MS);
        });

        return Promise.race([rede.catch(doCache), timeout]);
      })
    );
    return;
  }

  if (!ehCacheavel(event.request.url.split("?")[0])) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      // Busca só no cache DESTA versão (CACHE_NAME) — caches.match() global
      // buscaria em qualquer cache do site, inclusive versões antigas ainda
      // não limpas, servindo conteúdo desatualizado mesmo depois de um deploy.
      return cache.match(event.request).then(function (cached) {
        var network = fetch(event.request).then(function (response) {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
