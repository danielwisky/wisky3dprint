// ---------------------------------------------------------------------------
// BLOCO: Menu mobile e barra de navegação
// ---------------------------------------------------------------------------

  (function () {
    var nav = document.getElementById("site-nav");
    var toggle = document.querySelector(".site-nav-toggle");
    var menu = document.getElementById("site-nav-menu");

    function onScroll() {
      nav.classList.toggle("is-scrolled", window.scrollY > 24);
    }

    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        var open = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });

      menu.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          menu.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  })();

// ---------------------------------------------------------------------------
// BLOCO: Dropdown "Ferramentas" (navbar)
// ---------------------------------------------------------------------------

  (function () {
    var item = document.getElementById("nav-ferramentas");
    if (!item) return;

    var btn = item.querySelector(".nav-link-dropdown");

    function fechar() {
      item.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }

    function abrir() {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      if (item.classList.contains("is-open")) fechar(); else abrir();
    });

    document.addEventListener("click", function (event) {
      if (!item.contains(event.target)) fechar();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") fechar();
    });
  })();

// ---------------------------------------------------------------------------
// BLOCO: Revelar ao rolar (scroll reveal)
// ---------------------------------------------------------------------------

  (function () {
    var targets = document.querySelectorAll(".reveal, .reveal-stagger");
    if (!targets.length) return;

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      // threshold 0: revela assim que qualquer parte entra na tela. Um valor
      // fracionário (ex.: 0.15) nunca dispara em elementos mais altos que a tela
      // (ex.: o grid do estoque em 1 coluna no celular), deixando o conteúdo preso invisível.
      threshold: 0,
      rootMargin: "0px 0px -60px 0px"
    });

    targets.forEach(function (el) { observer.observe(el); });
  })();

// ---------------------------------------------------------------------------
// BLOCO: Tema claro / escuro
// ---------------------------------------------------------------------------

  (function () {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    var themeMeta = document.querySelector('meta[name="theme-color"]');
    var THEME_COLOR = { light: "#faf6f1", dark: "#070b12" };

    function sync(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      btn.setAttribute("aria-label", theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro");
      if (themeMeta) themeMeta.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.dark);
    }

    sync(document.documentElement.getAttribute("data-theme") || "dark");

    var transitionTimer = null;
    function withTransition(callback) {
      var root = document.documentElement;
      root.classList.add("theme-transitioning");
      callback();
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = setTimeout(function () {
        root.classList.remove("theme-transitioning");
      }, 400);
    }

    btn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "light" ? "dark" : "light";
      try { localStorage.setItem("theme", next); } catch (e) {}
      withTransition(function () { sync(next); });
    });

    var media = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
    if (media && media.addEventListener) {
      media.addEventListener("change", function (event) {
        var stored = null;
        try { stored = localStorage.getItem("theme"); } catch (err) {}
        if (!stored) withTransition(function () { sync(event.matches ? "light" : "dark"); });
      });
    }
  })();

// ---------------------------------------------------------------------------
// Motor genérico de lightbox: abrir/fechar, teclado, swipe, navegação
// circular, foco. Reaproveitado pelo zoom de imagem (.img-zoom, abaixo) e
// pela galeria do Instagram (gallery-modal, em home.js) — só o HTML/o que
// cada um exibe (contador de fotos vs. legenda+link) muda entre os dois.
// ---------------------------------------------------------------------------

  window.Wisky3D = window.Wisky3D || {};

  window.Wisky3D.criarLightbox = function (config) {
    var box = config.box;
    var items = [];
    var idx = 0;
    var lastTrigger = null;
    var x0 = null;

    function showAt(i) {
      idx = (i + items.length) % items.length;
      // Só itens que carregam sua própria referência de trigger (ex.: galeria
      // do Instagram) atualizam o foco de retorno ao navegar; sem isso, o
      // foco ao fechar sempre volta pro elemento que abriu o lightbox.
      if (items[idx] && items[idx].trigger) lastTrigger = items[idx].trigger;
      config.onShow(items[idx], idx, items.length);
    }

    function open(novosItens, startIndex, trigger) {
      items = novosItens;
      lastTrigger = trigger || null;
      showAt(startIndex || 0);
      box.hidden = false;
      box.setAttribute("aria-hidden", "false");
      if (config.openClass) document.body.classList.add(config.openClass);
      var closeBtn = box.querySelector("[data-lightbox-close], [data-gallery-close]");
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      box.hidden = true;
      box.setAttribute("aria-hidden", "true");
      if (config.openClass) document.body.classList.remove(config.openClass);
      if (config.onClose) config.onClose();
      if (lastTrigger) lastTrigger.focus();
    }

    function next() { showAt(idx + 1); }
    function prev() { showAt(idx - 1); }

    if (config.prevBtn) config.prevBtn.addEventListener("click", prev);
    if (config.nextBtn) config.nextBtn.addEventListener("click", next);

    box.querySelectorAll("[data-lightbox-close], [data-gallery-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });

    box.addEventListener("click", function (event) {
      if (event.target === box) close();
    });

    box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) showAt(idx + (dx < 0 ? 1 : -1));
      x0 = null;
    });

    document.addEventListener("keydown", function (event) {
      if (box.hidden) return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") prev();
    });

    return { open: open, close: close, next: next, prev: prev };
  };

// ---------------------------------------------------------------------------
// BLOCO: Zoom de imagem em modal (lightbox global)
// ---------------------------------------------------------------------------

  (function () {
    var triggers = document.querySelectorAll(".img-zoom");
    if (!triggers.length) return;

    var box = document.getElementById("img-lightbox");
    if (!box) return;

    var boxImg = document.getElementById("img-lightbox-img");
    var prevBtn = box.querySelector(".img-lightbox-prev");
    var nextBtn = box.querySelector(".img-lightbox-next");
    var counter = box.querySelector(".img-lightbox-counter");

    var lightbox = window.Wisky3D.criarLightbox({
      box: box,
      prevBtn: prevBtn,
      nextBtn: nextBtn,
      openClass: "img-lightbox-open",
      onShow: function (item, idx, total) {
        boxImg.src = item.src;
        boxImg.alt = item.alt;
        var multiple = total > 1;
        prevBtn.hidden = !multiple;
        nextBtn.hidden = !multiple;
        if (counter) {
          counter.hidden = !multiple;
          counter.textContent = multiple ? (idx + 1) + " / " + total : "";
        }
      },
      onClose: function () { boxImg.src = ""; }
    });

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        var img = trigger.querySelector("img");
        if (!img) return;

        var items, startIndex;
        var carousel = trigger.closest("[data-carousel]");
        if (carousel) {
          var slides = Array.prototype.slice.call(carousel.querySelectorAll(".estoque-slide"));
          items = slides.map(function (s) {
            var si = s.querySelector("img");
            // O card exibe um thumb leve; o zoom usa a foto original (data-full) quando disponível.
            return { src: s.dataset.full || (si ? (si.currentSrc || si.src) : ""), alt: si ? si.alt : "" };
          });
          startIndex = slides.indexOf(trigger);
        } else {
          items = [{ src: trigger.dataset.full || img.currentSrc || img.src, alt: img.alt }];
          startIndex = 0;
        }
        lightbox.open(items, startIndex < 0 ? 0 : startIndex, trigger);
      });
    });
  })();
