(function () {
  // ---------------------------------------------------------------------------
  // BLOCO: Calculadora de orçamento: itens, custos, upload de modelo, PDF/CSV
  // ---------------------------------------------------------------------------

  const ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  const ToolUtils = window.Wisky3D && window.Wisky3D.ToolUtils;

  const form = document.getElementById("quote-calc");
  if (!form) return;

  const nameInput = document.getElementById("quote-calc-name");
  const quantityInput = document.getElementById("quote-calc-quantity");
  const weightInput = document.getElementById("quote-calc-weight");
  const hoursInput = document.getElementById("quote-calc-hours");
  const minutesInput = document.getElementById("quote-calc-minutes");
  const filamentInput = document.getElementById("quote-calc-filament");
  const manualHoursInput = document.getElementById("quote-calc-manual-hours");
  const manualMinutesInput = document.getElementById("quote-calc-manual-minutes");
  const hourlyRateInput = document.getElementById("quote-calc-hourly-rate");
  const powerInput = document.getElementById("quote-calc-power");
  const tariffInput = document.getElementById("quote-calc-tariff");
  const hardwareInput = document.getElementById("quote-calc-hardware");
  const packagingInput = document.getElementById("quote-calc-packaging");
  const shippingInput = document.getElementById("quote-calc-shipping");
  const wearInput = document.getElementById("quote-calc-wear");
  const machineValueInput = document.getElementById("quote-calc-machine-value");
  const lifespanInput = document.getElementById("quote-calc-lifespan");
  const marginInput = document.getElementById("quote-calc-margin");
  const lossInput = document.getElementById("quote-calc-loss");
  const out = document.getElementById("quote-calc-result");
  const breakdown = document.getElementById("quote-calc-breakdown");
  const addBtn = document.getElementById("quote-calc-add");
  const itemsBox = document.getElementById("quote-calc-items");
  const itemsList = document.getElementById("quote-calc-items-list");
  const itemsTotalOut = document.getElementById("quote-calc-items-total");
  const discountValueInput = document.getElementById("quote-calc-discount-value");
  const discountTypeInput = document.getElementById("quote-calc-discount-type");
  const discountTextInput = document.getElementById("quote-calc-discount-text");
  const discountBreakdown = document.getElementById("quote-calc-discount-breakdown");
  const itemsSubtotalOut = document.getElementById("quote-calc-items-subtotal");
  const discountLabel = document.getElementById("quote-calc-discount-label");
  const discountOut = document.getElementById("quote-calc-discount-out");
  const pdfBtn = document.getElementById("quote-calc-pdf");
  const csvBtn = document.getElementById("quote-calc-csv");
  const clearBtn = document.getElementById("quote-calc-clear");
  const printBox = document.getElementById("quote-calc-print");
  const printBody = document.getElementById("quote-calc-print-body");
  const printThPackaging = document.getElementById("quote-calc-print-th-packaging");
  const printThShipping = document.getElementById("quote-calc-print-th-shipping");
  const printDiscountBreakdown = document.getElementById("quote-calc-print-discount-breakdown");
  const printSubtotalOut = document.getElementById("quote-calc-print-subtotal");
  const printDiscountLabel = document.getElementById("quote-calc-print-discount-label");
  const printDiscountOut = document.getElementById("quote-calc-print-discount");
  const printTotalOut = document.getElementById("quote-calc-print-total");
  const printLogo = document.getElementById("quote-calc-print-logo");
  const printBrand = document.getElementById("quote-calc-print-brand");
  const logoHideInput = document.getElementById("quote-calc-logo-hide");
  const logoUploadInput = document.getElementById("quote-calc-logo-upload");
  const logoResetBtn = document.getElementById("quote-calc-logo-reset");
  const logoError = document.getElementById("quote-calc-logo-error");
  const modelUpload = document.getElementById("quote-calc-model-upload");
  const modelPreview = document.getElementById("quote-calc-model-preview");
  const modelNameOut = document.getElementById("quote-calc-model-name");
  const modelDimsOut = document.getElementById("quote-calc-model-dims");
  const modelVolumeOut = document.getElementById("quote-calc-model-volume");
  const modelDensityOut = document.getElementById("quote-calc-model-density");
  const modelDensityRow = document.getElementById("quote-calc-model-density-row");
  const modelError = document.getElementById("quote-calc-model-error");
  const modelDoneWrap = document.getElementById("quote-calc-model-done-wrap");
  const modelDoneBtn = document.getElementById("quote-calc-model-done");
  const materialSelect = document.getElementById("quote-calc-material");
  const densityWrap = document.getElementById("quote-calc-density-wrap");
  const densityInput = document.getElementById("quote-calc-density");
  const infillInput = document.getElementById("quote-calc-infill");
  const wallsInput = document.getElementById("quote-calc-walls");
  const layerHeightInput = document.getElementById("quote-calc-layer-height");
  const speedInput = document.getElementById("quote-calc-speed");
  const timeHint = document.getElementById("quote-calc-time-hint");
  const modelModal = document.getElementById("quote-calc-model-modal");
  const modelOpenBtn = document.getElementById("quote-calc-model-open");
  const modelCloseBtn = document.getElementById("quote-calc-model-close");
  const modelEditBtn = document.getElementById("quote-calc-model-edit");
  const modelRemoveBtn = document.getElementById("quote-calc-model-remove");
  const modelBadge = document.getElementById("quote-calc-model-badge");
  const modelBadgeName = document.getElementById("quote-calc-model-badge-name");
  const weightAutoTag = document.getElementById("quote-calc-weight-auto-tag");
  const timeAutoTag = document.getElementById("quote-calc-time-auto-tag");
  const modelDropzone = document.getElementById("quote-calc-dropzone");
  const modelLoading = document.getElementById("quote-calc-model-loading");
  const modelDropzoneText = document.getElementById("quote-calc-dropzone-text");
  const simpleModeBtn = document.getElementById("quote-calc-mode-simple");
  const fullModeBtn = document.getElementById("quote-calc-mode-full");
  const tiersBox = document.getElementById("quote-calc-tiers");
  const tiersCols = document.getElementById("quote-calc-tiers-cols");
  const d = form.dataset;
  const fmt = window.Wisky3D.currencyFormatter;
  const parseNum = window.Wisky3D.parsePtBrNumber;
  const parseMeasure = window.Wisky3D.parsePtBrMeasure;
  const Calculations = window.Wisky3D.QuoteCalculations;

  const rows = {
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

  let items = [];
  let current = null;
  // Modelo 3D carregado no modal (ver processStats); null sem modelo.
  let lastMeshStats = null;
  let fileProfile = null;
  const modelLoads = ToolUtils ? ToolUtils.createSequencer() : null;

  function numberOrDefault(input, fallback) {
    const value = parseNum(input.value);
    return isFinite(value) ? value : fallback;
  }

  function hoursFrom(hoursField, minutesField) {
    return (parseFloat(hoursField.value) || 0) + (parseFloat(minutesField.value) || 0) / 60;
  }

  function computeItem() {
    const h = hoursFrom(hoursInput, minutesInput);
    const quantity = parseInt(quantityInput.value, 10);

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
    const item = computeItem();
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

    out.textContent =
      item.quantity > 1
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

    const tiers = String(d.marginTiersPct || "")
      .split(",")
      .map(function (s) {
        return parseFloat(s);
      })
      .filter(function (n) {
        return isFinite(n);
      });

    if (!tiers.length || !fullMode) {
      tiersBox.hidden = true;
      return;
    }

    const labels = ["Competitivo", "Padrão", "Premium"];
    tiersCols.innerHTML = "";

    tiers.forEach(function (marginPct, i) {
      const unit = Calculations.unitTotalWithMargin(
        item.subtotalWithLoss,
        marginPct,
        item.labor,
        item.packaging,
        item.shipping
      );
      const col = document.createElement("button");
      col.type = "button";
      col.className = "calc-tier";
      col.setAttribute("aria-label", "Usar margem de " + marginPct + "% (" + (labels[i] || "") + ")");
      const isActive = marginPct === item.marginPct;
      col.classList.toggle("is-active", isActive);
      col.setAttribute("aria-pressed", String(isActive));
      col.addEventListener("click", function () {
        marginInput.value = marginPct;
        calc();
      });

      const label = document.createElement("span");
      label.className = "calc-tier-label";
      label.textContent = labels[i] || marginPct + "%";

      const pct = document.createElement("span");
      pct.className = "calc-tier-pct";
      pct.textContent = marginPct + "%";

      const value = document.createElement("span");
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
    const text = (discountTextInput.value || "").trim();
    el.innerHTML = "";
    el.appendChild(document.createTextNode("Desconto"));
    if (text) {
      const span = document.createElement("span");
      span.className = "calc-discount-label-text";
      span.textContent = " (" + text + ")";
      el.appendChild(span);
    }
  }

  function computeDiscount(subtotal) {
    return Calculations.calculateDiscount(subtotal, parseNum(discountValueInput.value), discountTypeInput.value);
  }

  function sumItems() {
    return items.reduce(function (total, item) {
      return total + item.itemTotal;
    }, 0);
  }

  // Usado tanto na lista de itens quanto no orçamento impresso. Retorna o
  // total já com desconto.
  function renderDiscount(subtotal, target) {
    const discount = computeDiscount(subtotal);
    if (discount > 0) {
      target.subtotal.textContent = fmt.format(subtotal);
      setDiscountLabel(target.label);
      target.value.textContent = "-" + fmt.format(discount);
    }
    target.breakdown.hidden = discount <= 0;
    return subtotal - discount;
  }

  function formatTime(timeH) {
    const hoursInt = Math.floor(timeH);
    const minutesInt = Math.round((timeH - hoursInt) * 60);
    return hoursInt + "h" + (minutesInt ? " " + minutesInt + "min" : "");
  }

  function createSpan(className, text) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = text;
    return span;
  }

  function createItemRow(item, i) {
    const li = document.createElement("li");
    li.className = "calc-item-row";

    const info = createSpan("calc-item-info", "");
    info.appendChild(createSpan("", Calculations.itemName(item, i) + " × " + item.quantity));
    info.appendChild(createSpan("calc-item-meta", item.weightG.toFixed(1) + " g · " + formatTime(item.timeH)));

    const removeBtn = document.createElement("button");
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

    const total = renderDiscount(sumItems(), {
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
    const values = {
      name: Calculations.itemName(item, i),
      quantity: item.quantity,
      packaging: fmt.format(item.packaging),
      shipping: fmt.format(item.shipping),
      unit: fmt.format(item.unitTotal),
      subtotal: fmt.format(item.itemTotal)
    };
    const tr = document.createElement("tr");
    cols.forEach(function (col) {
      const td = document.createElement("td");
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
    const hasPackaging = items.some(function (item) {
      return item.packaging > 0;
    });
    const hasShipping = items.some(function (item) {
      return item.shipping > 0;
    });
    printThPackaging.hidden = !hasPackaging;
    printThShipping.hidden = !hasShipping;

    const cols = ["name", "quantity"];
    if (hasPackaging) cols.push("packaging");
    if (hasShipping) cols.push("shipping");
    cols.push("unit", "subtotal");

    printBody.innerHTML = "";
    items.forEach(function (item, i) {
      printBody.appendChild(createPrintRow(item, i, cols));
    });

    const total = renderDiscount(sumItems(), {
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
    const blob = new Blob(["\ufeff" + Calculations.generateCsv(items)], { type: "text/csv;charset=utf-8;" });
    ModelParser.downloadBlob(blob, "orcamento.csv");
  });

  // Safari em modo privado (e storage desabilitado) lança ao acessar
  // localStorage. Protege igual ao padrão já usado em main.js.
  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }
  function lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // Campos opcionais: 0 no _config.yml significa "deixar em branco".
  function positiveOrNull(value) {
    return Number(value) > 0 ? value : null;
  }

  // Valores que tendem a se repetir de peça pra peça (tarifa de energia,
  // valor da hora etc.) ficam salvos e pré-preenchidos na próxima visita,
  // em vez de sempre voltar ao padrão do _config.yml.
  const PERSISTED_FIELDS = [
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
    const saved = lsGet(field.key);
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

  const FULL_MODE_KEY = "orcamentoCalc:modoCompleto";
  const advancedFields = document.querySelectorAll(".calc-field-advanced");
  let fullMode = lsGet(FULL_MODE_KEY) === "1";

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

  const LOGO_HIDDEN_KEY = "orcamentoCalc:logoHidden";
  const LOGO_CUSTOM_KEY = "orcamentoCalc:logoCustom";
  const LOGO_MAX_BYTES = 500 * 1024;

  function applyLogoState() {
    if (!printLogo) return;
    const hidden = lsGet(LOGO_HIDDEN_KEY) === "1";
    const custom = lsGet(LOGO_CUSTOM_KEY);
    const hasCustom = !!custom;

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
    const file = logoUploadInput.files && logoUploadInput.files[0];
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
    const reader = new FileReader();
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

  const MODEL_MAX_BYTES = 60 * 1024 * 1024;

  function currentDensity() {
    if (fileProfile) return fileProfile.density;
    if (materialSelect.value === "other") {
      return parseMeasure(densityInput.value);
    }
    const opt = materialSelect.options[materialSelect.selectedIndex];
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

    const density = currentDensity();
    const infillPct = parseNum(infillInput.value) || 0;
    const walls = parseInt(wallsInput.value, 10) || parseInt(d.walls, 10) || 0;

    if (!isFinite(density) || density <= 0) {
      showModelError(
        "Não encontramos a densidade do material nesse arquivo. Selecione o material (ou informe a densidade manualmente) para calcular o peso."
      );
      timeHint.hidden = true;
      return;
    }
    clearModelError();

    const estimate = Calculations.estimateWeightAndTime({
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
    const triangleCount = stats.triangleCount;
    const bbox = stats.bbox;
    const volumeMm3 = stats.volumeMm3;

    if (!triangleCount) {
      showModelError("Não foi possível ler triângulos desse arquivo.");
      return;
    }
    if (triangleCount > ToolUtils.MAX_TRIANGLES) {
      showModelError(
        "Modelo muito complexo para calcular no navegador. Tente simplificar a malha ou informe peso/tempo manualmente."
      );
      return;
    }
    if (volumeMm3 <= 0) {
      showModelError(
        "Malha inválida ou não fechada (non-manifold). Tente exportar novamente do seu software de modelagem."
      );
      return;
    }

    lastMeshStats = { volumeMm3: volumeMm3, areaMm2: stats.areaMm2 || 0, bbox: bbox };
    fileProfile = profile || null;
    clearModelError();

    nameInput.value = fileName.replace(/\.(stl|3mf)$/i, "");

    modelNameOut.textContent = fileName;
    modelDimsOut.textContent =
      (bbox.maxX - bbox.minX).toFixed(1) +
      " × " +
      (bbox.maxY - bbox.minY).toFixed(1) +
      " × " +
      (bbox.maxZ - bbox.minZ).toFixed(1) +
      " mm";
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

  const modelModalDialog = modelModal.querySelector(".calc-modal");
  let modelLastFocus = null;

  function modalFocusables() {
    return Array.prototype.slice
      .call(
        modelModalDialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return el.offsetParent !== null;
      });
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
    const focusables = modalFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
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

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext !== "stl" && ext !== "3mf") {
      showModelError("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      return;
    }

    const id = modelLoads.next();
    showModelLoading(true);

    const reading = ext === "stl" ? readStatsSTL(file) : readStats3MF(file);
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
      const triangles = ModelParser.parseSTL(buffer);
      const stats = triangles.length
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
      const profile = pkg.configText ? ModelParser.parse3MFProfile(pkg.configText) : null;
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
