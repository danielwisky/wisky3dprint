// ---------------------------------------------------------------------------
// Cálculos da calculadora de orçamento (quote.js), sem acesso ao DOM:
// custo do item, desgaste, desconto, estimativa de peso/tempo a partir da
// malha e geração do CSV. Depende de price-formula.js (calcularSubtotalBase).
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

(function () {
  // Se valor da máquina + vida útil forem informados, o desgaste é
  // proporcional ao tempo de impressão (valor/vida útil × horas); senão
  // cai no valor fixo por impressão.
  function calcularDesgaste(p) {
    if (isFinite(p.valorMaquina) && p.valorMaquina > 0 && isFinite(p.vidaUtilH) && p.vidaUtilH > 0) {
      return (p.valorMaquina / p.vidaUtilH) * p.horas;
    }
    return isFinite(p.desgasteFixo) ? p.desgasteFixo : p.desgastePadrao;
  }

  function unitTotalComMargem(subtotalComPerda, margemPct, maoDeObra, embalagem, frete) {
    return subtotalComPerda + subtotalComPerda * (margemPct / 100) + maoDeObra + embalagem + frete;
  }

  // A perda/retrabalho é aplicada sobre o subtotal (filamento + energia +
  // desgaste + hardware): equivale a reimprimir essa fração das peças do
  // item. Embalagem e frete são valores de repasse: entram só no total
  // final, sem incidência de perda nem de margem de lucro.
  function calcularItem(e) {
    var maoDeObra = e.horasManuais * e.valorHora;

    if (!isFinite(e.pesoG) || e.pesoG <= 0 || e.horas <= 0 || !isFinite(e.filamentoKg) || e.filamentoKg <= 0 || maoDeObra < 0 || e.margemPct < 0 || e.perdaPct < 0) {
      return null;
    }

    var base = window.Wisky3D.calcularSubtotalBase({
      pesoG: e.pesoG,
      horas: e.horas,
      filamentoKg: e.filamentoKg,
      potenciaW: e.potenciaW,
      tarifaKwh: e.tarifaKwh,
      desgaste: e.desgaste
    });
    var subtotal = base.subtotal + e.hardware;
    var perda = subtotal * (e.perdaPct / 100);
    var subtotalComPerda = subtotal + perda;
    var unitTotal = unitTotalComMargem(subtotalComPerda, e.margemPct, maoDeObra, e.embalagem, e.frete);

    return {
      nome: e.nome,
      qtd: e.qtd,
      pesoG: e.pesoG,
      tempoH: e.horas,
      custoFilamento: base.custoFilamento,
      energia: base.energia,
      desgaste: base.desgaste,
      hardware: e.hardware,
      embalagem: e.embalagem,
      frete: e.frete,
      subtotal: subtotal,
      perda: perda,
      perdaPct: e.perdaPct,
      margem: subtotalComPerda * (e.margemPct / 100),
      margemPct: e.margemPct,
      horasManuais: e.horasManuais,
      valorHora: e.valorHora,
      maoDeObra: maoDeObra,
      subtotalComPerda: subtotalComPerda,
      unitTotal: unitTotal,
      itemTotal: unitTotal * e.qtd
    };
  }

  // tipo "pct" aplica percentual; qualquer outro valor é desconto em reais.
  // Nunca passa do subtotal.
  function calcularDesconto(subtotal, valor, tipo) {
    if (!isFinite(valor) || valor <= 0) return 0;
    var desconto = tipo === "pct" ? subtotal * (valor / 100) : valor;
    return Math.min(desconto, subtotal);
  }

  // Volume "real" de material: a peça não é só infill uniforme, as paredes
  // (perímetros sólidos) ficam por cima do infill e, em modelos com muitas
  // peças pequenas/finas, costumam pesar mais que o miolo. Aproxima a casca
  // como área de superfície × espessura de parede (nº de paredes × largura
  // de extrusão) e trata só o volume restante (o "miolo") como preenchido
  // a infill_pct.
  function estimarPesoETempo(p) {
    var espessuraParede = p.paredes * p.larguraExtrusao;
    var volumeCascaMm3 = Math.min(p.areaMm2 * espessuraParede, p.volumeMm3);
    var volumeMioloMm3 = p.volumeMm3 - volumeCascaMm3;
    var volumeMaterialMm3 = volumeCascaMm3 + volumeMioloMm3 * (p.infillPct / 100);

    var nCamadas = Math.ceil(p.alturaModeloMm / p.alturaCamada);
    var vazaoMm3S = p.velocidade * p.alturaCamada * p.larguraExtrusao;
    var tempoTotalMin = vazaoMm3S > 0
      ? (volumeMaterialMm3 / vazaoMm3S + nCamadas * p.overheadPorCamada) / 60
      : 0;

    // Arredonda o total antes de separar em horas/minutos. Arredondar cada
    // parte isoladamente pode gerar "60min" (ex.: 179.6min viraria 2h 60min).
    var tempoTotalMinArred = Math.round(tempoTotalMin);
    return {
      pesoG: (volumeMaterialMm3 / 1000) * p.densidade,
      horas: Math.floor(tempoTotalMinArred / 60),
      minutos: tempoTotalMinArred % 60
    };
  }

  function nomeDoItem(item, i) {
    return item.nome || "Peça " + (i + 1);
  }

  function csvNum(n) {
    return n.toFixed(2).replace(".", ",");
  }

  function csvField(value) {
    var str = String(value);
    return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  var CSV_CABECALHO = [
    "Peça", "Quantidade", "Filamento", "Energia", "Desgaste da máquina",
    "Peças e insumos", "Subtotal", "Perda (%)", "Perda",
    "Margem (%)", "Margem", "Horas manuais", "Valor da hora", "Mão de obra",
    "Embalagem", "Frete", "Valor unitário", "Valor total"
  ];

  function gerarCsv(itens) {
    var total = 0;
    var linhas = [CSV_CABECALHO];

    itens.forEach(function (item, i) {
      total += item.itemTotal;
      linhas.push([nomeDoItem(item, i), item.qtd].concat([
        item.custoFilamento, item.energia, item.desgaste, item.hardware,
        item.subtotal, item.perdaPct, item.perda, item.margemPct, item.margem,
        item.horasManuais, item.valorHora, item.maoDeObra, item.embalagem,
        item.frete, item.unitTotal, item.itemTotal
      ].map(csvNum)));
    });

    var linhaTotal = CSV_CABECALHO.map(function () { return ""; });
    linhaTotal[0] = "Total geral";
    linhaTotal[linhaTotal.length - 1] = csvNum(total);
    linhas.push(linhaTotal);

    return linhas.map(function (linha) {
      return linha.map(csvField).join(";");
    }).join("\r\n");
  }

  window.Wisky3D.OrcamentoCalculo = {
    calcularDesgaste: calcularDesgaste,
    unitTotalComMargem: unitTotalComMargem,
    calcularItem: calcularItem,
    calcularDesconto: calcularDesconto,
    estimarPesoETempo: estimarPesoETempo,
    nomeDoItem: nomeDoItem,
    gerarCsv: gerarCsv
  };
})();
