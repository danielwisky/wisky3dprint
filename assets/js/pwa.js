(function () {
  "use strict";

  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }

  var installTip = document.getElementById("pwa-install-tip");
  var installTipTexto = document.getElementById("pwa-install-tip-texto");
  var installTipFechar = document.getElementById("pwa-install-tip-fechar");
  var updateToast = document.getElementById("pwa-update-toast");
  var updateToastBtn = document.getElementById("pwa-update-btn");

  // Dica de instalação (Adicionar à Tela de Início): iOS não expõe evento
  // de instalação, então o único jeito é orientar o passo a passo manual.
  // Android tem o prompt nativo do Chrome, mas nem todo navegador/versão
  // mostra automaticamente — a dica cobre esse caso também.
  var INSTALL_TIP_DISMISSED_KEY = "wisky3d:installTipFechada";
  var INSTALL_TIP_DISMISSED_KEY_LEGADO = "orcamentoCalc:installTipFechada";

  if (installTip && installTipTexto && installTipFechar) {
    var jaInstalado =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
    var ua = window.navigator.userAgent || "";
    // Desde o iPadOS 13, o Safari do iPad manda UA de desktop ("Macintosh"),
    // sem "iPad" — só dá pra distinguir de um Mac de verdade pelo touch.
    var isIPadOS13Mais = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
    var isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOS13Mais;
    var isAndroid = /Android/.test(ua);
    var jaFechada = lsGet(INSTALL_TIP_DISMISSED_KEY) === "1" || lsGet(INSTALL_TIP_DISMISSED_KEY_LEGADO) === "1";

    if (!jaInstalado && !jaFechada) {
      if (isIOS) {
        installTipTexto.textContent = "📲 Adicione esta ferramenta à tela de início e use como app, até offline: toque em Compartilhar na barra do Safari e depois em \"Adicionar à Tela de Início\".";
        installTip.hidden = false;
      } else if (isAndroid) {
        installTipTexto.textContent = "📲 Adicione esta ferramenta à tela de início e use como app, até offline: toque no menu (⋮) do navegador e depois em \"Instalar app\" ou \"Adicionar à tela inicial\".";
        installTip.hidden = false;
      }
    }

    installTipFechar.addEventListener("click", function () {
      installTip.hidden = true;
      lsSet(INSTALL_TIP_DISMISSED_KEY, "1");
    });
  }

  // URL/escopo do service worker vêm do dataset do próprio bloco (renderizado
  // via Liquid), pra respeitar site.baseurl sem precisar de um <form> na página.
  var swUrl = installTip && installTip.dataset.swUrl;
  var swScope = installTip && installTip.dataset.swScope;

  // Registra o service worker do app instalável, com escopo cobrindo as
  // ferramentas do site (Orçamento e Conversor 3MF).
  //
  // O service worker fica em espera (não ativa sozinho) quando detecta uma
  // versão nova — só ativa se o usuário tocar em "Atualizar", pra não trocar
  // o código embaixo dos pés de quem está no meio de um uso.
  if ("serviceWorker" in navigator && swUrl) {
    window.addEventListener("load", function () {
      // Aponta sempre pro worker mais recente: se uma segunda versão chegar
      // enquanto o toast da primeira ainda está esperando o clique, o
      // navegador descarta o worker antigo — sem isso, o clique em
      // "Atualizar" ficaria mandando mensagem pra um worker morto.
      var workerAtual = null;
      function mostrarToastAtualizacao(worker) {
        if (!worker || !updateToast || !updateToastBtn) return;
        workerAtual = worker;
        updateToast.hidden = false;
      }
      if (updateToastBtn) {
        updateToastBtn.addEventListener("click", function () {
          if (workerAtual) workerAtual.postMessage("skipWaiting");
        });
      }

      navigator.serviceWorker.register(swUrl, { scope: swScope }).then(function (reg) {
        // reg.waiting já está pronto (instalado numa aba anterior) — mostra
        // o aviso na hora, sem esperar um "statechange" que não vai ocorrer.
        if (reg.waiting && navigator.serviceWorker.controller) {
          mostrarToastAtualizacao(reg.waiting);
        }
        reg.addEventListener("updatefound", function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              mostrarToastAtualizacao(worker);
            }
          });
        });

        // No iPhone, reabrir o app pelo ícone costuma só retomar a aba
        // suspensa em segundo plano, sem navegação nova — e é só numa
        // navegação que o navegador checa atualização sozinho. Forçamos a
        // checagem quando o app volta ao primeiro plano ou a conexão volta.
        function verificarAtualizacao() {
          reg.update().catch(function () {});
        }
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") verificarAtualizacao();
        });
        window.addEventListener("online", verificarAtualizacao);
        // Reforço pra quem deixa o app aberto e em primeiro plano por muito
        // tempo (ex.: numa recepção), sem nunca sair de foco ou reconectar.
        setInterval(verificarAtualizacao, 60 * 60 * 1000);
      }).catch(function () {});

      var recarregando = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (recarregando) return;
        recarregando = true;
        window.location.reload();
      });
    });
  }
})();
