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

  const installTip = document.getElementById("pwa-install-tip");
  const installTipText = document.getElementById("pwa-install-tip-text");
  const installTipClose = document.getElementById("pwa-install-tip-close");
  const updateToast = document.getElementById("pwa-update-toast");
  const updateToastBtn = document.getElementById("pwa-update-btn");

  // Dica de instalação (Adicionar à Tela de Início): iOS não expõe evento
  // de instalação, então o único jeito é orientar o passo a passo manual.
  // Android tem o prompt nativo do Chrome, mas nem todo navegador/versão
  // mostra automaticamente. A dica cobre esse caso também.
  const INSTALL_TIP_DISMISSED_KEY = "wisky3d:installTipFechada";
  const INSTALL_TIP_DISMISSED_KEY_LEGACY = "orcamentoCalc:installTipFechada";

  if (installTip && installTipText && installTipClose) {
    const alreadyInstalled =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
    const ua = window.navigator.userAgent || "";
    // Desde o iPadOS 13, o Safari do iPad manda UA de desktop ("Macintosh"),
    // sem "iPad". Só dá pra distinguir de um Mac de verdade pelo touch.
    const isIPadOS13Plus = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOS13Plus;
    const isAndroid = /Android/.test(ua);
    const alreadyDismissed =
      lsGet(INSTALL_TIP_DISMISSED_KEY) === "1" || lsGet(INSTALL_TIP_DISMISSED_KEY_LEGACY) === "1";

    if (!alreadyInstalled && !alreadyDismissed) {
      if (isIOS) {
        installTipText.textContent =
          '📲 Adicione esta ferramenta à tela de início e use como app, até offline: toque em Compartilhar na barra do Safari e depois em "Adicionar à Tela de Início".';
        installTip.hidden = false;
      } else if (isAndroid) {
        installTipText.textContent =
          '📲 Adicione esta ferramenta à tela de início e use como app, até offline: toque no menu (⋮) do navegador e depois em "Instalar app" ou "Adicionar à tela inicial".';
        installTip.hidden = false;
      }
    }

    installTipClose.addEventListener("click", function () {
      installTip.hidden = true;
      lsSet(INSTALL_TIP_DISMISSED_KEY, "1");
    });
  }

  // URL/escopo do service worker vêm do dataset do próprio bloco (renderizado
  // via Liquid), pra respeitar site.baseurl sem precisar de um <form> na página.
  const swUrl = installTip && installTip.dataset.swUrl;
  const swScope = installTip && installTip.dataset.swScope;

  // Registra o service worker do app instalável, com escopo cobrindo as
  // ferramentas do site (Orçamento e Conversor 3MF).
  //
  // O service worker fica em espera (não ativa sozinho) quando detecta uma
  // versão nova. Só ativa se o usuário tocar em "Atualizar", pra não trocar
  // o código embaixo dos pés de quem está no meio de um uso.
  if ("serviceWorker" in navigator && swUrl) {
    window.addEventListener("load", function () {
      // Aponta sempre pro worker mais recente: se uma segunda versão chegar
      // enquanto o toast da primeira ainda está esperando o clique, o
      // navegador descarta o worker antigo. Sem isso, o clique em
      // "Atualizar" ficaria mandando mensagem pra um worker morto.
      let currentWorker = null;
      let updateRequested = false;
      function showUpdateToast(worker) {
        if (!worker || !updateToast || !updateToastBtn) return;
        currentWorker = worker;
        updateToast.hidden = false;
      }
      if (updateToastBtn) {
        updateToastBtn.addEventListener("click", function () {
          if (!currentWorker) return;
          updateRequested = true;
          currentWorker.postMessage("skipWaiting");
        });
      }

      navigator.serviceWorker
        .register(swUrl, { scope: swScope })
        .then(function (reg) {
          // reg.waiting já está pronto (instalado numa aba anterior). Mostra
          // o aviso na hora, sem esperar um "statechange" que não vai ocorrer.
          if (reg.waiting && navigator.serviceWorker.controller) {
            showUpdateToast(reg.waiting);
          }
          reg.addEventListener("updatefound", function () {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", function () {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateToast(worker);
              }
            });
          });

          // No iPhone, reabrir o app pelo ícone costuma só retomar a aba
          // suspensa em segundo plano, sem navegação nova, e é só numa
          // navegação que o navegador checa atualização sozinho. Forçamos a
          // checagem quando o app volta ao primeiro plano ou a conexão volta.
          function checkForUpdate() {
            reg.update().catch(function () {});
          }
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") checkForUpdate();
          });
          window.addEventListener("online", checkForUpdate);
          // Reforço pra quem deixa o app aberto e em primeiro plano por muito
          // tempo (ex.: numa recepção), sem nunca sair de foco ou reconectar.
          setInterval(checkForUpdate, 60 * 60 * 1000);
        })
        .catch(function () {});

      // Na primeira visita não há worker antigo: o novo ativa direto, o
      // clients.claim() dispara controllerchange e recarregar aqui perderia
      // o que o usuário já fez na página (ex.: um 3MF que acabou de soltar).
      // Só recarrega numa troca de versão de verdade: a página já era
      // controlada ao abrir (outra aba pediu a atualização) ou o usuário
      // tocou em "Atualizar" nesta aba.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if ((!hadController && !updateRequested) || reloading) return;
        reloading = true;
        window.location.reload();
      });
    });
  }
})();
