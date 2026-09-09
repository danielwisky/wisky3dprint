(function () {
// ---------------------------------------------------------------------------
// BLOCO: Calculadora de orçamento: itens, custos, upload de modelo, PDF/CSV
// ---------------------------------------------------------------------------

  var ModelParser = window.Wisky3D.ModelParser;

  var form = document.getElementById("orcamento-calc");
  if (!form) return;

  var nome = document.getElementById("orcamento-calc-nome");
  var quantidade = document.getElementById("orcamento-calc-quantidade");
  var peso = document.getElementById("orcamento-calc-peso");
  var horas = document.getElementById("orcamento-calc-horas");
  var minutos = document.getElementById("orcamento-calc-minutos");
  var filamento = document.getElementById("orcamento-calc-filamento");
  var horasManuaisInput = document.getElementById("orcamento-calc-horas-manuais");
  var minutosManuaisInput = document.getElementById("orcamento-calc-minutos-manuais");
  var valorHoraInput = document.getElementById("orcamento-calc-valor-hora");
  var hardwareInput = document.getElementById("orcamento-calc-hardware");
  var embalagemInput = document.getElementById("orcamento-calc-embalagem");
  var valorMaquinaInput = document.getElementById("orcamento-calc-valor-maquina");
  var vidaUtilInput = document.getElementById("orcamento-calc-vida-util");
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
  var logoErro = document.getElementById("orcamento-calc-logo-erro");
  var updateToast = document.getElementById("orcamento-calc-update-toast");
  var updateToastBtn = document.getElementById("orcamento-calc-update-btn");
  var installTip = document.getElementById("orcamento-calc-install-tip");
  var installTipTexto = document.getElementById("orcamento-calc-install-tip-texto");
  var installTipFechar = document.getElementById("orcamento-calc-install-tip-fechar");
  var modeloUpload = document.getElementById("orcamento-calc-modelo-upload");
  var modeloPreview = document.getElementById("orcamento-calc-modelo-preview");
  var modeloNomeOut = document.getElementById("orcamento-calc-modelo-nome");
  var modeloDimsOut = document.getElementById("orcamento-calc-modelo-dims");
  var modeloVolumeOut = document.getElementById("orcamento-calc-modelo-volume");
  var modeloDensidadeOut = document.getElementById("orcamento-calc-modelo-densidade");
  var modeloDensidadeRow = document.getElementById("orcamento-calc-modelo-densidade-row");
  var modeloErro = document.getElementById("orcamento-calc-modelo-erro");
  var modeloConcluirWrap = document.getElementById("orcamento-calc-modelo-concluir-wrap");
  var modeloConcluirBtn = document.getElementById("orcamento-calc-modelo-concluir");
  var materialSelect = document.getElementById("orcamento-calc-material");
  var densidadeWrap = document.getElementById("orcamento-calc-densidade-wrap");
  var densidadeInput = document.getElementById("orcamento-calc-densidade");
  var infillInput = document.getElementById("orcamento-calc-infill");
  var paredesInput = document.getElementById("orcamento-calc-paredes");
  var alturaCamadaInput = document.getElementById("orcamento-calc-altura-camada");
  var velocidadeInput = document.getElementById("orcamento-calc-velocidade");
  var tempoHint = document.getElementById("orcamento-calc-tempo-hint");
  var modeloModal = document.getElementById("orcamento-calc-modelo-modal");
  var modeloAbrirBtn = document.getElementById("orcamento-calc-modelo-abrir");
  var modeloFecharBtn = document.getElementById("orcamento-calc-modelo-fechar");
  var modeloEditarBtn = document.getElementById("orcamento-calc-modelo-editar");
  var modeloRemoverBtn = document.getElementById("orcamento-calc-modelo-remover");
  var modeloBadge = document.getElementById("orcamento-calc-modelo-badge");
  var modeloBadgeNome = document.getElementById("orcamento-calc-modelo-badge-nome");
  var pesoAutoTag = document.getElementById("orcamento-calc-peso-auto-tag");
  var tempoAutoTag = document.getElementById("orcamento-calc-tempo-auto-tag");
  var modeloDropzone = document.getElementById("orcamento-calc-dropzone");
  var modeloLoading = document.getElementById("orcamento-calc-modelo-loading");
  var modeloDropzoneTexto = document.getElementById("orcamento-calc-dropzone-texto");
  var modoSimplesBtn = document.getElementById("orcamento-calc-modo-simples");
  var modoCompletoBtn = document.getElementById("orcamento-calc-modo-completo");
  var faixasBox = document.getElementById("orcamento-calc-faixas");
  var faixasCols = document.getElementById("orcamento-calc-faixas-cols");
  var d = form.dataset;
  var fmt = window.Wisky3D.formatarMoeda;
  var parseNum = window.Wisky3D.parseNumeroPtBr;

  var rows = {
    filamento: document.getElementById("orcamento-calc-b-filamento"),
    energia: document.getElementById("orcamento-calc-b-energia"),
    desgaste: document.getElementById("orcamento-calc-b-desgaste"),
    hardwareRow: document.getElementById("orcamento-calc-b-hardware-row"),
    hardware: document.getElementById("orcamento-calc-b-hardware"),
    embalagemRow: document.getElementById("orcamento-calc-b-embalagem-row"),
    embalagem: document.getElementById("orcamento-calc-b-embalagem"),
    subtotal: document.getElementById("orcamento-calc-b-subtotal"),
    perda: document.getElementById("orcamento-calc-b-perda"),
    perdaLabel: document.getElementById("orcamento-calc-b-perda-label"),
    margem: document.getElementById("orcamento-calc-b-margem"),
    margemLabel: document.getElementById("orcamento-calc-b-margem-label"),
    maoDeObra: document.getElementById("orcamento-calc-b-mao-de-obra")
  };

  var itens = [];
  var current = null;

  // Se valor da máquina + vida útil forem informados, o desgaste é
  // proporcional ao tempo de impressão (valor/vida útil × horas); senão
  // cai no valor fixo por impressão configurado em _config.yml.
  function computeDesgaste(h) {
    var valorMaquina = parseNum(valorMaquinaInput.value);
    var vidaUtilH = parseNum(vidaUtilInput.value);
    if (isFinite(valorMaquina) && valorMaquina > 0 && isFinite(vidaUtilH) && vidaUtilH > 0) {
      return (valorMaquina / vidaUtilH) * h;
    }
    return parseFloat(d.desgaste);
  }

  function unitTotalComMargem(subtotalComPerda, margemPct, maoDeObraVal) {
    return subtotalComPerda + subtotalComPerda * (margemPct / 100) + maoDeObraVal;
  }

  // A perda/retrabalho é aplicada sobre o subtotal (filamento + energia +
  // desgaste + hardware + embalagem): equivale a reimprimir essa fração
  // das peças do item.
  function computeItem() {
    var g = parseNum(peso.value);
    var h = (parseFloat(horas.value) || 0) + (parseFloat(minutos.value) || 0) / 60;
    var filamentoKg = parseNum(filamento.value);
    var horasManuais = (parseFloat(horasManuaisInput.value) || 0) + (parseFloat(minutosManuaisInput.value) || 0) / 60;
    var valorHora = parseNum(valorHoraInput.value);
    if (!isFinite(valorHora)) valorHora = parseFloat(d.horaTrabalho) || 0;
    var maoDeObraVal = horasManuais * valorHora;
    var hardwareVal = parseNum(hardwareInput.value) || 0;
    var embalagemVal = parseNum(embalagemInput.value) || 0;
    var margemPct = parseNum(margemInput.value);
    if (!isFinite(margemPct)) margemPct = parseFloat(d.margemPct) || 0;
    var perdaPct = parseNum(perdaInput.value);
    if (!isFinite(perdaPct)) perdaPct = parseFloat(d.perdaPct) || 0;
    var qtd = parseInt(quantidade.value, 10);
    if (!isFinite(qtd) || qtd < 1) qtd = 1;

    if (!isFinite(g) || g <= 0 || h <= 0 || !isFinite(filamentoKg) || filamentoKg <= 0 || maoDeObraVal < 0 || margemPct < 0 || perdaPct < 0) {
      return null;
    }

    var base = window.Wisky3D.calcularSubtotalBase({
      pesoG: g,
      horas: h,
      filamentoKg: filamentoKg,
      potenciaW: parseFloat(d.potenciaW),
      tarifaKwh: parseFloat(d.tarifaKwh),
      desgaste: computeDesgaste(h)
    });
    var custoFilamento = base.custoFilamento;
    var energia = base.energia;
    var desgaste = base.desgaste;
    var subtotal = base.subtotal + hardwareVal + embalagemVal;
    var perda = subtotal * (perdaPct / 100);
    var subtotalComPerda = subtotal + perda;
    var margem = subtotalComPerda * (margemPct / 100);
    var unitTotal = unitTotalComMargem(subtotalComPerda, margemPct, maoDeObraVal);

    return {
      nome: (nome.value || "").trim(),
      qtd: qtd,
      pesoG: g,
      tempoH: h,
      custoFilamento: custoFilamento,
      energia: energia,
      desgaste: desgaste,
      hardware: hardwareVal,
      embalagem: embalagemVal,
      subtotal: subtotal,
      perda: perda,
      perdaPct: perdaPct,
      margem: margem,
      margemPct: margemPct,
      horasManuais: horasManuais,
      valorHora: valorHora,
      maoDeObra: maoDeObraVal,
      subtotalComPerda: subtotalComPerda,
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
    rows.hardwareRow.hidden = item.hardware <= 0;
    rows.hardware.textContent = fmt.format(item.hardware);
    rows.embalagemRow.hidden = item.embalagem <= 0;
    rows.embalagem.textContent = fmt.format(item.embalagem);
    rows.subtotal.textContent = fmt.format(item.subtotal);
    rows.perdaLabel.textContent = "Perda (" + item.perdaPct + "%)";
    rows.perda.textContent = fmt.format(item.perda);
    rows.margemLabel.textContent = "Margem (" + item.margemPct + "%)";
    rows.margem.textContent = fmt.format(item.margem);
    rows.maoDeObra.textContent = fmt.format(item.maoDeObra);
    breakdown.hidden = false;

    renderFaixas(item);

    out.textContent = item.qtd > 1
      ? fmt.format(item.itemTotal) + " (" + item.qtd + " × " + fmt.format(item.unitTotal) + ")"
      : fmt.format(item.itemTotal);
    out.classList.add("has-value");
    addBtn.disabled = false;
  }

  // Faixas de preço sugerido: mesmos custos e mão de obra do item atual,
  // recalculados só trocando a margem, pra comparar cenários de
  // precificação sem alterar o item que será de fato adicionado.
  function renderFaixas(item) {
    if (!faixasCols) return;

    var faixas = String(d.faixasMargemPct || "")
      .split(",")
      .map(function (s) { return parseFloat(s); })
      .filter(function (n) { return isFinite(n); });

    if (!faixas.length || !modoCompleto) {
      faixasBox.hidden = true;
      return;
    }

    var labels = ["Competitivo", "Padrão", "Premium"];
    faixasCols.innerHTML = "";

    faixas.forEach(function (margemPct, i) {
      var unit = unitTotalComMargem(item.subtotalComPerda, margemPct, item.maoDeObra);
      var col = document.createElement("button");
      col.type = "button";
      col.className = "calc-faixa";
      col.setAttribute("aria-label", "Usar margem de " + margemPct + "% (" + (labels[i] || "") + ")");
      var isActive = margemPct === item.margemPct;
      col.classList.toggle("is-active", isActive);
      col.setAttribute("aria-pressed", String(isActive));
      col.addEventListener("click", function () {
        margemInput.value = margemPct;
        calc();
      });

      var label = document.createElement("span");
      label.className = "calc-faixa-label";
      label.textContent = labels[i] || (margemPct + "%");

      var pct = document.createElement("span");
      pct.className = "calc-faixa-pct";
      pct.textContent = margemPct + "%";

      var valor = document.createElement("span");
      valor.className = "calc-faixa-valor";
      valor.textContent = fmt.format(unit);

      col.appendChild(label);
      col.appendChild(pct);
      col.appendChild(valor);
      faixasCols.appendChild(col);
    });

    faixasBox.hidden = false;
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
    var valor = parseNum(descontoValorInput.value);
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

      var infoTitulo = document.createElement("span");
      infoTitulo.textContent = (item.nome || "Peça " + (i + 1)) + " × " + item.qtd;
      info.appendChild(infoTitulo);

      var horasInt = Math.floor(item.tempoH);
      var minutosInt = Math.round((item.tempoH - horasInt) * 60);
      var infoMeta = document.createElement("span");
      infoMeta.className = "calc-item-meta";
      infoMeta.textContent = item.pesoG.toFixed(1) + " g · " + horasInt + "h" + (minutosInt ? " " + minutosInt + "min" : "");
      info.appendChild(infoMeta);

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
    horasManuaisInput.value = "";
    minutosManuaisInput.value = "";
    valorHoraInput.value = d.horaTrabalho || "";
    hardwareInput.value = "";
    embalagemInput.value = "";
    margemInput.value = d.margemPct || "";
    perdaInput.value = d.perdaPct || "";
    modeloUpload.value = "";
    modeloPreview.hidden = true;
    modeloErro.hidden = true;
    modeloBadge.hidden = true;
    modeloAbrirBtn.hidden = false;
    tempoHint.hidden = true;
    pesoAutoTag.hidden = true;
    tempoAutoTag.hidden = true;
    lastMeshStats = null;
    perfilDoArquivo = null;
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
      "Peças e insumos", "Embalagem", "Subtotal", "Perda (%)", "Perda",
      "Margem (%)", "Margem", "Horas manuais", "Valor da hora", "Mão de obra",
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
        csvNum(item.hardware),
        csvNum(item.embalagem),
        csvNum(item.subtotal),
        csvNum(item.perdaPct),
        csvNum(item.perda),
        csvNum(item.margemPct),
        csvNum(item.margem),
        csvNum(item.horasManuais),
        csvNum(item.valorHora),
        csvNum(item.maoDeObra),
        csvNum(item.unitTotal),
        csvNum(item.itemTotal)
      ]);
    });

    linhas.push(["Total geral", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", csvNum(total)]);

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

  // Safari em modo privado (e storage desabilitado) lança ao acessar
  // localStorage — protege igual ao padrão já usado em main.js.
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  var MODO_COMPLETO_KEY = "orcamentoCalc:modoCompleto";
  var camposAvancados = document.querySelectorAll(".calc-field-avancado");
  var modoCompleto = lsGet(MODO_COMPLETO_KEY) === "1";

  function aplicarModo() {
    camposAvancados.forEach(function (el) {
      el.hidden = !modoCompleto;
    });
    if (modoSimplesBtn && modoCompletoBtn) {
      modoSimplesBtn.classList.toggle("is-active", !modoCompleto);
      modoSimplesBtn.setAttribute("aria-pressed", String(!modoCompleto));
      modoCompletoBtn.classList.toggle("is-active", modoCompleto);
      modoCompletoBtn.setAttribute("aria-pressed", String(modoCompleto));
    }
    calc();
  }

  if (modoSimplesBtn && modoCompletoBtn) {
    modoSimplesBtn.addEventListener("click", function () {
      modoCompleto = false;
      lsRemove(MODO_COMPLETO_KEY);
      aplicarModo();
    });
    modoCompletoBtn.addEventListener("click", function () {
      modoCompleto = true;
      lsSet(MODO_COMPLETO_KEY, "1");
      aplicarModo();
    });
  }

  aplicarModo();

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

  function mostrarErroLogo(msg) {
    if (!logoErro) return;
    logoErro.textContent = msg;
    logoErro.hidden = false;
  }

  function limparErroLogo() {
    if (!logoErro) return;
    logoErro.hidden = true;
    logoErro.textContent = "";
  }

  logoUploadInput.addEventListener("change", function () {
    var file = logoUploadInput.files && logoUploadInput.files[0];
    if (!file) return;

    if (!/^image\//.test(file.type)) {
      mostrarErroLogo("Escolha um arquivo de imagem.");
      logoUploadInput.value = "";
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      mostrarErroLogo("A imagem é muito grande. Escolha uma imagem de até 500KB.");
      logoUploadInput.value = "";
      return;
    }

    limparErroLogo();
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
    limparErroLogo();
    applyLogoState();
  });

  applyLogoState();

  var MODELO_MAX_BYTES = 60 * 1024 * 1024;
  var MODELO_MAX_TRIANGULOS = 6000000;
  var lastMeshStats = null;
  var perfilDoArquivo = null;

  function densidadeAtual() {
    if (perfilDoArquivo) return perfilDoArquivo.densidade;
    if (materialSelect.value === "outro") {
      return parseNum(densidadeInput.value);
    }
    var opt = materialSelect.options[materialSelect.selectedIndex];
    return parseFloat(opt.dataset.densidade);
  }

  function mostrarErroModelo(msg) {
    modeloErro.textContent = msg;
    modeloErro.hidden = false;
  }

  function limparErroModelo() {
    modeloErro.hidden = true;
    modeloErro.textContent = "";
  }

  function aplicarEstimativas() {
    if (!lastMeshStats) return;

    var densidade = densidadeAtual();
    var infillPct = parseNum(infillInput.value) || 0;
    var paredes = parseInt(paredesInput.value, 10) || parseInt(d.paredes, 10) || 0;

    if (!isFinite(densidade) || densidade <= 0) {
      mostrarErroModelo("Não encontramos a densidade do material nesse arquivo. Selecione o material (ou informe a densidade manualmente) para calcular o peso.");
      tempoHint.hidden = true;
      return;
    }
    limparErroModelo();

    var larguraExtrusao = parseFloat(d.larguraExtrusaoMm) || 0.4;

    // Volume "real" de material: a peça não é só infill uniforme — as
    // paredes (perímetros sólidos) ficam por cima do infill e, em modelos
    // com muitas peças pequenas/finas, costumam pesar mais que o miolo.
    // Aproxima a casca como área de superfície × espessura de parede
    // (nº de paredes × largura de extrusão) e trata só o volume restante
    // (o "miolo") como preenchido a infill_pct.
    var espessuraParede = paredes * larguraExtrusao;
    var volumeCascaMm3 = Math.min(lastMeshStats.areaMm2 * espessuraParede, lastMeshStats.volumeMm3);
    var volumeMiologMm3 = lastMeshStats.volumeMm3 - volumeCascaMm3;
    var volumeMaterialMm3 = volumeCascaMm3 + volumeMiologMm3 * (infillPct / 100);

    var volumeCm3 = volumeMaterialMm3 / 1000;
    peso.value = (volumeCm3 * densidade).toFixed(1);

    var alturaCamada = parseNum(alturaCamadaInput.value) || parseFloat(d.alturaCamadaMm) || 0.2;
    var velocidade = parseNum(velocidadeInput.value) || parseFloat(d.velocidadeMmS) || 50;
    var overheadPorCamada = parseFloat(d.overheadCamadaS) || 2;

    var alturaModelo = lastMeshStats.bbox.maxZ - lastMeshStats.bbox.minZ;
    var nCamadas = Math.ceil(alturaModelo / alturaCamada);
    var vazaoMm3S = velocidade * alturaCamada * larguraExtrusao;
    var tempoTotalMin = vazaoMm3S > 0
      ? (volumeMaterialMm3 / vazaoMm3S + nCamadas * overheadPorCamada) / 60
      : 0;

    horas.value = Math.floor(tempoTotalMin / 60);
    minutos.value = Math.round(tempoTotalMin % 60);
    tempoHint.hidden = false;

    pesoAutoTag.hidden = false;
    tempoAutoTag.hidden = false;

    calc();
  }

  peso.addEventListener("input", function () {
    pesoAutoTag.hidden = true;
  });
  [horas, minutos].forEach(function (el) {
    el.addEventListener("input", function () {
      tempoAutoTag.hidden = true;
    });
  });

  function processarStats(stats, nomeArquivo, perfilArquivo) {
    var triangleCount = stats.triangleCount;
    var bbox = stats.bbox;
    var volumeMm3 = stats.volumeMm3;

    if (!triangleCount) {
      mostrarErroModelo("Não foi possível ler triângulos desse arquivo.");
      return;
    }
    if (triangleCount > MODELO_MAX_TRIANGULOS) {
      mostrarErroModelo("Modelo muito complexo para calcular no navegador. Tente simplificar a malha ou informe peso/tempo manualmente.");
      return;
    }
    if (volumeMm3 <= 0) {
      mostrarErroModelo("Malha inválida ou não fechada (non-manifold). Tente exportar novamente do seu software de modelagem.");
      return;
    }

    lastMeshStats = { volumeMm3: volumeMm3, areaMm2: stats.areaMm2 || 0, bbox: bbox };
    perfilDoArquivo = perfilArquivo || null;
    limparErroModelo();

    nome.value = nomeArquivo.replace(/\.(stl|3mf)$/i, "");

    modeloNomeOut.textContent = nomeArquivo;
    modeloDimsOut.textContent =
      (bbox.maxX - bbox.minX).toFixed(1) + " × " +
      (bbox.maxY - bbox.minY).toFixed(1) + " × " +
      (bbox.maxZ - bbox.minZ).toFixed(1) + " mm";
    modeloVolumeOut.textContent = (volumeMm3 / 1000).toFixed(2) + " cm³";
    if (perfilDoArquivo) {
      modeloDensidadeOut.textContent = perfilDoArquivo.densidade + " g/cm³";
      modeloDensidadeRow.hidden = false;
      // Perfil do fatiador embutido no 3MF (Bambu/Orca): usa como ponto de
      // partida quando disponível, mas continua editável — o usuário pode
      // ajustar antes de calcular.
      if (perfilDoArquivo.paredes) paredesInput.value = perfilDoArquivo.paredes;
      if (perfilDoArquivo.infillPct != null) infillInput.value = perfilDoArquivo.infillPct;
    } else {
      modeloDensidadeRow.hidden = true;
    }
    modeloPreview.hidden = false;

    modeloBadgeNome.textContent = nomeArquivo;
    modeloBadge.hidden = false;
    modeloAbrirBtn.hidden = true;
    // Não fecha o modal sozinho: o usuário pode querer ajustar material,
    // infill, paredes, altura de camada ou velocidade antes de fechar —
    // fechar automaticamente escondia esses campos logo após o cálculo.
    // O botão "Concluir" deixa esse fechamento explícito.
    modeloConcluirWrap.hidden = false;

    aplicarEstimativas();
  }

  function abrirModeloModal() {
    modeloModal.hidden = false;
  }

  function fecharModeloModal() {
    modeloModal.hidden = true;
  }

  modeloAbrirBtn.addEventListener("click", abrirModeloModal);
  modeloEditarBtn.addEventListener("click", abrirModeloModal);
  modeloFecharBtn.addEventListener("click", fecharModeloModal);
  modeloModal.addEventListener("click", function (e) {
    if (e.target === modeloModal) fecharModeloModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modeloModal.hidden) fecharModeloModal();
  });

  modeloRemoverBtn.addEventListener("click", function () {
    modeloUpload.value = "";
    lastMeshStats = null;
    perfilDoArquivo = null;
    modeloPreview.hidden = true;
    limparErroModelo();
    modeloBadge.hidden = true;
    modeloAbrirBtn.hidden = false;
    modeloConcluirWrap.hidden = true;
    tempoHint.hidden = true;
    pesoAutoTag.hidden = true;
    tempoAutoTag.hidden = true;

    // Peso/tempo vieram do modelo removido — sem ele deixam de fazer
    // sentido, então volta pro estado de preenchimento manual.
    peso.value = "";
    horas.value = "";
    minutos.value = "";
    calc();
  });

  modeloConcluirBtn.addEventListener("click", fecharModeloModal);

  function mostrarCarregandoModelo(ativo) {
    modeloLoading.hidden = !ativo;
    modeloDropzoneTexto.hidden = ativo;
  }

  function processarArquivoModelo(file) {
    if (!file) return;

    modeloPreview.hidden = true;
    limparErroModelo();

    if (file.size > MODELO_MAX_BYTES) {
      mostrarErroModelo("Arquivo muito grande (máx. 60MB).");
      modeloUpload.value = "";
      return;
    }

    var ext = (file.name.split(".").pop() || "").toLowerCase();

    if (ext === "stl") {
      mostrarCarregandoModelo(true);
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var triangulos = ModelParser.parseSTL(reader.result);
          var stats = triangulos.length
            ? {
              triangleCount: triangulos.length,
              bbox: ModelParser.computeBoundingBox(triangulos),
              volumeMm3: ModelParser.computeMeshVolumeMm3(triangulos),
              areaMm2: ModelParser.computeMeshAreaMm2(triangulos)
            }
            : { triangleCount: 0, bbox: ModelParser.bboxVazio(), volumeMm3: 0, areaMm2: 0 };
          processarStats(stats, file.name, null);
        } catch (e) {
          mostrarErroModelo("Não foi possível ler esse arquivo STL.");
        } finally {
          mostrarCarregandoModelo(false);
        }
      };
      reader.onerror = function () {
        mostrarErroModelo("Falha ao ler o arquivo.");
        mostrarCarregandoModelo(false);
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "3mf") {
      if (typeof JSZip === "undefined") {
        mostrarErroModelo("Não foi possível carregar o leitor de 3MF. Verifique sua conexão e tente novamente.");
        return;
      }
      mostrarCarregandoModelo(true);
      var zipRef = null;
      JSZip.loadAsync(file)
        .then(function (zip) {
          zipRef = zip;
          var modelFiles = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
          if (!modelFiles.length) modelFiles = zip.file(/3dmodel\.model$/i);
          if (!modelFiles.length) throw new Error("modelo não encontrado no 3MF");
          var configFiles = zip.file(/project_settings\.config$/i);
          return Promise.all([
            modelFiles[0].async("text"),
            configFiles.length ? configFiles[0].async("text") : Promise.resolve(null)
          ]);
        })
        .then(function (resultados) {
          var xmlText = resultados[0];
          var configText = resultados[1];
          var perfilArquivo = configText ? ModelParser.parse3MFPerfil(configText) : null;
          return ModelParser.parse3MFPackage(zipRef, xmlText).then(function (resultado) {
            processarStats(resultado, file.name, perfilArquivo);
          });
        })
        .catch(function () {
          mostrarErroModelo("Não foi possível ler esse arquivo 3MF.");
        })
        .then(function () {
          mostrarCarregandoModelo(false);
        });
    } else {
      mostrarErroModelo("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      modeloUpload.value = "";
    }
  }

  modeloUpload.addEventListener("change", function () {
    var file = modeloUpload.files && modeloUpload.files[0];
    processarArquivoModelo(file);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    modeloDropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      modeloDropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach(function (evt) {
    modeloDropzone.addEventListener(evt, function () {
      modeloDropzone.classList.remove("is-dragover");
    });
  });
  modeloDropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    processarArquivoModelo(file);
  });

  materialSelect.addEventListener("change", function () {
    densidadeWrap.hidden = materialSelect.value !== "outro";
    perfilDoArquivo = null;
    modeloDensidadeRow.hidden = true;
    aplicarEstimativas();
  });
  [infillInput, paredesInput, alturaCamadaInput, velocidadeInput, densidadeInput].forEach(function (el) {
    el.addEventListener("input", aplicarEstimativas);
  });

  form.addEventListener("input", calc);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (current) addBtn.click();
  });

  // Dica de instalação (Adicionar à Tela de Início): iOS não expõe evento
  // de instalação, então o único jeito é orientar o passo a passo manual.
  // Android tem o prompt nativo do Chrome, mas nem todo navegador/versão
  // mostra automaticamente — a dica cobre esse caso também.
  var INSTALL_TIP_DISMISSED_KEY = "orcamentoCalc:installTipFechada";
  if (installTip && installTipTexto && installTipFechar) {
    var jaInstalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    var ua = window.navigator.userAgent || "";
    // Desde o iPadOS 13, o Safari do iPad manda UA de desktop ("Macintosh"),
    // sem "iPad" — só dá pra distinguir de um Mac de verdade pelo touch.
    var isIPadOS13Mais = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
    var isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOS13Mais;
    var isAndroid = /Android/.test(ua);

    if (!jaInstalado && lsGet(INSTALL_TIP_DISMISSED_KEY) !== "1") {
      if (isIOS) {
        installTipTexto.textContent = "📲 Adicione esta calculadora à tela de início e use como app, até offline: toque em Compartilhar na barra do Safari e depois em \"Adicionar à Tela de Início\".";
        installTip.hidden = false;
      } else if (isAndroid) {
        installTipTexto.textContent = "📲 Adicione esta calculadora à tela de início e use como app, até offline: toque no menu (⋮) do navegador e depois em \"Instalar app\" ou \"Adicionar à tela inicial\".";
        installTip.hidden = false;
      }
    }

    installTipFechar.addEventListener("click", function () {
      installTip.hidden = true;
      lsSet(INSTALL_TIP_DISMISSED_KEY, "1");
    });
  }

  // Registra o service worker do app instalável, escopo restrito a
  // /orcamento/ — não afeta o resto do site. URL/escopo vêm do dataset
  // (renderizados via Liquid) pra respeitar site.baseurl.
  //
  // O service worker fica em espera (não ativa sozinho) quando detecta uma
  // versão nova — só ativa se o usuário tocar em "Atualizar", pra não trocar
  // o código embaixo dos pés de quem já está no meio de um orçamento.
  if ("serviceWorker" in navigator && d.swUrl) {
    window.addEventListener("load", function () {
      var toastAtivo = false;
      function mostrarToastAtualizacao(worker) {
        if (!worker || !updateToast || !updateToastBtn || toastAtivo) return;
        toastAtivo = true;
        updateToast.hidden = false;
        updateToastBtn.addEventListener("click", function () {
          worker.postMessage("skipWaiting");
        }, { once: true });
      }

      navigator.serviceWorker.register(d.swUrl, { scope: d.swScope }).then(function (reg) {
        // reg.waiting já está pronto (instalado numa aba anterior) — mostra
        // o aviso na hora, sem esperar um "statechange" que não vai ocorrer.
        if (reg.waiting && navigator.serviceWorker.controller) {
          mostrarToastAtualizacao(reg.waiting);
        }
        reg.addEventListener("updatefound", function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              mostrarToastAtualizacao(worker);
            }
          });
        });
      }).catch(function () {});

      var recarregando = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (recarregando) return;
        recarregando = true;
        window.location.reload();
      });
    });
  }
})();

