// ---------------------------------------------------------------------------
// BLOCO: Calculadora simples (estimativa rápida na home)
// ---------------------------------------------------------------------------

(function () {
  const form = document.getElementById("price-calc");
  if (!form) return;

  const weightInput = document.getElementById("calc-weight");
  const timeInput = document.getElementById("calc-time");
  const out = document.getElementById("calc-result");
  const energyInfo = document.getElementById("calc-result-energy");
  const energyValueOut = document.getElementById("calc-result-energy-value");
  const d = form.dataset;
  const fmt = window.Wisky3D.currencyFormatter;

  function calc() {
    const g = window.Wisky3D.parsePtBrNumber(weightInput.value);
    const h = window.Wisky3D.parsePtBrNumber(timeInput.value);
    if (!isFinite(g) || !isFinite(h) || g <= 0 || h <= 0) {
      out.textContent = "Preencha os campos";
      out.classList.remove("has-value");
      energyInfo.hidden = true;
      return;
    }
    const base = window.Wisky3D.calculateBaseSubtotal({
      weightG: g,
      hours: h,
      filamentPricePerKg: parseFloat(d.filamentKg),
      powerW: parseFloat(d.powerW),
      kwhRate: parseFloat(d.tariffKwh),
      wear: parseFloat(d.wear)
    });
    const total = base.subtotal * (1 + parseFloat(d.marginPct) / 100) + parseFloat(d.assembly);
    out.textContent = fmt.format(total);
    out.classList.add("has-value");
    energyValueOut.textContent = fmt.format(base.energy);
    energyInfo.hidden = false;
  }

  form.addEventListener("input", calc);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    calc();
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Modal da galeria (fotos do Instagram)
// ---------------------------------------------------------------------------

(function () {
  const modal = document.getElementById("gallery-modal");
  if (!modal) return;

  const allTriggers = Array.prototype.slice.call(document.querySelectorAll(".gallery-trigger"));
  if (!allTriggers.length) return;

  const modalImage = document.getElementById("gallery-modal-image");
  const modalLink = document.getElementById("gallery-modal-link");
  const modalTitle = document.getElementById("gallery-modal-title");
  const prevBtn = modal.querySelector(".gallery-modal-prev");
  const nextBtn = modal.querySelector(".gallery-modal-next");

  function isVisible(trigger) {
    const item = trigger.closest(".gallery-item");
    return item && !item.hidden;
  }

  const lightbox = window.Wisky3D.createLightbox({
    box: modal,
    prevBtn: prevBtn,
    nextBtn: nextBtn,
    openClass: "gallery-modal-open",
    onShow: function (item, idx, total) {
      modalImage.src = item.src;
      modalImage.alt = item.alt;
      modalLink.href = item.url;
      if (item.caption && item.caption.length) {
        modalTitle.textContent = item.caption;
        modalTitle.hidden = false;
      } else {
        modalTitle.textContent = "";
        modalTitle.hidden = true;
      }
      const hideNav = total <= 1;
      prevBtn.hidden = hideNav;
      nextBtn.hidden = hideNav;
    },
    onClose: function () {
      modalImage.src = "";
    }
  });

  allTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      // Só as fotos já reveladas (ver "carregar mais", abaixo) entram na navegação.
      const visibleTriggers = allTriggers.filter(isVisible);
      const items = visibleTriggers.map(function (t) {
        return {
          src: t.dataset.galleryImage,
          alt: t.querySelector("img").alt,
          url: t.dataset.galleryUrl,
          caption: t.dataset.galleryCaption,
          trigger: t
        };
      });
      const startIndex = visibleTriggers.indexOf(trigger);
      lightbox.open(items, startIndex < 0 ? 0 : startIndex, trigger);
    });
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Botão "carregar mais" da galeria
// ---------------------------------------------------------------------------

(function () {
  const btn = document.querySelector(".gallery-loadmore-btn");
  if (!btn) return;

  const grid = document.querySelector(".gallery-grid");
  if (!grid) return;

  const batch = parseInt(btn.getAttribute("data-gallery-batch"), 10) || 12;

  btn.addEventListener("click", function () {
    const hidden = Array.prototype.slice.call(grid.querySelectorAll(".gallery-item.is-gallery-hidden"));
    const toReveal = hidden.slice(0, batch);

    toReveal.forEach(function (item) {
      item.hidden = false;
      item.classList.remove("is-gallery-hidden");
      item.classList.add("is-revealing");
    });

    if (hidden.length - toReveal.length <= 0) {
      const wrapper = btn.parentNode;
      if (wrapper) wrapper.hidden = true;
    }

    if (toReveal.length) {
      const firstTrigger = toReveal[0].querySelector(".gallery-trigger");
      if (firstTrigger) firstTrigger.focus();
    }
  });
})();
