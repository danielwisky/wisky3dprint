(function () {
// ---------------------------------------------------------------------------
// BLOCO: Calculadora de orçamento: itens, custos, upload de modelo, PDF/CSV
// ---------------------------------------------------------------------------

  var ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  var ToolUtils = window.Wisky3D && window.Wisky3D.ToolUtils;

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
  var potenciaInput = document.getElementById("orcamento-calc-potencia");
  var tarifaInput = document.getElementById("orcamento-calc-tarifa");
  var hardwareInput = document.getElementById("orcamento-calc-hardware");
  var embalagemInput = document.getElementById("orcamento-calc-embalagem");
  var freteInput = document.getElementById("orcamento-calc-frete");
  var desgasteInput = document.getElementById("orcamento-calc-desgaste");
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
  var printThEmbalagem = document.getElementById("orcamento-calc-print-th-embalagem");
  var printThFrete = document.getElementById("orcamento-calc-print-th-frete");
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
  var parseMedida = window.Wisky3D.parseMedidaPtBr;
  var Calculo = window.Wisky3D.OrcamentoCalculo;

  var rows = {
    filamento: document.getElementById("orcamento-calc-b-filamento"),
    energia: document.getElementById("orcamento-calc-b-energia"),
    desgaste: document.getElementById("orcamento-calc-b-desgaste"),
    hardwareRow: document.getElementById("orcamento-calc-b-hardware-row"),
    hardware: document.getElementById("orcamento-calc-b-hardware"),
    subtotal: document.getElementById("orcamento-calc-b-subtotal"),
    perda: document.getElementById("orcamento-calc-b-perda"),
    perdaLabel: document.getElementById("orcamento-calc-b-perda-label"),
    margem: document.getElementById("orcamento-calc-b-margem"),
    margemLabel: document.getElementById("orcamento-calc-b-margem-label"),
    maoDeObra: document.getElementById("orcamento-calc-b-mao-de-obra"),
    embalagemRow: document.getElementById("orcamento-calc-b-embalagem-row"),
    embalagem: document.getElementById("orcamento-calc-b-embalagem"),
    freteRow: document.getElementById("orcamento-calc-b-frete-row"),
    frete: document.getElementById("orcamento-calc-b-frete")
  };

  var itens = [];
  var current = null;

  function numeroOuPadrao(input, padrao) {
    var valor = parseNum(input.value);
    return isFinite(valor) ? valor : padrao;
  }

  function horasDe(horasInput, minutosInput) {
    return (parseFloat(horasInput.value) || 0) + (parseFloat(minutosInput.value) || 0) / 60;
  }

  function computeItem() {
    var h = horasDe(horas, minutos);
    var qtd = parseInt(quantidade.value, 10);

    return Calculo.calcularItem({
      nome: (nome.value || "").trim(),
      qtd: isFinite(qtd) && qtd >= 1 ? qtd : 1,
      pesoG: parseNum(peso.value),
      horas: h,
      filamentoKg: parseNum(filamento.value),
      horasManuais: horasDe(horasManuaisInput, minutosManuaisInput),
      valorHora: numeroOuPadrao(valorHoraInput, parseFloat(d.horaTrabalho) || 0),
      hardware: parseNum(hardwareInput.value) || 0,
      embalagem: parseNum(embalagemInput.value) || 0,
      frete: parseNum(freteInput.value) || 0,
      margemPct: numeroOuPadrao(margemInput, parseFloat(d.margemPct) || 0),
      perdaPct: numeroOuPadrao(perdaInput, parseFloat(d.perdaPct) || 0),
      potenciaW: numeroOuPadrao(potenciaInput, parseFloat(d.potenciaW)),
      tarifaKwh: numeroOuPadrao(tarifaInput, parseFloat(d.tarifaKwh)),
      desgaste: Calculo.calcularDesgaste({
        valorMaquina: parseNum(valorMaquinaInput.value),
        vidaUtilH: parseNum(vidaUtilInput.value),
        desgasteFixo: parseNum(desgasteInput.value),
        desgastePadrao: parseFloat(d.desgaste),
        horas: h
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

    rows.filamento.textContent = fmt.format(item.custoFilamento);
    rows.energia.textContent = fmt.format(item.energia);
    rows.desgaste.textContent = fmt.format(item.desgaste);
    rows.hardwareRow.hidden = item.hardware <= 0;
    rows.hardware.textContent = fmt.format(item.hardware);
    rows.subtotal.textContent = fmt.format(item.subtotal);
    rows.perdaLabel.textContent = "Perda (" + item.perdaPct + "%)";
    rows.perda.textContent = fmt.format(item.perda);
    rows.margemLabel.textContent = "Margem (" + item.margemPct + "%)";
    rows.margem.textContent = fmt.format(item.margem);
    rows.maoDeObra.textContent = fmt.format(item.maoDeObra);
    rows.embalagemRow.hidden = item.embalagem <= 0;
    rows.embalagem.textContent = fmt.format(item.embalagem);
    rows.freteRow.hidden = item.frete <= 0;
    rows.frete.textContent = fmt.format(item.frete);
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
      var unit = Calculo.unitTotalComMargem(item.subtotalComPerda, margemPct, item.maoDeObra, item.embalagem, item.frete);
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
    return Calculo.calcularDesconto(subtotal, parseNum(descontoValorInput.value), descontoTipoInput.value);
  }

  function somaItens() {
    return itens.reduce(function (total, item) { return total + item.itemTotal; }, 0);
  }

  // Usado tanto na lista de itens quanto no orçamento impresso. Retorna o
  // total já com desconto.
  function renderDesconto(subtotal, alvo) {
    var desconto = computeDesconto(subtotal);
    if (desconto > 0) {
      alvo.subtotal.textContent = fmt.format(subtotal);
      setDescontoLabel(alvo.label);
      alvo.valor.textContent = "-" + fmt.format(desconto);
    }
    alvo.breakdown.hidden = desconto <= 0;
    return subtotal - desconto;
  }

  function formatarTempo(tempoH) {
    var horasInt = Math.floor(tempoH);
    var minutosInt = Math.round((tempoH - horasInt) * 60);
    return horasInt + "h" + (minutosInt ? " " + minutosInt + "min" : "");
  }

  function criarSpan(className, texto) {
    var span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = texto;
    return span;
  }

  function criarLinhaItem(item, i) {
    var li = document.createElement("li");
    li.className = "calc-item-row";

    var info = criarSpan("calc-item-info", "");
    info.appendChild(criarSpan("", Calculo.nomeDoItem(item, i) + " × " + item.qtd));
    info.appendChild(criarSpan("calc-item-meta", item.pesoG.toFixed(1) + " g · " + formatarTempo(item.tempoH)));

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
    li.appendChild(criarSpan("calc-item-valor", fmt.format(item.itemTotal)));
    li.appendChild(removeBtn);
    return li;
  }

  function renderItens() {
    itensList.innerHTML = "";
    itens.forEach(function (item, i) {
      itensList.appendChild(criarLinhaItem(item, i));
    });

    var total = renderDesconto(somaItens(), {
      breakdown: descontoBreakdown,
      subtotal: itensSubtotalOut,
      label: descontoLabel,
      valor: descontoOut
    });
    itensTotalOut.textContent = fmt.format(total);
    itensBox.hidden = itens.length === 0;
  }

  [descontoValorInput, descontoTipoInput, descontoTextoInput].forEach(function (el) {
    el.addEventListener("input", renderItens);
  });

  function limparModelo() {
    modeloUpload.value = "";
    if (cargasModelo) cargasModelo.proximo();
    mostrarCarregandoModelo(false);
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
  }

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
    hardwareInput.value = "";
    limparModelo();
    calc();
    nome.focus();
  });

  clearBtn.addEventListener("click", function () {
    itens = [];
    descontoValorInput.value = "";
    descontoTipoInput.value = "pct";
    descontoTextoInput.value = "";
    renderItens();
  });

  function criarLinhaImpressao(item, i, cols) {
    var valores = {
      nome: Calculo.nomeDoItem(item, i),
      qtd: item.qtd,
      embalagem: fmt.format(item.embalagem),
      frete: fmt.format(item.frete),
      unit: fmt.format(item.unitTotal),
      subtotal: fmt.format(item.itemTotal)
    };
    var tr = document.createElement("tr");
    cols.forEach(function (col) {
      var td = document.createElement("td");
      td.textContent = valores[col];
      tr.appendChild(td);
    });
    return tr;
  }

  pdfBtn.addEventListener("click", function () {
    if (!itens.length) return;

    // Colunas de Embalagem/Frete só aparecem no orçamento impresso se algum
    // item do orçamento de fato usa esses valores. Evita poluir a tabela
    // com colunas zeradas.
    var temEmbalagem = itens.some(function (item) { return item.embalagem > 0; });
    var temFrete = itens.some(function (item) { return item.frete > 0; });
    printThEmbalagem.hidden = !temEmbalagem;
    printThFrete.hidden = !temFrete;

    var cols = ["nome", "qtd"];
    if (temEmbalagem) cols.push("embalagem");
    if (temFrete) cols.push("frete");
    cols.push("unit", "subtotal");

    printBody.innerHTML = "";
    itens.forEach(function (item, i) {
      printBody.appendChild(criarLinhaImpressao(item, i, cols));
    });

    var total = renderDesconto(somaItens(), {
      breakdown: printDescontoBreakdown,
      subtotal: printSubtotalOut,
      label: printDescontoLabel,
      valor: printDescontoOut
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
    if (!itens.length) return;
    var blob = new Blob(["\ufeff" + Calculo.gerarCsv(itens)], { type: "text/csv;charset=utf-8;" });
    ModelParser.baixarBlob(blob, "orcamento.csv");
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
  function positivoOuNada(valor) {
    return Number(valor) > 0 ? valor : null;
  }

  // Valores que tendem a se repetir de peça pra peça (tarifa de energia,
  // valor da hora etc.) ficam salvos e pré-preenchidos na próxima visita,
  // em vez de sempre voltar ao padrão do _config.yml.
  var PERSISTED_FIELDS = [
    { input: filamento, key: "orcamentoCalc:filamento" },
    { input: valorHoraInput, key: "orcamentoCalc:valorHora", fallback: d.horaTrabalho },
    { input: potenciaInput, key: "orcamentoCalc:potencia", fallback: d.potenciaW },
    { input: tarifaInput, key: "orcamentoCalc:tarifa", fallback: d.tarifaKwh },
    { input: margemInput, key: "orcamentoCalc:margem", fallback: d.margemPct },
    { input: perdaInput, key: "orcamentoCalc:perda", fallback: d.perdaPct },
    { input: desgasteInput, key: "orcamentoCalc:desgaste", fallback: d.desgaste },
    { input: valorMaquinaInput, key: "orcamentoCalc:valorMaquina", fallback: positivoOuNada(d.valorMaquina) },
    { input: vidaUtilInput, key: "orcamentoCalc:vidaUtil", fallback: positivoOuNada(d.vidaUtilH) },
    { input: embalagemInput, key: "orcamentoCalc:embalagem" },
    { input: freteInput, key: "orcamentoCalc:frete" }
  ];

  // Defaults do _config.yml chegam como float JS (ponto decimal, ex.: "0.8"),
  // mas os campos são lidos com parseNumeroPtBr (vírgula decimal). Sem essa
  // conversão o "0.8" seria lido como 8.
  function paraPtBr(valor) {
    return String(valor).replace(".", ",");
  }

  function valorPersistido(campo) {
    var salvo = lsGet(campo.key);
    if (salvo != null) return salvo;
    return campo.fallback != null && campo.fallback !== "" ? paraPtBr(campo.fallback) : "";
  }

  function initPersistedFields() {
    PERSISTED_FIELDS.forEach(function (campo) {
      campo.input.value = valorPersistido(campo);
      campo.input.addEventListener("input", function () {
        lsSet(campo.key, campo.input.value);
      });
    });
  }

  initPersistedFields();

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
  var lastMeshStats = null;
  var cargasModelo = ToolUtils ? ToolUtils.criarSequenciador() : null;
  var perfilDoArquivo = null;

  function densidadeAtual() {
    if (perfilDoArquivo) return perfilDoArquivo.densidade;
    if (materialSelect.value === "outro") {
      return parseMedida(densidadeInput.value);
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

    var estimativa = Calculo.estimarPesoETempo({
      volumeMm3: lastMeshStats.volumeMm3,
      areaMm2: lastMeshStats.areaMm2,
      alturaModeloMm: lastMeshStats.bbox.maxZ - lastMeshStats.bbox.minZ,
      densidade: densidade,
      infillPct: infillPct,
      paredes: paredes,
      larguraExtrusao: parseFloat(d.larguraExtrusaoMm) || 0.4,
      alturaCamada: parseMedida(alturaCamadaInput.value) || parseFloat(d.alturaCamadaMm) || 0.2,
      velocidade: parseMedida(velocidadeInput.value) || parseFloat(d.velocidadeMmS) || 50,
      overheadPorCamada: parseFloat(d.overheadCamadaS) || 2
    });

    peso.value = estimativa.pesoG.toFixed(1);
    horas.value = estimativa.horas;
    minutos.value = estimativa.minutos;
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
    if (triangleCount > ToolUtils.MAX_TRIANGULOS) {
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
      // partida quando disponível, mas continua editável: o usuário pode
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
    // infill, paredes, altura de camada ou velocidade antes de fechar:
    // fechar automaticamente escondia esses campos logo após o cálculo.
    // O botão "Concluir" deixa esse fechamento explícito.
    modeloConcluirWrap.hidden = false;

    aplicarEstimativas();
  }

  var modeloModalDialog = modeloModal.querySelector(".calc-modal");
  var modeloUltimoFoco = null;

  function focaveisDoModal() {
    return Array.prototype.slice.call(
      modeloModalDialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) { return el.offsetParent !== null; });
  }

  function abrirModeloModal() {
    modeloUltimoFoco = document.activeElement;
    modeloModal.hidden = false;
    modeloFecharBtn.focus();
  }

  function fecharModeloModal() {
    modeloModal.hidden = true;
    if (modeloUltimoFoco && typeof modeloUltimoFoco.focus === "function") {
      modeloUltimoFoco.focus();
    }
    modeloUltimoFoco = null;
  }

  modeloAbrirBtn.addEventListener("click", abrirModeloModal);
  modeloEditarBtn.addEventListener("click", abrirModeloModal);
  modeloFecharBtn.addEventListener("click", fecharModeloModal);
  modeloModal.addEventListener("click", function (e) {
    if (e.target === modeloModal) fecharModeloModal();
  });
  document.addEventListener("keydown", function (e) {
    if (modeloModal.hidden) return;
    if (e.key === "Escape") {
      fecharModeloModal();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trap: mantém o Tab circulando dentro do modal enquanto aberto.
    var focaveis = focaveisDoModal();
    if (!focaveis.length) return;
    var primeiro = focaveis[0];
    var ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  });

  modeloRemoverBtn.addEventListener("click", function () {
    limparModelo();

    // Peso/tempo vieram do modelo removido. Sem ele deixam de fazer
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

    if (!ModelParser || !cargasModelo) {
      mostrarErroModelo("Não foi possível carregar o leitor de modelos 3D. Recarregue a página e tente novamente.");
      return;
    }
    if (file.size > MODELO_MAX_BYTES) {
      mostrarErroModelo("Arquivo muito grande (máx. 60MB).");
      return;
    }

    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext !== "stl" && ext !== "3mf") {
      mostrarErroModelo("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      return;
    }

    var id = cargasModelo.proximo();
    mostrarCarregandoModelo(true);

    var leitura = ext === "stl" ? lerStatsSTL(file) : lerStats3MF(file);
    leitura
      .then(function (r) {
        if (cargasModelo.ehAtual(id)) processarStats(r.stats, file.name, r.perfil);
      })
      .catch(function () {
        if (cargasModelo.ehAtual(id)) mostrarErroModelo("Não foi possível ler esse arquivo " + ext.toUpperCase() + ".");
      })
      .then(function () {
        if (cargasModelo.ehAtual(id)) mostrarCarregandoModelo(false);
      });
  }

  function lerStatsSTL(file) {
    return file.arrayBuffer().then(function (buffer) {
      var triangulos = ModelParser.parseSTL(buffer);
      var stats = triangulos.length
        ? {
          triangleCount: triangulos.length,
          bbox: ModelParser.computeBoundingBox(triangulos),
          volumeMm3: ModelParser.computeMeshVolumeMm3(triangulos),
          areaMm2: ModelParser.computeMeshAreaMm2(triangulos)
        }
        : { triangleCount: 0, bbox: ModelParser.bboxVazio(), volumeMm3: 0, areaMm2: 0 };
      return { stats: stats, perfil: null };
    });
  }

  function lerStats3MF(file) {
    return ToolUtils.lerPacote3MF(file).then(function (pacote) {
      if (!pacote.modelText) throw new Error("modelo não encontrado no 3MF");
      var perfil = pacote.configText ? ModelParser.parse3MFPerfil(pacote.configText) : null;
      return ModelParser.parse3MFPackage(pacote.zip, pacote.modelText, pacote.modelSettingsText).then(function (stats) {
        return { stats: stats, perfil: perfil };
      });
    });
  }

  if (ToolUtils) ToolUtils.ligarDropzone(modeloDropzone, modeloUpload, processarArquivoModelo);

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

})();

