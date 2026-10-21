// ---------------------------------------------------------------------------
// BLOCO: Menu mobile e barra de navegação
// ---------------------------------------------------------------------------

(function () {
  const nav = document.getElementById("site-nav");
  const toggle = document.querySelector(".site-nav-toggle");
  const menu = document.getElementById("site-nav-menu");
  // No app instalado, o CSS esconde o menu do site e mostra o das
  // ferramentas; o hambúrguer abre os dois e só o visível aparece.
  const menus = [menu, document.getElementById("site-nav-standalone")].filter(Boolean);

  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      const open = menu.classList.toggle("is-open");
      menus.forEach(function (m) {
        m.classList.toggle("is-open", open);
      });
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    menus.forEach(function (m) {
      m.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          menus.forEach(function (x) {
            x.classList.remove("is-open");
          });
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    });
  }

  // No app instalado, o logo das ferramentas volta pro Orçamento em vez
  // da home, que é o site e não faz parte do app.
  const logo = nav.querySelector(".site-logo[data-app-href]");
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (logo && standalone) logo.setAttribute("href", logo.getAttribute("data-app-href"));

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

// ---------------------------------------------------------------------------
// BLOCO: Dropdown "Ferramentas" (navbar)
// ---------------------------------------------------------------------------

(function () {
  const item = document.getElementById("nav-tools");
  if (!item) return;

  const btn = item.querySelector(".nav-link-dropdown");

  function close() {
    item.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }

  function open() {
    item.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  }

  btn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (item.classList.contains("is-open")) close();
    else open();
  });

  document.addEventListener("click", function (event) {
    if (!item.contains(event.target)) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Revelar ao rolar (scroll reveal)
// ---------------------------------------------------------------------------

(function () {
  const targets = document.querySelectorAll(".reveal, .reveal-stagger");
  if (!targets.length) return;

  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      // threshold 0: revela assim que qualquer parte entra na tela. Um valor
      // fracionário (ex.: 0.15) nunca dispara em elementos mais altos que a tela
      // (ex.: o grid do estoque em 1 coluna no celular), deixando o conteúdo preso invisível.
      threshold: 0,
      rootMargin: "0px 0px -60px 0px"
    }
  );

  targets.forEach(function (el) {
    observer.observe(el);
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Tema claro / escuro
// ---------------------------------------------------------------------------

(function () {
  // Um botão no menu do site e outro no das ferramentas (app instalado).
  const btns = document.querySelectorAll(".theme-toggle");
  if (!btns.length) return;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const THEME_COLOR = { light: "#faf6f1", dark: "#070b12" };

  function sync(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    btns.forEach(function (btn) {
      btn.setAttribute("aria-label", theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro");
    });
    if (themeMeta) themeMeta.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.dark);
  }

  sync(document.documentElement.getAttribute("data-theme") || "dark");

  let transitionTimer = null;
  function withTransition(callback) {
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    callback();
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(function () {
      root.classList.remove("theme-transitioning");
    }, 400);
  }

  btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "light" ? "dark" : "light";
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      withTransition(function () {
        sync(next);
      });
    });
  });

  const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
  if (media && media.addEventListener) {
    media.addEventListener("change", function (event) {
      let stored = null;
      try {
        stored = localStorage.getItem("theme");
      } catch (err) {}
      if (!stored)
        withTransition(function () {
          sync(event.matches ? "light" : "dark");
        });
    });
  }
})();

// ---------------------------------------------------------------------------
// Motor genérico de lightbox: abrir/fechar, teclado, swipe, navegação
// circular, foco. Reaproveitado pelo zoom de imagem (.img-zoom, abaixo) e
// pela galeria do Instagram (gallery-modal, em home.js). Só o HTML/o que
// cada um exibe (contador de fotos vs. legenda+link) muda entre os dois.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

window.Wisky3D.createLightbox = function (config) {
  const box = config.box;
  let items = [];
  let idx = 0;
  let lastTrigger = null;
  let x0 = null;

  function showAt(i) {
    idx = (i + items.length) % items.length;
    // Só itens que carregam sua própria referência de trigger (ex.: galeria
    // do Instagram) atualizam o foco de retorno ao navegar; sem isso, o
    // foco ao fechar sempre volta pro elemento que abriu o lightbox.
    if (items[idx] && items[idx].trigger) lastTrigger = items[idx].trigger;
    config.onShow(items[idx], idx, items.length);
  }

  function open(newItems, startIndex, trigger) {
    items = newItems;
    lastTrigger = trigger || null;
    showAt(startIndex || 0);
    box.hidden = false;
    box.setAttribute("aria-hidden", "false");
    if (config.openClass) document.body.classList.add(config.openClass);
    const closeBtn = box.querySelector("[data-lightbox-close], [data-gallery-close]");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    box.hidden = true;
    box.setAttribute("aria-hidden", "true");
    if (config.openClass) document.body.classList.remove(config.openClass);
    if (config.onClose) config.onClose();
    if (lastTrigger) lastTrigger.focus();
  }

  function next() {
    showAt(idx + 1);
  }
  function prev() {
    showAt(idx - 1);
  }

  if (config.prevBtn) config.prevBtn.addEventListener("click", prev);
  if (config.nextBtn) config.nextBtn.addEventListener("click", next);

  box.querySelectorAll("[data-lightbox-close], [data-gallery-close]").forEach(function (el) {
    el.addEventListener("click", close);
  });

  box.addEventListener("click", function (event) {
    if (event.target === box) close();
  });

  box.addEventListener(
    "touchstart",
    function (e) {
      x0 = e.touches[0].clientX;
    },
    { passive: true }
  );
  box.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
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
  const triggers = document.querySelectorAll(".img-zoom");
  if (!triggers.length) return;

  const box = document.getElementById("img-lightbox");
  if (!box) return;

  const boxImg = document.getElementById("img-lightbox-img");
  const prevBtn = box.querySelector(".img-lightbox-prev");
  const nextBtn = box.querySelector(".img-lightbox-next");
  const counter = box.querySelector(".img-lightbox-counter");

  const lightbox = window.Wisky3D.createLightbox({
    box: box,
    prevBtn: prevBtn,
    nextBtn: nextBtn,
    openClass: "img-lightbox-open",
    onShow: function (item, idx, total) {
      boxImg.src = item.src;
      boxImg.alt = item.alt;
      const multiple = total > 1;
      prevBtn.hidden = !multiple;
      nextBtn.hidden = !multiple;
      if (counter) {
        counter.hidden = !multiple;
        counter.textContent = multiple ? idx + 1 + " / " + total : "";
      }
    },
    onClose: function () {
      boxImg.src = "";
    }
  });

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      const img = trigger.querySelector("img");
      if (!img) return;

      let items, startIndex;
      const carousel = trigger.closest("[data-carousel]");
      if (carousel) {
        const slides = Array.prototype.slice.call(carousel.querySelectorAll(".stock-slide"));
        items = slides.map(function (s) {
          const si = s.querySelector("img");
          // O card exibe um thumb leve; o zoom usa a foto original (data-full) quando disponível.
          return { src: s.dataset.full || (si ? si.currentSrc || si.src : ""), alt: si ? si.alt : "" };
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
