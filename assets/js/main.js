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
    var lastTrigger = null;
    var images = [];
    var idx = 0;
    var x0 = null;

    function showAt(i) {
      idx = (i + images.length) % images.length;
      boxImg.src = images[idx].src;
      boxImg.alt = images[idx].alt;
      var multiple = images.length > 1;
      if (prevBtn) prevBtn.hidden = !multiple;
      if (nextBtn) nextBtn.hidden = !multiple;
      if (counter) {
        counter.hidden = !multiple;
        counter.textContent = multiple ? (idx + 1) + " / " + images.length : "";
      }
    }

    function openBox(trigger) {
      var img = trigger.querySelector("img");
      if (!img) return;

      var carousel = trigger.closest("[data-carousel]");
      if (carousel) {
        var slides = Array.prototype.slice.call(carousel.querySelectorAll(".estoque-slide"));
        images = slides.map(function (s) {
          var si = s.querySelector("img");
          return { src: si ? (si.currentSrc || si.src) : "", alt: si ? si.alt : "" };
        });
        idx = slides.indexOf(trigger);
        if (idx < 0) idx = 0;
      } else {
        images = [{ src: img.currentSrc || img.src, alt: img.alt }];
        idx = 0;
      }

      lastTrigger = trigger;
      showAt(idx);
      box.hidden = false;
      box.setAttribute("aria-hidden", "false");
      document.body.classList.add("img-lightbox-open");
      box.querySelector(".img-lightbox-close").focus();
    }

    function closeBox() {
      box.hidden = true;
      box.setAttribute("aria-hidden", "true");
      document.body.classList.remove("img-lightbox-open");
      boxImg.src = "";
      if (lastTrigger) lastTrigger.focus();
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () { openBox(trigger); });
    });

    if (prevBtn) prevBtn.addEventListener("click", function () { showAt(idx - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { showAt(idx + 1); });

    box.querySelectorAll("[data-lightbox-close]").forEach(function (el) {
      el.addEventListener("click", closeBox);
    });

    box.addEventListener("click", function (event) {
      if (event.target === box) closeBox();
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
      if (event.key === "Escape") closeBox();
      else if (event.key === "ArrowRight") showAt(idx + 1);
      else if (event.key === "ArrowLeft") showAt(idx - 1);
    });
  })();
