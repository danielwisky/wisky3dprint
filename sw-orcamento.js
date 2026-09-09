---
layout: null
permalink: /sw-orcamento.js
---
// Service worker do app "Orçamento" — cache só do essencial pra abrir
// offline depois de instalado. Escopo limitado a /orcamento/ (ver
// registro em orcamento.js), não afeta o resto do site.
var CACHE_NAME = "orcamento-app-v1";
var URLS_TO_CACHE = [
  "{{ '/orcamento/' | relative_url }}",
  "{{ '/assets/css/style.css' | relative_url }}?v={{ '/assets/css/style.scss' | asset_hash }}",
  "{{ '/assets/js/price-formula.js' | relative_url }}?v={{ '/assets/js/price-formula.js' | asset_hash }}",
  "{{ '/assets/js/model-parser.js' | relative_url }}?v={{ '/assets/js/model-parser.js' | asset_hash }}",
  "{{ '/assets/js/orcamento.js' | relative_url }}?v={{ '/assets/js/orcamento.js' | asset_hash }}",
  "{{ '/assets/img/icon-orcamento-192.png' | relative_url }}",
  "{{ '/assets/img/icon-orcamento-512.png' | relative_url }}"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
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
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
