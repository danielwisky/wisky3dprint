(function () {
// ---------------------------------------------------------------------------
// BLOCO: Calculadora de orçamento: itens, custos, upload de modelo, PDF/CSV
// ---------------------------------------------------------------------------

  var ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  var ToolUtils = window.Wisky3D && window.Wisky3D.ToolUtils;

  var form = document.getElementById("quote-calc");
  if (!form) return;

  var nameInput = document.getElementById("quote-calc-name");
  var quantityInput = document.getElementById("quote-calc-quantity");
  var weightInput = document.getElementById("quote-calc-weight");
  var hoursInput = document.getElementById("quote-calc-hours");
  var minutesInput = document.getElementById("quote-calc-minutes");
  var filamentInput = document.getElementById("quote-calc-filament");
  var manualHoursInput = document.getElementById("quote-calc-manual-hours");
  var manualMinutesInput = document.getElementById("quote-calc-manual-minutes");
  var hourlyRateInput = document.getElementById("quote-calc-hourly-rate");
  var powerInput = document.getElementById("quote-calc-power");
  var tariffInput = document.getElementById("quote-calc-tariff");
  var hardwareInput = document.getElementById("quote-calc-hardware");
  var packagingInput = document.getElementById("quote-calc-packaging");
  var shippingInput = document.getElementById("quote-calc-shipping");
  var wearInput = document.getElementById("quote-calc-wear");
  var machineValueInput = document.getElementById("quote-calc-machine-value");
  var lifespanInput = document.getElementById("quote-calc-lifespan");
  var marginInput = document.getElementById("quote-calc-margin");
  var lossInput = document.getElementById("quote-calc-loss");
  var out = document.getElementById("quote-calc-result");
  var breakdown = document.getElementById("quote-calc-breakdown");
  var addBtn = document.getElementById("quote-calc-add");
  var itemsBox = document.getElementById("quote-calc-items");
  var itemsList = document.getElementById("quote-calc-items-list");
  var itemsTotalOut = document.getElementById("quote-calc-items-total");
  var discountValueInput = document.getElementById("quote-calc-discount-value");
  var discountTypeInput = document.getElementById("quote-calc-discount-type");
  var discountTextInput = document.getElementById("quote-calc-discount-text");
  var discountBreakdown = document.getElementById("quote-calc-discount-breakdown");
  var itemsSubtotalOut = document.getElementById("quote-calc-items-subtotal");
  var discountLabel = document.getElementById("quote-calc-discount-label");
  var discountOut = document.getElementById("quote-calc-discount-out");
  var pdfBtn = document.getElementById("quote-calc-pdf");
  var csvBtn = document.getElementById("quote-calc-csv");
  var clearBtn = document.getElementById("quote-calc-clear");
  var printBox = document.getElementById("quote-calc-print");
  var printBody = document.getElementById("quote-calc-print-body");
  var printThPackaging = document.getElementById("quote-calc-print-th-packaging");
  var printThShipping = document.getElementById("quote-calc-print-th-shipping");
  var printDiscountBreakdown = document.getElementById("quote-calc-print-discount-breakdown");
  var printSubtotalOut = document.getElementById("quote-calc-print-subtotal");
  var printDiscountLabel = document.getElementById("quote-calc-print-discount-label");
  var printDiscountOut = document.getElementById("quote-calc-print-discount");
  var printTotalOut = document.getElementById("quote-calc-print-total");
  var printLogo = document.getElementById("quote-calc-print-logo");
  var printBrand = document.getElementById("quote-calc-print-brand");
  var logoHideInput = document.getElementById("quote-calc-logo-hide");
  var logoUploadInput = document.getElementById("quote-calc-logo-upload");
  var logoResetBtn = document.getElementById("quote-calc-logo-reset");
  var logoError = document.getElementById("quote-calc-logo-error");
  var modelUpload = document.getElementById("quote-calc-model-upload");
  var modelPreview = document.getElementById("quote-calc-model-preview");
  var modelNameOut = document.getElementById("quote-calc-model-name");
  var modelDimsOut = document.getElementById("quote-calc-model-dims");
  var modelVolumeOut = document.getElementById("quote-calc-model-volume");
  var modelDensityOut = document.getElementById("quote-calc-model-density");
  var modelDensityRow = document.getElementById("quote-calc-model-density-row");
  var modelError = document.getElementById("quote-calc-model-error");
  var modelDoneWrap = document.getElementById("quote-calc-model-done-wrap");
  var modelDoneBtn = document.getElementById("quote-calc-model-done");
  var materialSelect = document.getElementById("quote-calc-material");
  var densityWrap = document.getElementById("quote-calc-density-wrap");
  var densityInput = document.getElementById("quote-calc-density");
  var infillInput = document.getElementById("quote-calc-infill");
  var wallsInput = document.getElementById("quote-calc-walls");
  var layerHeightInput = document.getElementById("quote-calc-layer-height");
  var speedInput = document.getElementById("quote-calc-speed");
  var timeHint = document.getElementById("quote-calc-time-hint");
  var modelModal = document.getElementById("quote-calc-model-modal");
  var modelOpenBtn = document.getElementById("quote-calc-model-open");
  var modelCloseBtn = document.getElementById("quote-calc-model-close");
  var modelEditBtn = document.getElementById("quote-calc-model-edit");
  var modelRemoveBtn = document.getElementById("quote-calc-model-remove");
  var modelBadge = document.getElementById("quote-calc-model-badge");
  var modelBadgeName = document.getElementById("quote-calc-model-badge-name");
  var weightAutoTag = document.getElementById("quote-calc-weight-auto-tag");
  var timeAutoTag = document.getElementById("quote-calc-time-auto-tag");
  var modelDropzone = document.getElementById("quote-calc-dropzone");
  var modelLoading = document.getElementById("quote-calc-model-loading");
  var modelDropzoneText = document.getElementById("quote-calc-dropzone-text");
  var simpleModeBtn = document.getElementById("quote-calc-mode-simple");
  var fullModeBtn = document.getElementById("quote-calc-mode-full");
  var tiersBox = document.getElementById("quote-calc-tiers");
  var tiersCols = document.getElementById("quote-calc-tiers-cols");
  var d = form.dataset;
  var fmt = window.Wisky3D.currencyFormatter;
  var parseNum = window.Wisky3D.parsePtBrNumber;
  var parseMeasure = window.Wisky3D.parsePtBrMeasure;
  var Calculations = window.Wisky3D.QuoteCalculations;

  var rows = {
    filament: document.getElementById("quote-calc-b-filament"),
    energy: document.getElementById("quote-calc-b-energy"),
    wear: document.getElementById("quote-calc-b-wear"),
    hardwareRow: document.getElementById("quote-calc-b-hardware-row"),
    hardware: document.getElementById("quote-calc-b-hardware"),
    subtotal: document.getElementById("quote-calc-b-subtotal"),
    loss: document.getElementById("quote-calc-b-loss"),
    lossLabel: document.getElementById("quote-calc-b-loss-label"),
    margin: document.getElementById("quote-calc-b-margin"),
    marginLabel: document.getElementById("quote-calc-b-margin-label"),
    labor: document.getElementById("quote-calc-b-labor"),
    packagingRow: document.getElementById("quote-calc-b-packaging-row"),
    packaging: document.getElementById("quote-calc-b-packaging"),
    shippingRow: document.getElementById("quote-calc-b-shipping-row"),
    shipping: document.getElementById("quote-calc-b-shipping")
  };

  var items = [];
  var current = null;

  function numberOrDefault(input, fallback) {
    var value = parseNum(input.value);
    return isFinite(value) ? value : fallback;
  }

  function hoursFrom(hoursField, minutesField) {
    return (parseFloat(hoursField.value) || 0) + (parseFloat(minutesField.value) || 0) / 60;
  }

  function computeItem() {
    var h = hoursFrom(hoursInput, minutesInput);
    var quantity = parseInt(quantityInput.value, 10);

    return Calculations.calculateItem({
      name: (nameInput.value || "").trim(),
      quantity: isFinite(quantity) && quantity >= 1 ? quantity : 1,
      weightG: parseNum(weightInput.value),
      hours: h,
      filamentPricePerKg: parseNum(filamentInput.value),
      manualHours: hoursFrom(manualHoursInput, manualMinutesInput),
      hourlyRate: numberOrDefault(hourlyRateInput, parseFloat(d.laborRate) || 0),
      hardware: parseNum(hardwareInput.value) || 0,
      packaging: parseNum(packagingInput.value) || 0,
      shipping: parseNum(shippingInput.value) || 0,
      marginPct: numberOrDefault(marginInput, parseFloat(d.marginPct) || 0),
      lossPct: numberOrDefault(lossInput, parseFloat(d.lossPct) || 0),
      powerW: numberOrDefault(powerInput, parseFloat(d.powerW)),
      kwhRate: numberOrDefault(tariffInput, parseFloat(d.tariffKwh)),
      wear: Calculations.calculateWear({
        machineValue: parseNum(machineValueInput.value),
        lifespanH: parseNum(lifespanInput.value),
        fixedWear: parseNum(wearInput.value),
        defaultWear: parseFloat(d.wear),
        hours: h
      })
    });
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

    rows.filament.textContent = fmt.format(item.filamentCost);
    rows.energy.textContent = fmt.format(item.energy);
    rows.wear.textContent = fmt.format(item.wear);
    rows.hardwareRow.hidden = item.hardware <= 0;
    rows.hardware.textContent = fmt.format(item.hardware);
    rows.subtotal.textContent = fmt.format(item.subtotal);
    rows.lossLabel.textContent = "Perda (" + item.lossPct + "%)";
    rows.loss.textContent = fmt.format(item.loss);
    rows.marginLabel.textContent = "Margem (" + item.marginPct + "%)";
    rows.margin.textContent = fmt.format(item.margin);
    rows.labor.textContent = fmt.format(item.labor);
    rows.packagingRow.hidden = item.packaging <= 0;
    rows.packaging.textContent = fmt.format(item.packaging);
    rows.shippingRow.hidden = item.shipping <= 0;
    rows.shipping.textContent = fmt.format(item.shipping);
    breakdown.hidden = false;

    renderTiers(item);

    out.textContent = item.quantity > 1
      ? fmt.format(item.itemTotal) + " (" + item.quantity + " × " + fmt.format(item.unitTotal) + ")"
      : fmt.format(item.itemTotal);
    out.classList.add("has-value");
    addBtn.disabled = false;
  }

  // Faixas de preço sugerido: mesmos custos e mão de obra do item atual,
  // recalculados só trocando a margem, pra comparar cenários de
  // precificação sem alterar o item que será de fato adicionado.
  function renderTiers(item) {
    if (!tiersCols) return;

    var tiers = String(d.marginTiersPct || "")
      .split(",")
      .map(function (s) { return parseFloat(s); })
      .filter(function (n) { return isFinite(n); });

    if (!tiers.length || !fullMode) {
      tiersBox.hidden = true;
      return;
    }

    var labels = ["Competitivo", "Padrão", "Premium"];
    tiersCols.innerHTML = "";

    tiers.forEach(function (marginPct, i) {
      var unit = Calculations.unitTotalWithMargin(item.subtotalWithLoss, marginPct, item.labor, item.packaging, item.shipping);
      var col = document.createElement("button");
      col.type = "button";
      col.className = "calc-tier";
      col.setAttribute("aria-label", "Usar margem de " + marginPct + "% (" + (labels[i] || "") + ")");
      var isActive = marginPct === item.marginPct;
      col.classList.toggle("is-active", isActive);
      col.setAttribute("aria-pressed", String(isActive));
      col.addEventListener("click", function () {
        marginInput.value = marginPct;
        calc();
      });

      var label = document.createElement("span");
      label.className = "calc-tier-label";
      label.textContent = labels[i] || (marginPct + "%");

      var pct = document.createElement("span");
      pct.className = "calc-tier-pct";
      pct.textContent = marginPct + "%";

      var value = document.createElement("span");
      value.className = "calc-tier-value";
      value.textContent = fmt.format(unit);

      col.appendChild(label);
      col.appendChild(pct);
      col.appendChild(value);
      tiersCols.appendChild(col);
    });

    tiersBox.hidden = false;
  }

  function setDiscountLabel(el) {
    var text = (discountTextInput.value || "").trim();
    el.innerHTML = "";
    el.appendChild(document.createTextNode("Desconto"));
    if (text) {
      var span = document.createElement("span");
      span.className = "calc-discount-label-text";
      span.textContent = " (" + text + ")";
      el.appendChild(span);
    }
  }

  function computeDiscount(subtotal) {
    return Calculations.calculateDiscount(subtotal, parseNum(discountValueInput.value), discountTypeInput.value);
  }

  function sumItems() {
    return items.reduce(function (total, item) { return total + item.itemTotal; }, 0);
  }

  // Usado tanto na lista de itens quanto no orçamento impresso. Retorna o
  // total já com desconto.
  function renderDiscount(subtotal, target) {
    var discount = computeDiscount(subtotal);
    if (discount > 0) {
      target.subtotal.textContent = fmt.format(subtotal);
      setDiscountLabel(target.label);
      target.value.textContent = "-" + fmt.format(discount);
    }
    target.breakdown.hidden = discount <= 0;
    return subtotal - discount;
  }

  function formatTime(timeH) {
    var hoursInt = Math.floor(timeH);
    var minutesInt = Math.round((timeH - hoursInt) * 60);
    return hoursInt + "h" + (minutesInt ? " " + minutesInt + "min" : "");
  }

  function createSpan(className, text) {
    var span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = text;
    return span;
  }

  function createItemRow(item, i) {
    var li = document.createElement("li");
    li.className = "calc-item-row";

    var info = createSpan("calc-item-info", "");
    info.appendChild(createSpan("", Calculations.itemName(item, i) + " × " + item.quantity));
    info.appendChild(createSpan("calc-item-meta", item.weightG.toFixed(1) + " g · " + formatTime(item.timeH)));

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "calc-item-remove";
    removeBtn.setAttribute("aria-label", "Remover " + (item.name || "peça " + (i + 1)));
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", function () {
      items.splice(i, 1);
      renderItems();
    });

    li.appendChild(info);
    li.appendChild(createSpan("calc-item-value", fmt.format(item.itemTotal)));
    li.appendChild(removeBtn);
    return li;
  }

  function renderItems() {
    itemsList.innerHTML = "";
    items.forEach(function (item, i) {
      itemsList.appendChild(createItemRow(item, i));
    });

    var total = renderDiscount(sumItems(), {
      breakdown: discountBreakdown,
      subtotal: itemsSubtotalOut,
      label: discountLabel,
      value: discountOut
    });
    itemsTotalOut.textContent = fmt.format(total);
    itemsBox.hidden = items.length === 0;
  }

  [discountValueInput, discountTypeInput, discountTextInput].forEach(function (el) {
    el.addEventListener("input", renderItems);
  });

  function clearModel() {
    modelUpload.value = "";
    if (modelLoads) modelLoads.next();
    showModelLoading(false);
    lastMeshStats = null;
    fileProfile = null;
    modelPreview.hidden = true;
    clearModelError();
    modelBadge.hidden = true;
    modelOpenBtn.hidden = false;
    modelDoneWrap.hidden = true;
    timeHint.hidden = true;
    weightAutoTag.hidden = true;
    timeAutoTag.hidden = true;
  }

  addBtn.addEventListener("click", function () {
    if (!current) return;
    items.push(current);
    renderItems();

    nameInput.value = "";
    quantityInput.value = "1";
    weightInput.value = "";
    hoursInput.value = "";
    minutesInput.value = "";
    manualHoursInput.value = "";
    manualMinutesInput.value = "";
    hardwareInput.value = "";
    clearModel();
    calc();
    nameInput.focus();
  });

  clearBtn.addEventListener("click", function () {
    items = [];
    discountValueInput.value = "";
    discountTypeInput.value = "pct";
    discountTextInput.value = "";
    renderItems();
  });

  function createPrintRow(item, i, cols) {
    var values = {
      name: Calculations.itemName(item, i),
      quantity: item.quantity,
      packaging: fmt.format(item.packaging),
      shipping: fmt.format(item.shipping),
      unit: fmt.format(item.unitTotal),
      subtotal: fmt.format(item.itemTotal)
    };
    var tr = document.createElement("tr");
    cols.forEach(function (col) {
      var td = document.createElement("td");
      td.textContent = values[col];
      tr.appendChild(td);
    });
    return tr;
  }

  pdfBtn.addEventListener("click", function () {
    if (!items.length) return;

    // Colunas de Embalagem/Frete só aparecem no orçamento impresso se algum
    // item do orçamento de fato usa esses valores. Evita poluir a tabela
    // com colunas zeradas.
    var hasPackaging = items.some(function (item) { return item.packaging > 0; });
    var hasShipping = items.some(function (item) { return item.shipping > 0; });
    printThPackaging.hidden = !hasPackaging;
    printThShipping.hidden = !hasShipping;

    var cols = ["name", "quantity"];
    if (hasPackaging) cols.push("packaging");
    if (hasShipping) cols.push("shipping");
    cols.push("unit", "subtotal");

    printBody.innerHTML = "";
    items.forEach(function (item, i) {
      printBody.appendChild(createPrintRow(item, i, cols));
    });

    var total = renderDiscount(sumItems(), {
      breakdown: printDiscountBreakdown,
      subtotal: printSubtotalOut,
      label: printDiscountLabel,
      value: printDiscountOut
    });
    printTotalOut.textContent = fmt.format(total);

    // Vira filho direto do body pra CSS de impressão poder esconder só o resto da página.
    document.body.appendChild(printBox);
    document.body.classList.add("is-printing-calc");
    window.print();
  });

  window.addEventListener("afterprint", function () {
    document.body.classList.remove("is-printing-calc");
  });

  csvBtn.addEventListener("click", function () {
    if (!items.length) return;
    var blob = new Blob(["\ufeff" + Calculations.generateCsv(items)], { type: "text/csv;charset=utf-8;" });
    ModelParser.downloadBlob(blob, "orcamento.csv");
  });

  // Safari em modo privado (e storage desabilitado) lança ao acessar
  // localStorage. Protege igual ao padrão já usado em main.js.
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // Campos opcionais: 0 no _config.yml significa "deixar em branco".
  function positiveOrNull(value) {
    return Number(value) > 0 ? value : null;
  }

  // Valores que tendem a se repetir de peça pra peça (tarifa de energia,
  // valor da hora etc.) ficam salvos e pré-preenchidos na próxima visita,
  // em vez de sempre voltar ao padrão do _config.yml.
  var PERSISTED_FIELDS = [
    { input: filamentInput, key: "orcamentoCalc:filamento" },
    { input: hourlyRateInput, key: "orcamentoCalc:valorHora", fallback: d.laborRate },
    { input: powerInput, key: "orcamentoCalc:potencia", fallback: d.powerW },
    { input: tariffInput, key: "orcamentoCalc:tarifa", fallback: d.tariffKwh },
    { input: marginInput, key: "orcamentoCalc:margem", fallback: d.marginPct },
    { input: lossInput, key: "orcamentoCalc:perda", fallback: d.lossPct },
    { input: wearInput, key: "orcamentoCalc:desgaste", fallback: d.wear },
    { input: machineValueInput, key: "orcamentoCalc:valorMaquina", fallback: positiveOrNull(d.machineValue) },
    { input: lifespanInput, key: "orcamentoCalc:vidaUtil", fallback: positiveOrNull(d.lifespanH) },
    { input: packagingInput, key: "orcamentoCalc:embalagem" },
    { input: shippingInput, key: "orcamentoCalc:frete" }
  ];

  // Defaults do _config.yml chegam como float JS (ponto decimal, ex.: "0.8"),
  // mas os campos são lidos com parsePtBrNumber (vírgula decimal). Sem essa
  // conversão o "0.8" seria lido como 8.
  function toPtBr(value) {
    return String(value).replace(".", ",");
  }

  function persistedValue(field) {
    var saved = lsGet(field.key);
    if (saved != null) return saved;
    return field.fallback != null && field.fallback !== "" ? toPtBr(field.fallback) : "";
  }

  function initPersistedFields() {
    PERSISTED_FIELDS.forEach(function (field) {
      field.input.value = persistedValue(field);
      field.input.addEventListener("input", function () {
        lsSet(field.key, field.input.value);
      });
    });
  }

  initPersistedFields();

  var FULL_MODE_KEY = "orcamentoCalc:modoCompleto";
  var advancedFields = document.querySelectorAll(".calc-field-advanced");
  var fullMode = lsGet(FULL_MODE_KEY) === "1";

  function applyMode() {
    advancedFields.forEach(function (el) {
      el.hidden = !fullMode;
    });
    if (simpleModeBtn && fullModeBtn) {
      simpleModeBtn.classList.toggle("is-active", !fullMode);
      simpleModeBtn.setAttribute("aria-pressed", String(!fullMode));
      fullModeBtn.classList.toggle("is-active", fullMode);
      fullModeBtn.setAttribute("aria-pressed", String(fullMode));
    }
    calc();
  }

  if (simpleModeBtn && fullModeBtn) {
    simpleModeBtn.addEventListener("click", function () {
      fullMode = false;
      lsRemove(FULL_MODE_KEY);
      applyMode();
    });
    fullModeBtn.addEventListener("click", function () {
      fullMode = true;
      lsSet(FULL_MODE_KEY, "1");
      applyMode();
    });
  }

  applyMode();

  var LOGO_HIDDEN_KEY = "orcamentoCalc:logoHidden";
  var LOGO_CUSTOM_KEY = "orcamentoCalc:logoCustom";
  var LOGO_MAX_BYTES = 500 * 1024;

  function applyLogoState() {
    if (!printLogo) return;
    var hidden = lsGet(LOGO_HIDDEN_KEY) === "1";
    var custom = lsGet(LOGO_CUSTOM_KEY);
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
      lsSet(LOGO_HIDDEN_KEY, "1");
    } else {
      lsRemove(LOGO_HIDDEN_KEY);
    }
    applyLogoState();
  });

  function showLogoError(msg) {
    if (!logoError) return;
    logoError.textContent = msg;
    logoError.hidden = false;
  }

  function clearLogoError() {
    if (!logoError) return;
    logoError.hidden = true;
    logoError.textContent = "";
  }

  logoUploadInput.addEventListener("change", function () {
    var file = logoUploadInput.files && logoUploadInput.files[0];
    if (!file) return;

    if (!/^image\//.test(file.type)) {
      showLogoError("Escolha um arquivo de imagem.");
      logoUploadInput.value = "";
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      showLogoError("A imagem é muito grande. Escolha uma imagem de até 500KB.");
      logoUploadInput.value = "";
      return;
    }

    clearLogoError();
    var reader = new FileReader();
    reader.onload = function () {
      lsSet(LOGO_CUSTOM_KEY, reader.result);
      lsSet(LOGO_HIDDEN_KEY, "1");
      applyLogoState();
    };
    reader.readAsDataURL(file);
  });

  logoResetBtn.addEventListener("click", function () {
    lsRemove(LOGO_HIDDEN_KEY);
    lsRemove(LOGO_CUSTOM_KEY);
    logoUploadInput.value = "";
    clearLogoError();
    applyLogoState();
  });

  applyLogoState();

  var MODEL_MAX_BYTES = 60 * 1024 * 1024;
  var lastMeshStats = null;
  var modelLoads = ToolUtils ? ToolUtils.createSequencer() : null;
  var fileProfile = null;

  function currentDensity() {
    if (fileProfile) return fileProfile.density;
    if (materialSelect.value === "other") {
      return parseMeasure(densityInput.value);
    }
    var opt = materialSelect.options[materialSelect.selectedIndex];
    return parseFloat(opt.dataset.density);
  }

  function showModelError(msg) {
    modelError.textContent = msg;
    modelError.hidden = false;
  }

  function clearModelError() {
    modelError.hidden = true;
    modelError.textContent = "";
  }

  function applyEstimates() {
    if (!lastMeshStats) return;

    var density = currentDensity();
    var infillPct = parseNum(infillInput.value) || 0;
    var walls = parseInt(wallsInput.value, 10) || parseInt(d.walls, 10) || 0;

    if (!isFinite(density) || density <= 0) {
      showModelError("Não encontramos a densidade do material nesse arquivo. Selecione o material (ou informe a densidade manualmente) para calcular o peso.");
      timeHint.hidden = true;
      return;
    }
    clearModelError();

    var estimate = Calculations.estimateWeightAndTime({
      volumeMm3: lastMeshStats.volumeMm3,
      areaMm2: lastMeshStats.areaMm2,
      modelHeightMm: lastMeshStats.bbox.maxZ - lastMeshStats.bbox.minZ,
      density: density,
      infillPct: infillPct,
      walls: walls,
      extrusionWidth: parseFloat(d.extrusionWidthMm) || 0.4,
      layerHeight: parseMeasure(layerHeightInput.value) || parseFloat(d.layerHeightMm) || 0.2,
      speed: parseMeasure(speedInput.value) || parseFloat(d.speedMmS) || 50,
      overheadPerLayer: parseFloat(d.layerOverheadS) || 2
    });

    weightInput.value = estimate.weightG.toFixed(1);
    hoursInput.value = estimate.hours;
    minutesInput.value = estimate.minutes;
    timeHint.hidden = false;

    weightAutoTag.hidden = false;
    timeAutoTag.hidden = false;

    calc();
  }

  weightInput.addEventListener("input", function () {
    weightAutoTag.hidden = true;
  });
  [hoursInput, minutesInput].forEach(function (el) {
    el.addEventListener("input", function () {
      timeAutoTag.hidden = true;
    });
  });

  function processStats(stats, fileName, profile) {
    var triangleCount = stats.triangleCount;
    var bbox = stats.bbox;
    var volumeMm3 = stats.volumeMm3;

    if (!triangleCount) {
      showModelError("Não foi possível ler triângulos desse arquivo.");
      return;
    }
    if (triangleCount > ToolUtils.MAX_TRIANGLES) {
      showModelError("Modelo muito complexo para calcular no navegador. Tente simplificar a malha ou informe peso/tempo manualmente.");
      return;
    }
    if (volumeMm3 <= 0) {
      showModelError("Malha inválida ou não fechada (non-manifold). Tente exportar novamente do seu software de modelagem.");
      return;
    }

    lastMeshStats = { volumeMm3: volumeMm3, areaMm2: stats.areaMm2 || 0, bbox: bbox };
    fileProfile = profile || null;
    clearModelError();

    nameInput.value = fileName.replace(/\.(stl|3mf)$/i, "");

    modelNameOut.textContent = fileName;
    modelDimsOut.textContent =
      (bbox.maxX - bbox.minX).toFixed(1) + " × " +
      (bbox.maxY - bbox.minY).toFixed(1) + " × " +
      (bbox.maxZ - bbox.minZ).toFixed(1) + " mm";
    modelVolumeOut.textContent = (volumeMm3 / 1000).toFixed(2) + " cm³";
    if (fileProfile) {
      modelDensityOut.textContent = fileProfile.density + " g/cm³";
      modelDensityRow.hidden = false;
      // Perfil do fatiador embutido no 3MF (Bambu/Orca): usa como ponto de
      // partida quando disponível, mas continua editável: o usuário pode
      // ajustar antes de calcular.
      if (fileProfile.walls) wallsInput.value = fileProfile.walls;
      if (fileProfile.infillPct != null) infillInput.value = fileProfile.infillPct;
    } else {
      modelDensityRow.hidden = true;
    }
    modelPreview.hidden = false;

    modelBadgeName.textContent = fileName;
    modelBadge.hidden = false;
    modelOpenBtn.hidden = true;
    // Não fecha o modal sozinho: o usuário pode querer ajustar material,
    // infill, paredes, altura de camada ou velocidade antes de fechar:
    // fechar automaticamente escondia esses campos logo após o cálculo.
    // O botão "Concluir" deixa esse fechamento explícito.
    modelDoneWrap.hidden = false;

    applyEstimates();
  }

  var modelModalDialog = modelModal.querySelector(".calc-modal");
  var modelLastFocus = null;

  function modalFocusables() {
    return Array.prototype.slice.call(
      modelModalDialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) { return el.offsetParent !== null; });
  }

  function openModelModal() {
    modelLastFocus = document.activeElement;
    modelModal.hidden = false;
    modelCloseBtn.focus();
  }

  function closeModelModal() {
    modelModal.hidden = true;
    if (modelLastFocus && typeof modelLastFocus.focus === "function") {
      modelLastFocus.focus();
    }
    modelLastFocus = null;
  }

  modelOpenBtn.addEventListener("click", openModelModal);
  modelEditBtn.addEventListener("click", openModelModal);
  modelCloseBtn.addEventListener("click", closeModelModal);
  modelModal.addEventListener("click", function (e) {
    if (e.target === modelModal) closeModelModal();
  });
  document.addEventListener("keydown", function (e) {
    if (modelModal.hidden) return;
    if (e.key === "Escape") {
      closeModelModal();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trap: mantém o Tab circulando dentro do modal enquanto aberto.
    var focusables = modalFocusables();
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  modelRemoveBtn.addEventListener("click", function () {
    clearModel();

    // Peso/tempo vieram do modelo removido. Sem ele deixam de fazer
    // sentido, então volta pro estado de preenchimento manual.
    weightInput.value = "";
    hoursInput.value = "";
    minutesInput.value = "";
    calc();
  });

  modelDoneBtn.addEventListener("click", closeModelModal);

  function showModelLoading(active) {
    modelLoading.hidden = !active;
    modelDropzoneText.hidden = active;
  }

  function processModelFile(file) {
    if (!file) return;

    modelPreview.hidden = true;
    clearModelError();

    if (!ModelParser || !modelLoads) {
      showModelError("Não foi possível carregar o leitor de modelos 3D. Recarregue a página e tente novamente.");
      return;
    }
    if (file.size > MODEL_MAX_BYTES) {
      showModelError("Arquivo muito grande (máx. 60MB).");
      return;
    }

    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext !== "stl" && ext !== "3mf") {
      showModelError("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      return;
    }

    var id = modelLoads.next();
    showModelLoading(true);

    var reading = ext === "stl" ? readStatsSTL(file) : readStats3MF(file);
    reading
      .then(function (r) {
        if (modelLoads.isCurrent(id)) processStats(r.stats, file.name, r.profile);
      })
      .catch(function () {
        if (modelLoads.isCurrent(id)) showModelError("Não foi possível ler esse arquivo " + ext.toUpperCase() + ".");
      })
      .then(function () {
        if (modelLoads.isCurrent(id)) showModelLoading(false);
      });
  }

  function readStatsSTL(file) {
    return file.arrayBuffer().then(function (buffer) {
      var triangles = ModelParser.parseSTL(buffer);
      var stats = triangles.length
        ? {
          triangleCount: triangles.length,
          bbox: ModelParser.computeBoundingBox(triangles),
          volumeMm3: ModelParser.computeMeshVolumeMm3(triangles),
          areaMm2: ModelParser.computeMeshAreaMm2(triangles)
        }
        : { triangleCount: 0, bbox: ModelParser.emptyBbox(), volumeMm3: 0, areaMm2: 0 };
      return { stats: stats, profile: null };
    });
  }

  function readStats3MF(file) {
    return ToolUtils.read3MFPackage(file).then(function (pkg) {
      if (!pkg.modelText) throw new Error("modelo não encontrado no 3MF");
      var profile = pkg.configText ? ModelParser.parse3MFProfile(pkg.configText) : null;
      return ModelParser.parse3MFPackage(pkg.zip, pkg.modelText, pkg.modelSettingsText).then(function (stats) {
        return { stats: stats, profile: profile };
      });
    });
  }

  if (ToolUtils) ToolUtils.bindDropzone(modelDropzone, modelUpload, processModelFile);

  materialSelect.addEventListener("change", function () {
    densityWrap.hidden = materialSelect.value !== "other";
    fileProfile = null;
    modelDensityRow.hidden = true;
    applyEstimates();
  });
  [infillInput, wallsInput, layerHeightInput, speedInput, densityInput].forEach(function (el) {
    el.addEventListener("input", applyEstimates);
  });

  form.addEventListener("input", calc);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (current) addBtn.click();
  });

})();

