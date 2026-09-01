// ---------------------------------------------------------------------------
// BLOCO: Calculadora simples (estimativa rápida na home)
// ---------------------------------------------------------------------------

  (function () {
    var form = document.getElementById("price-calc");
    if (!form) return;

    var peso = document.getElementById("calc-peso");
    var tempo = document.getElementById("calc-tempo");
    var out = document.getElementById("calc-result");
    var d = form.dataset;
    var fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    function calc() {
      var g = parseFloat(String(peso.value).replace(",", "."));
      var h = parseFloat(String(tempo.value).replace(",", "."));
      if (!isFinite(g) || !isFinite(h) || g <= 0 || h <= 0) {
        out.textContent = "Preencha os campos";
        out.classList.remove("has-value");
        return;
      }
      var filamento = (g / 1000) * parseFloat(d.filamentoKg);
      var energia = (parseFloat(d.potenciaW) * h / 1000) * parseFloat(d.tarifaKwh);
      var desgaste = parseFloat(d.desgaste);
      var subtotal = filamento + energia + desgaste;
      var total = subtotal * (1 + parseFloat(d.margemPct) / 100) + parseFloat(d.montagem);
      out.textContent = fmt.format(total);
      out.classList.add("has-value");
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
    var triggers = allTriggers;
    var currentIndex = 0;
    var lastTrigger = null;

    function isVisible(trigger) {
      var item = trigger.closest(".gallery-item");
      return item && !item.hidden;
    }

    function refreshTriggers() {
      triggers = allTriggers.filter(isVisible);
    }

    function showAt(index) {
      var total = triggers.length;
      currentIndex = (index + total) % total;
      var trigger = triggers[currentIndex];

      modalImage.src = trigger.dataset.galleryImage;
      modalImage.alt = trigger.querySelector("img").alt;
      modalLink.href = trigger.dataset.galleryUrl;
      var caption = trigger.dataset.galleryCaption;
      if (caption && caption.length) {
        modalTitle.textContent = caption;
        modalTitle.hidden = false;
      } else {
        modalTitle.textContent = "";
        modalTitle.hidden = true;
      }

      var hideNav = total <= 1;
      prevBtn.hidden = hideNav;
      nextBtn.hidden = hideNav;
    }

    function openModal(trigger) {
      refreshTriggers();
      lastTrigger = trigger;
      currentIndex = triggers.indexOf(trigger);
      if (currentIndex < 0) currentIndex = 0;

      showAt(currentIndex);
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("gallery-modal-open");
      modal.querySelector(".gallery-modal-close").focus();
    }

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("gallery-modal-open");
      modalImage.src = "";
      if (lastTrigger) lastTrigger.focus();
    }

    function goNext() {
      showAt(currentIndex + 1);
      lastTrigger = triggers[currentIndex];
    }

    function goPrev() {
      showAt(currentIndex - 1);
      lastTrigger = triggers[currentIndex];
    }

    allTriggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        openModal(trigger);
      });
    });

    prevBtn.addEventListener("click", goPrev);
    nextBtn.addEventListener("click", goNext);

    modal.querySelectorAll("[data-gallery-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", function (event) {
      if (modal.hidden) return;

      if (event.key === "Escape") {
        closeModal();
      } else if (event.key === "ArrowRight") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        goPrev();
      }
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
