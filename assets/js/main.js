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

  (function () {
    var form = document.getElementById("orcamento-calc");
    if (!form) return;

    var nome = document.getElementById("orcamento-calc-nome");
    var quantidade = document.getElementById("orcamento-calc-quantidade");
    var peso = document.getElementById("orcamento-calc-peso");
    var horas = document.getElementById("orcamento-calc-horas");
    var minutos = document.getElementById("orcamento-calc-minutos");
    var filamento = document.getElementById("orcamento-calc-filamento");
    var maoDeObra = document.getElementById("orcamento-calc-mao-de-obra");
    var margemInput = document.getElementById("orcamento-calc-margem");
    var perdaInput = document.getElementById("orcamento-calc-perda");
    var out = document.getElementById("orcamento-calc-result");
    var breakdown = document.getElementById("orcamento-calc-breakdown");
    var addBtn = document.getElementById("orcamento-calc-add");
    var itensBox = document.getElementById("orcamento-calc-itens");
    var itensList = document.getElementById("orcamento-calc-itens-list");
    var itensTotalOut = document.getElementById("orcamento-calc-itens-total");
    var descontoValorInput = document.getElementById("orcamento-calc-desconto-valor");
    var descontoTipoInput = document.getElementById("orcamento-calc-desconto-tipo");
    var descontoTextoInput = document.getElementById("orcamento-calc-desconto-texto");
    var descontoBreakdown = document.getElementById("orcamento-calc-desconto-breakdown");
    var itensSubtotalOut = document.getElementById("orcamento-calc-itens-subtotal");
    var descontoLabel = document.getElementById("orcamento-calc-desconto-label");
    var descontoOut = document.getElementById("orcamento-calc-desconto-out");
    var pdfBtn = document.getElementById("orcamento-calc-pdf");
    var csvBtn = document.getElementById("orcamento-calc-csv");
    var clearBtn = document.getElementById("orcamento-calc-clear");
    var printBox = document.getElementById("orcamento-calc-print");
    var printBody = document.getElementById("orcamento-calc-print-body");
    var printDescontoBreakdown = document.getElementById("orcamento-calc-print-desconto-breakdown");
    var printSubtotalOut = document.getElementById("orcamento-calc-print-subtotal");
    var printDescontoLabel = document.getElementById("orcamento-calc-print-desconto-label");
    var printDescontoOut = document.getElementById("orcamento-calc-print-desconto");
    var printTotalOut = document.getElementById("orcamento-calc-print-total");
    var printLogo = document.getElementById("orcamento-calc-print-logo");
    var printBrand = document.getElementById("orcamento-calc-print-brand");
    var logoHideInput = document.getElementById("orcamento-calc-logo-hide");
    var logoUploadInput = document.getElementById("orcamento-calc-logo-upload");
    var logoResetBtn = document.getElementById("orcamento-calc-logo-reset");
    var d = form.dataset;
    var fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    var rows = {
      filamento: document.getElementById("orcamento-calc-b-filamento"),
      energia: document.getElementById("orcamento-calc-b-energia"),
      desgaste: document.getElementById("orcamento-calc-b-desgaste"),
      subtotal: document.getElementById("orcamento-calc-b-subtotal"),
      perda: document.getElementById("orcamento-calc-b-perda"),
      perdaLabel: document.getElementById("orcamento-calc-b-perda-label"),
      margem: document.getElementById("orcamento-calc-b-margem"),
      margemLabel: document.getElementById("orcamento-calc-b-margem-label"),
      maoDeObra: document.getElementById("orcamento-calc-b-mao-de-obra")
    };

    var itens = [];
    var current = null;

    // A perda/retrabalho é aplicada sobre o subtotal (filamento + energia +
    // desgaste): equivale a reimprimir essa fração das peças do item.
    function computeItem() {
      var g = parseFloat(String(peso.value).replace(",", "."));
      var h = (parseFloat(horas.value) || 0) + (parseFloat(minutos.value) || 0) / 60;
      var filamentoKg = parseFloat(String(filamento.value).replace(",", "."));
      var maoDeObraVal = parseFloat(String(maoDeObra.value).replace(",", ".")) || 0;
      var margemPct = parseFloat(String(margemInput.value).replace(",", "."));
      if (!isFinite(margemPct)) margemPct = parseFloat(d.margemPct) || 0;
      var perdaPct = parseFloat(String(perdaInput.value).replace(",", "."));
      if (!isFinite(perdaPct)) perdaPct = parseFloat(d.perdaPct) || 0;
      var qtd = parseInt(quantidade.value, 10);
      if (!isFinite(qtd) || qtd < 1) qtd = 1;

      if (!isFinite(g) || g <= 0 || h <= 0 || !isFinite(filamentoKg) || filamentoKg <= 0 || maoDeObraVal < 0 || margemPct < 0 || perdaPct < 0) {
        return null;
      }

      var custoFilamento = (g / 1000) * filamentoKg;
      var energia = (parseFloat(d.potenciaW) * h / 1000) * parseFloat(d.tarifaKwh);
      var desgaste = parseFloat(d.desgaste);
      var subtotal = custoFilamento + energia + desgaste;
      var perda = subtotal * (perdaPct / 100);
      var subtotalComPerda = subtotal + perda;
      var margem = subtotalComPerda * (margemPct / 100);
      var unitTotal = subtotalComPerda + margem + maoDeObraVal;

      return {
        nome: (nome.value || "").trim(),
        qtd: qtd,
        custoFilamento: custoFilamento,
        energia: energia,
        desgaste: desgaste,
        subtotal: subtotal,
        perda: perda,
        perdaPct: perdaPct,
        margem: margem,
        margemPct: margemPct,
        maoDeObra: maoDeObraVal,
        unitTotal: unitTotal,
        itemTotal: unitTotal * qtd
      };
    }

    function calc() {
      var item = computeItem();
      current = item;

      if (!item) {
        out.textContent = "Preencha os campos";
        out.classList.remove("has-value");
        breakdown.hidden = true;
        addBtn.disabled = true;
        return;
      }

      rows.filamento.textContent = fmt.format(item.custoFilamento);
      rows.energia.textContent = fmt.format(item.energia);
      rows.desgaste.textContent = fmt.format(item.desgaste);
      rows.subtotal.textContent = fmt.format(item.subtotal);
      rows.perdaLabel.textContent = "Perda (" + item.perdaPct + "%)";
      rows.perda.textContent = fmt.format(item.perda);
      rows.margemLabel.textContent = "Margem (" + item.margemPct + "%)";
      rows.margem.textContent = fmt.format(item.margem);
      rows.maoDeObra.textContent = fmt.format(item.maoDeObra);
      breakdown.hidden = false;

      out.textContent = item.qtd > 1
        ? fmt.format(item.itemTotal) + " (" + item.qtd + " × " + fmt.format(item.unitTotal) + ")"
        : fmt.format(item.itemTotal);
      out.classList.add("has-value");
      addBtn.disabled = false;
    }

    function setDescontoLabel(el) {
      var texto = (descontoTextoInput.value || "").trim();
      el.innerHTML = "";
      el.appendChild(document.createTextNode("Desconto"));
      if (texto) {
        var span = document.createElement("span");
        span.className = "calc-desconto-label-texto";
        span.textContent = " (" + texto + ")";
        el.appendChild(span);
      }
    }

    function computeDesconto(subtotal) {
      var valor = parseFloat(String(descontoValorInput.value).replace(",", "."));
      if (!isFinite(valor) || valor <= 0) return 0;
      var desconto = descontoTipoInput.value === "pct" ? subtotal * (valor / 100) : valor;
      return Math.min(desconto, subtotal);
    }

    function renderItens() {
      itensList.innerHTML = "";
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;

        var li = document.createElement("li");
        li.className = "calc-item-row";

        var info = document.createElement("span");
        info.className = "calc-item-info";
        info.textContent = (item.nome || "Peça " + (i + 1)) + " × " + item.qtd;

        var valor = document.createElement("span");
        valor.className = "calc-item-valor";
        valor.textContent = fmt.format(item.itemTotal);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "calc-item-remove";
        removeBtn.setAttribute("aria-label", "Remover " + (item.nome || "peça " + (i + 1)));
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          itens.splice(i, 1);
          renderItens();
        });

        li.appendChild(info);
        li.appendChild(valor);
        li.appendChild(removeBtn);
        itensList.appendChild(li);
      });

      var desconto = computeDesconto(total);
      if (desconto > 0) {
        itensSubtotalOut.textContent = fmt.format(total);
        setDescontoLabel(descontoLabel);
        descontoOut.textContent = "-" + fmt.format(desconto);
        descontoBreakdown.hidden = false;
      } else {
        descontoBreakdown.hidden = true;
      }

      itensTotalOut.textContent = fmt.format(total - desconto);
      itensBox.hidden = itens.length === 0;
    }

    [descontoValorInput, descontoTipoInput, descontoTextoInput].forEach(function (el) {
      el.addEventListener("input", renderItens);
    });

    addBtn.addEventListener("click", function () {
      if (!current) return;
      itens.push(current);
      renderItens();

      nome.value = "";
      quantidade.value = "1";
      peso.value = "";
      horas.value = "";
      minutos.value = "";
      margemInput.value = d.margemPct || "";
      perdaInput.value = d.perdaPct || "";
      current = null;
      out.textContent = "Preencha os campos";
      out.classList.remove("has-value");
      breakdown.hidden = true;
      addBtn.disabled = true;
      nome.focus();
    });

    clearBtn.addEventListener("click", function () {
      itens = [];
      descontoValorInput.value = "";
      descontoTipoInput.value = "pct";
      descontoTextoInput.value = "";
      renderItens();
    });

    pdfBtn.addEventListener("click", function () {
      if (!itens.length) return;

      printBody.innerHTML = "";
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;
        var tr = document.createElement("tr");
        ["nome", "qtd", "unit", "subtotal"].forEach(function (col) {
          var td = document.createElement("td");
          if (col === "nome") td.textContent = item.nome || "Peça " + (i + 1);
          else if (col === "qtd") td.textContent = item.qtd;
          else if (col === "unit") td.textContent = fmt.format(item.unitTotal);
          else td.textContent = fmt.format(item.itemTotal);
          tr.appendChild(td);
        });
        printBody.appendChild(tr);
      });

      var desconto = computeDesconto(total);
      if (desconto > 0) {
        printSubtotalOut.textContent = fmt.format(total);
        setDescontoLabel(printDescontoLabel);
        printDescontoOut.textContent = "-" + fmt.format(desconto);
        printDescontoBreakdown.hidden = false;
      } else {
        printDescontoBreakdown.hidden = true;
      }
      printTotalOut.textContent = fmt.format(total - desconto);

      // Vira filho direto do body pra CSS de impressão poder esconder só o resto da página.
      document.body.appendChild(printBox);
      document.body.classList.add("is-printing-calc");
      window.print();
    });

    window.addEventListener("afterprint", function () {
      document.body.classList.remove("is-printing-calc");
    });

    function csvNum(n) {
      return n.toFixed(2).replace(".", ",");
    }

    function csvField(value) {
      var str = String(value);
      return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    }

    csvBtn.addEventListener("click", function () {
      if (!itens.length) return;

      var linhas = [[
        "Peça", "Quantidade", "Filamento", "Energia", "Desgaste da impressora",
        "Subtotal", "Perda (%)", "Perda", "Margem (%)", "Margem", "Mão de obra",
        "Valor unitário", "Valor total"
      ]];
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;
        linhas.push([
          item.nome || "Peça " + (i + 1),
          item.qtd,
          csvNum(item.custoFilamento),
          csvNum(item.energia),
          csvNum(item.desgaste),
          csvNum(item.subtotal),
          csvNum(item.perdaPct),
          csvNum(item.perda),
          csvNum(item.margemPct),
          csvNum(item.margem),
          csvNum(item.maoDeObra),
          csvNum(item.unitTotal),
          csvNum(item.itemTotal)
        ]);
      });

      linhas.push(["Total geral", "", "", "", "", "", "", "", "", "", "", "", csvNum(total)]);

      var csv = linhas.map(function (linha) {
        return linha.map(csvField).join(";");
      }).join("\r\n");

      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "orcamento.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    var LOGO_HIDDEN_KEY = "orcamentoCalc:logoHidden";
    var LOGO_CUSTOM_KEY = "orcamentoCalc:logoCustom";
    var LOGO_MAX_BYTES = 500 * 1024;

    function applyLogoState() {
      if (!printLogo) return;
      var hidden = localStorage.getItem(LOGO_HIDDEN_KEY) === "1";
      var custom = localStorage.getItem(LOGO_CUSTOM_KEY);
      var hasCustom = !!custom;

      // Com logo própria, a marca Wisky 3D Print (texto) fica sempre oculta.
      logoHideInput.checked = hidden || hasCustom;
      logoHideInput.disabled = hasCustom;

      printLogo.style.display = hidden && !hasCustom ? "none" : "";
      printLogo.src = custom || printLogo.dataset.defaultSrc;
      if (printBrand) printBrand.style.display = hidden || hasCustom ? "none" : "";
    }

    logoHideInput.addEventListener("change", function () {
      if (logoHideInput.checked) {
        localStorage.setItem(LOGO_HIDDEN_KEY, "1");
      } else {
        localStorage.removeItem(LOGO_HIDDEN_KEY);
      }
      applyLogoState();
    });

    logoUploadInput.addEventListener("change", function () {
      var file = logoUploadInput.files && logoUploadInput.files[0];
      if (!file) return;

      if (!/^image\//.test(file.type)) {
        alert("Escolha um arquivo de imagem.");
        logoUploadInput.value = "";
        return;
      }
      if (file.size > LOGO_MAX_BYTES) {
        alert("A imagem é muito grande. Escolha uma imagem de até 500KB.");
        logoUploadInput.value = "";
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        localStorage.setItem(LOGO_CUSTOM_KEY, reader.result);
        localStorage.setItem(LOGO_HIDDEN_KEY, "1");
        applyLogoState();
      };
      reader.readAsDataURL(file);
    });

    logoResetBtn.addEventListener("click", function () {
      localStorage.removeItem(LOGO_HIDDEN_KEY);
      localStorage.removeItem(LOGO_CUSTOM_KEY);
      logoUploadInput.value = "";
      applyLogoState();
    });

    applyLogoState();

    form.addEventListener("input", calc);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (current) addBtn.click();
    });
  })();

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

  (function () {
    var carousels = document.querySelectorAll("[data-carousel]");
    if (!carousels.length) return;

    carousels.forEach(function (car) {
      var slides = car.querySelectorAll(".estoque-slide");
      var dots = car.querySelectorAll(".estoque-dot");
      var prev = car.querySelector(".estoque-nav-prev");
      var next = car.querySelector(".estoque-nav-next");
      var idx = 0;

      function show(i) {
        idx = (i + slides.length) % slides.length;
        slides.forEach(function (s, n) {
          var active = n === idx;
          s.classList.toggle("is-active", active);
          s.tabIndex = active ? 0 : -1;
        });
        dots.forEach(function (d, n) {
          d.classList.toggle("is-active", n === idx);
        });
      }

      if (prev) prev.addEventListener("click", function (e) { e.stopPropagation(); show(idx - 1); });
      if (next) next.addEventListener("click", function (e) { e.stopPropagation(); show(idx + 1); });
      dots.forEach(function (d, n) {
        d.addEventListener("click", function (e) { e.stopPropagation(); show(n); });
      });

      // Swipe no celular
      var x0 = null;
      car.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      car.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  })();

  (function () {
    var buttons = document.querySelectorAll("[data-estoque-buy]");
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nome = btn.getAttribute("data-peca");
        if (!nome) return;
        var prontaEntrega = btn.getAttribute("data-pronta-entrega") === "true";
        var msg = "Oi! Tenho interesse na peça " + nome + (prontaEntrega ? " (pronta entrega)." : ".");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).catch(function () {});
        }
      });
    });
  })();

  // Filtro (chips) + ordenação + estado na URL da vitrine da loja.
  (function () {
    var controls = document.querySelector("[data-estoque-controls]");
    var grid = document.querySelector(".estoque-grid");
    if (!controls || !grid) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll(".estoque-card"));
    if (!cards.length) return;

    var chips = Array.prototype.slice.call(controls.querySelectorAll(".estoque-chip"));
    var sortSelect = controls.querySelector("[data-estoque-sort]");
    var searchInput = controls.querySelector("[data-estoque-search]");
    var activeBar = controls.querySelector("[data-estoque-active]");
    var activePills = controls.querySelector("[data-estoque-active-pills]");
    var clearBtn = controls.querySelector("[data-estoque-clear]");
    var countMsg = document.querySelector("[data-estoque-count]");

    var filtrosAtivos = [];
    var termoBusca = "";

    // Remove acentos e caixa pra busca "tolerante" (ex.: "poke" acha "Pokémon").
    function normalizar(txt) {
      return (txt || "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    }

    // Pré-computa categorias e nome normalizado de cada card (uma vez só).
    var itens = cards.map(function (card) {
      return {
        el: card,
        cats: (card.getAttribute("data-categorias") || "")
          .split("§")
          .filter(function (c) { return c !== ""; }),
        nome: normalizar(card.getAttribute("data-nome"))
      };
    });

    // Uma peça combina quando tem TODAS as categorias marcadas (interseção) e o
    // nome contém o termo buscado. combina(_, [], "") === true (mostra tudo).
    function combina(item, filtros, termo) {
      var temCategorias = filtros.every(function (f) {
        return item.cats.indexOf(f) !== -1;
      });
      return temCategorias && (termo === "" || item.nome.indexOf(termo) !== -1);
    }

    function contar(filtros, termo) {
      var n = 0;
      itens.forEach(function (item) { if (combina(item, filtros, termo)) n++; });
      return n;
    }

    function plural(n) {
      return n + (n === 1 ? " peça" : " peças");
    }

    function atualizarContagem(visiveis) {
      if (!countMsg) return;
      countMsg.textContent = visiveis > 0
        ? "Mostrando " + plural(visiveis)
        : "Nenhuma peça com esse filtro por enquanto.";
    }

    // Re-dispara um fade-in suave nos cards visíveis (um reflow só).
    function reproduzirFade() {
      cards.forEach(function (card) { card.classList.remove("estoque-card--in"); });
      void grid.offsetWidth;
      cards.forEach(function (card) {
        if (!card.classList.contains("estoque-card--hidden")) {
          card.classList.add("estoque-card--in");
        }
      });
    }

    function aplicarFiltro(comFade) {
      var visiveis = 0;
      itens.forEach(function (item) {
        var mostra = combina(item, filtrosAtivos, termoBusca);
        item.el.classList.toggle("estoque-card--hidden", !mostra);
        if (mostra) visiveis++;
      });
      atualizarContagem(visiveis);
      atualizarChips();
      atualizarFiltrosAtivos();
      if (comFade) reproduzirFade();
    }

    function ordenar(modo) {
      var ordenados = cards.slice();
      ordenados.sort(function (a, b) {
        if (modo === "preco-asc" || modo === "preco-desc") {
          var pa = parseFloat(a.getAttribute("data-preco")) || 0;
          var pb = parseFloat(b.getAttribute("data-preco")) || 0;
          return modo === "preco-asc" ? pa - pb : pb - pa;
        }
        if (modo === "nome-asc") {
          return (a.getAttribute("data-nome") || "").localeCompare(
            b.getAttribute("data-nome") || "",
            "pt-BR",
            { sensitivity: "base" }
          );
        }
        // padrão: pronta entrega primeiro, depois oferta, depois ordem original do YAML
        function grupo(el) {
          if (el.getAttribute("data-oferta") === "true") return 0;
          if (el.getAttribute("data-pronta-entrega") === "true") return 1;
          return 2;
        }
        var ga = grupo(a);
        var gb = grupo(b);
        if (ga !== gb) return ga - gb;
        return (parseInt(a.getAttribute("data-ordem"), 10) || 0) -
          (parseInt(b.getAttribute("data-ordem"), 10) || 0);
      });
      ordenados.forEach(function (card) {
        grid.appendChild(card);
      });
    }

    // Atualiza cada chip: estado ativo, contagem CONTEXTUAL (quantas peças
    // sobram se ele for somado à seleção atual) e desabilita quem daria zero.
    // "Todos" e chips já ativos nunca desabilitam (precisa poder remover).
    function atualizarChips() {
      chips.forEach(function (chip) {
        var filtro = chip.getAttribute("data-filtro") || "todos";
        var ativo = filtro === "todos"
          ? filtrosAtivos.length === 0
          : filtrosAtivos.indexOf(filtro) !== -1;

        var n;
        if (filtro === "todos") n = contar([], termoBusca);
        else if (ativo) n = contar(filtrosAtivos, termoBusca);
        else n = contar(filtrosAtivos.concat([filtro]), termoBusca);

        var countEl = chip.querySelector(".estoque-chip-count");
        if (countEl) countEl.textContent = n;

        chip.classList.toggle("is-active", ativo);
        chip.setAttribute("aria-pressed", ativo ? "true" : "false");

        var desabilita = filtro !== "todos" && !ativo && n === 0;
        chip.classList.toggle("is-disabled", desabilita);
        chip.disabled = desabilita;
      });
    }

    // Monta as etiquetas de filtros ativos, cada uma com × pra remover.
    // A barra some quando não há nada marcado.
    function atualizarFiltrosAtivos() {
      if (!activeBar || !activePills) return;
      activePills.innerHTML = "";
      filtrosAtivos.forEach(function (cat) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "estoque-active-pill";
        pill.setAttribute("data-remove", cat);
        pill.setAttribute("aria-label", "Remover filtro " + cat);
        var rotulo = document.createElement("span");
        rotulo.textContent = cat;
        var x = document.createElement("span");
        x.className = "estoque-active-x";
        x.setAttribute("aria-hidden", "true");
        x.textContent = "×";
        pill.appendChild(rotulo);
        pill.appendChild(x);
        activePills.appendChild(pill);
      });
      var activeLabel = activeBar.querySelector(".estoque-active-label");
      if (activeLabel) activeLabel.hidden = filtrosAtivos.length === 0;
      activeBar.hidden = filtrosAtivos.length === 0 && termoBusca === "";
    }

    // Reflete filtro + ordenação na URL (?categoria=&ordem=), sem poluir o histórico.
    function atualizarURL() {
      if (!window.history || !window.history.replaceState) return;
      var params = new URLSearchParams(window.location.search);
      if (filtrosAtivos.length > 0) params.set("categoria", filtrosAtivos.join(","));
      else params.delete("categoria");
      if (termoBusca) params.set("busca", termoBusca);
      else params.delete("busca");
      var ordem = sortSelect ? sortSelect.value : "padrao";
      if (ordem && ordem !== "padrao") params.set("ordem", ordem);
      else params.delete("ordem");
      var qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }

    function alternarCategoria(cat) {
      var i = filtrosAtivos.indexOf(cat);
      if (i === -1) filtrosAtivos.push(cat);
      else filtrosAtivos.splice(i, 1);
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (chip.disabled) return;
        var filtro = chip.getAttribute("data-filtro") || "todos";
        if (filtro === "todos") filtrosAtivos = [];
        else alternarCategoria(filtro);
        aplicarFiltro(true);
        atualizarURL();
      });
    });

    // × nas etiquetas de filtros ativos (remove aquela categoria).
    if (activePills) {
      activePills.addEventListener("click", function (e) {
        var pill = e.target.closest(".estoque-active-pill");
        if (!pill) return;
        alternarCategoria(pill.getAttribute("data-remove"));
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        filtrosAtivos = [];
        termoBusca = "";
        if (searchInput) searchInput.value = "";
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        termoBusca = normalizar(searchInput.value);
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    // Botão "Filtros": recolhe/expande TUDO (busca, chips e filtros ativos),
    // deixando só o próprio botão e a ordenação. Usa uma classe no contêiner
    // para não conflitar com o controle dinâmico da barra de filtros ativos.
    var toggleBtn = controls.querySelector("[data-estoque-toggle]");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        var aberto = toggleBtn.getAttribute("aria-expanded") !== "true";
        toggleBtn.setAttribute("aria-expanded", aberto ? "true" : "false");
        controls.classList.toggle("is-collapsed", !aberto);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        ordenar(sortSelect.value);
        atualizarURL();
      });
    }

    // Estado inicial a partir da URL (link compartilhável / sobrevive ao refresh).
    (function initFromURL() {
      var params = new URLSearchParams(window.location.search);
      var cat = params.get("categoria");
      var busca = params.get("busca");
      var ordem = params.get("ordem");

      if (cat) {
        var validas = chips.map(function (c) { return c.getAttribute("data-filtro"); });
        filtrosAtivos = cat.split(",").filter(function (p) {
          return p !== "todos" && validas.indexOf(p) !== -1;
        });
      }
      if (busca && searchInput) {
        searchInput.value = busca;
        termoBusca = normalizar(busca);
      }
      if (ordem && sortSelect) {
        var existe = Array.prototype.some.call(sortSelect.options, function (o) {
          return o.value === ordem;
        });
        if (existe) sortSelect.value = ordem;
      }
      ordenar(sortSelect ? sortSelect.value : "padrao");
      aplicarFiltro(false); // sem fade no load (evita conflito com o reveal-stagger)
    })();
  })();
