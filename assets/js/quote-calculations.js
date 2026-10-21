// ---------------------------------------------------------------------------
// Cálculos da calculadora de orçamento (quote.js), sem acesso ao DOM:
// custo do item, desgaste, desconto, estimativa de peso/tempo a partir da
// malha e geração do CSV. Depende de price-formula.js (calculateBaseSubtotal).
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

(function () {
  // Se valor da máquina + vida útil forem informados, o desgaste é
  // proporcional ao tempo de impressão (valor/vida útil × horas); senão
  // cai no desgaste fixo por impressão informado ou, sem ele, no padrão do
  // _config.yml.
  function calculateWear(p) {
    if (isFinite(p.machineValue) && p.machineValue > 0 && isFinite(p.lifespanH) && p.lifespanH > 0) {
      return (p.machineValue / p.lifespanH) * p.hours;
    }
    return isFinite(p.fixedWear) ? p.fixedWear : p.defaultWear;
  }

  function marginValue(subtotalWithLoss, marginPct) {
    return subtotalWithLoss * (marginPct / 100);
  }

  function unitTotalWithMargin(subtotalWithLoss, marginPct, labor, packaging, shipping) {
    return subtotalWithLoss + marginValue(subtotalWithLoss, marginPct) + labor + packaging + shipping;
  }

  // A perda/retrabalho é aplicada sobre o subtotal (filamento + energia +
  // desgaste + hardware): equivale a reimprimir essa fração das peças do
  // item. Embalagem e frete são valores de repasse: entram só no total
  // final, sem incidência de perda nem de margem de lucro.
  function calculateItem(e) {
    const labor = e.manualHours * e.hourlyRate;

    if (
      !isFinite(e.weightG) ||
      e.weightG <= 0 ||
      e.hours <= 0 ||
      !isFinite(e.filamentPricePerKg) ||
      e.filamentPricePerKg <= 0 ||
      labor < 0 ||
      e.marginPct < 0 ||
      e.lossPct < 0
    ) {
      return null;
    }

    const base = window.Wisky3D.calculateBaseSubtotal({
      weightG: e.weightG,
      hours: e.hours,
      filamentPricePerKg: e.filamentPricePerKg,
      powerW: e.powerW,
      kwhRate: e.kwhRate,
      wear: e.wear
    });
    const subtotal = base.subtotal + e.hardware;
    const loss = subtotal * (e.lossPct / 100);
    const subtotalWithLoss = subtotal + loss;
    const unitTotal = unitTotalWithMargin(subtotalWithLoss, e.marginPct, labor, e.packaging, e.shipping);

    return {
      name: e.name,
      quantity: e.quantity,
      weightG: e.weightG,
      timeH: e.hours,
      filamentCost: base.filamentCost,
      energy: base.energy,
      wear: base.wear,
      hardware: e.hardware,
      packaging: e.packaging,
      shipping: e.shipping,
      subtotal: subtotal,
      loss: loss,
      lossPct: e.lossPct,
      margin: marginValue(subtotalWithLoss, e.marginPct),
      marginPct: e.marginPct,
      manualHours: e.manualHours,
      hourlyRate: e.hourlyRate,
      labor: labor,
      subtotalWithLoss: subtotalWithLoss,
      unitTotal: unitTotal,
      itemTotal: unitTotal * e.quantity
    };
  }

  // type "pct" aplica percentual; qualquer outro valor é desconto em reais.
  // Nunca passa do subtotal.
  function calculateDiscount(subtotal, value, type) {
    if (!isFinite(value) || value <= 0) return 0;
    const discount = type === "pct" ? subtotal * (value / 100) : value;
    return Math.min(discount, subtotal);
  }

  // Volume "real" de material: a peça não é só infill uniforme, as paredes
  // (perímetros sólidos) ficam por cima do infill e, em modelos com muitas
  // peças pequenas/finas, costumam pesar mais que o miolo. Aproxima a casca
  // como área de superfície × espessura de parede (nº de paredes × largura
  // de extrusão) e trata só o volume restante (o "miolo") como preenchido
  // a infillPct.
  function estimateWeightAndTime(p) {
    const wallThickness = p.walls * p.extrusionWidth;
    const shellVolumeMm3 = Math.min(p.areaMm2 * wallThickness, p.volumeMm3);
    const coreVolumeMm3 = p.volumeMm3 - shellVolumeMm3;
    const materialVolumeMm3 = shellVolumeMm3 + coreVolumeMm3 * (p.infillPct / 100);

    const layerCount = Math.ceil(p.modelHeightMm / p.layerHeight);
    const flowMm3S = p.speed * p.layerHeight * p.extrusionWidth;
    const totalMin = flowMm3S > 0 ? (materialVolumeMm3 / flowMm3S + layerCount * p.overheadPerLayer) / 60 : 0;

    // Arredonda o total antes de separar em horas/minutos. Arredondar cada
    // parte isoladamente pode gerar "60min" (ex.: 179.6min viraria 2h 60min).
    const roundedTotalMin = Math.round(totalMin);
    return {
      weightG: (materialVolumeMm3 / 1000) * p.density,
      hours: Math.floor(roundedTotalMin / 60),
      minutes: roundedTotalMin % 60
    };
  }

  // Arredonda o total de minutos antes de separar em horas/minutos, pelo
  // mesmo motivo de estimateWeightAndTime: evita "1h 60min".
  function formatDuration(hours) {
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return h + "h" + (min ? " " + min + "min" : "");
  }

  function itemName(item, i) {
    return item.name || "Peça " + (i + 1);
  }

  function csvNum(n) {
    return n.toFixed(2).replace(".", ",");
  }

  function csvField(value) {
    const str = String(value);
    return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  const CSV_HEADER = [
    "Peça",
    "Quantidade",
    "Filamento",
    "Energia",
    "Desgaste da máquina",
    "Peças e insumos",
    "Subtotal",
    "Perda (%)",
    "Perda",
    "Margem (%)",
    "Margem",
    "Horas manuais",
    "Valor da hora",
    "Mão de obra",
    "Embalagem",
    "Frete",
    "Valor unitário",
    "Valor total"
  ];

  function generateCsv(items) {
    let total = 0;
    const lines = [CSV_HEADER];

    items.forEach(function (item, i) {
      total += item.itemTotal;
      lines.push(
        [itemName(item, i), item.quantity].concat(
          [
            item.filamentCost,
            item.energy,
            item.wear,
            item.hardware,
            item.subtotal,
            item.lossPct,
            item.loss,
            item.marginPct,
            item.margin,
            item.manualHours,
            item.hourlyRate,
            item.labor,
            item.packaging,
            item.shipping,
            item.unitTotal,
            item.itemTotal
          ].map(csvNum)
        )
      );
    });

    const totalLine = CSV_HEADER.map(function () {
      return "";
    });
    totalLine[0] = "Total geral";
    totalLine[totalLine.length - 1] = csvNum(total);
    lines.push(totalLine);

    return lines
      .map(function (line) {
        return line.map(csvField).join(";");
      })
      .join("\r\n");
  }

  window.Wisky3D.QuoteCalculations = {
    calculateWear: calculateWear,
    unitTotalWithMargin: unitTotalWithMargin,
    calculateItem: calculateItem,
    calculateDiscount: calculateDiscount,
    estimateWeightAndTime: estimateWeightAndTime,
    formatDuration: formatDuration,
    itemName: itemName,
    generateCsv: generateCsv
  };
})();
