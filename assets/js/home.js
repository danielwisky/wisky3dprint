// ---------------------------------------------------------------------------
// BLOCO: Calculadora simples (estimativa rápida na home)
// ---------------------------------------------------------------------------

  (function () {
    var form = document.getElementById("price-calc");
    if (!form) return;

    var weightInput = document.getElementById("calc-weight");
    var timeInput = document.getElementById("calc-time");
    var out = document.getElementById("calc-result");
    var energyInfo = document.getElementById("calc-result-energy");
    var energyValueOut = document.getElementById("calc-result-energy-value");
    var d = form.dataset;
    var fmt = window.Wisky3D.currencyFormatter;

    function calc() {
      var g = window.Wisky3D.parsePtBrNumber(weightInput.value);
      var h = window.Wisky3D.parsePtBrNumber(timeInput.value);
      if (!isFinite(g) || !isFinite(h) || g <= 0 || h <= 0) {
        out.textContent = "Preencha os campos";
        out.classList.remove("has-value");
        energyInfo.hidden = true;
        return;
      }
      var base = window.Wisky3D.calculateBaseSubtotal({
        weightG: g,
        hours: h,
        filamentPricePerKg: parseFloat(d.filamentKg),
        powerW: parseFloat(d.powerW),
        kwhRate: parseFloat(d.tariffKwh),
        wear: parseFloat(d.wear)
      });
      var total = base.subtotal * (1 + parseFloat(d.marginPct) / 100) + parseFloat(d.assembly);
      out.textContent = fmt.format(total);
      out.classList.add("has-value");
      energyValueOut.textContent = fmt.format(base.energy);
      energyInfo.hidden = false;
    }

    form.addEventListener("input", calc);
    form.addEventListener("submit", function (e) { e.preventDefault(); calc(); });
  })();

// ---------------------------------------------------------------------------
// BLOCO: Modal da galeria (fotos do Instagram)
// ---------------------------------------------------------------------------

  (function () {
    var modal = document.getElementById("gallery-modal");
    if (!modal) return;

    var allTriggers = Array.prototype.slice.call(document.querySelectorAll(".gallery-trigger"));
    if (!allTriggers.length) return;

    var modalImage = document.getElementById("gallery-modal-image");
    var modalLink = document.getElementById("gallery-modal-link");
    var modalTitle = document.getElementById("gallery-modal-title");
    var prevBtn = modal.querySelector(".gallery-modal-prev");
    var nextBtn = modal.querySelector(".gallery-modal-next");

    function isVisible(trigger) {
      var item = trigger.closest(".gallery-item");
      return item && !item.hidden;
    }

    var lightbox = window.Wisky3D.createLightbox({
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
        var hideNav = total <= 1;
        prevBtn.hidden = hideNav;
        nextBtn.hidden = hideNav;
      },
      onClose: function () { modalImage.src = ""; }
    });

    allTriggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        // Só as fotos já reveladas (ver "carregar mais", abaixo) entram na navegação.
        var visibleTriggers = allTriggers.filter(isVisible);
        var items = visibleTriggers.map(function (t) {
          return {
            src: t.dataset.galleryImage,
            alt: t.querySelector("img").alt,
            url: t.dataset.galleryUrl,
            caption: t.dataset.galleryCaption,
            trigger: t
          };
        });
        var startIndex = visibleTriggers.indexOf(trigger);
        lightbox.open(items, startIndex < 0 ? 0 : startIndex, trigger);
      });
    });
  })();

// ---------------------------------------------------------------------------
// BLOCO: Botão "carregar mais" da galeria
// ---------------------------------------------------------------------------

  (function () {
    var btn = document.querySelector(".gallery-loadmore-btn");
    if (!btn) return;

    var grid = document.querySelector(".gallery-grid");
    if (!grid) return;

    var batch = parseInt(btn.getAttribute("data-gallery-batch"), 10) || 12;

    btn.addEventListener("click", function () {
      var hidden = Array.prototype.slice.call(grid.querySelectorAll(".gallery-item.is-gallery-hidden"));
      var toReveal = hidden.slice(0, batch);

      toReveal.forEach(function (item) {
        item.hidden = false;
        item.classList.remove("is-gallery-hidden");
        item.classList.add("is-revealing");
      });

      if (hidden.length - toReveal.length <= 0) {
        var wrapper = btn.parentNode;
        if (wrapper) wrapper.hidden = true;
      }

      if (toReveal.length) {
        var firstTrigger = toReveal[0].querySelector(".gallery-trigger");
        if (firstTrigger) firstTrigger.focus();
      }
    });
  })();
