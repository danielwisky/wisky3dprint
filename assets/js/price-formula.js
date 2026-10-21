// ---------------------------------------------------------------------------
// Fórmula de custo compartilhada entre a calculadora simples (home.js) e a
// calculadora completa (quote.js): filamento + energia + desgaste.
// Precisa ser carregado antes dos dois.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

window.Wisky3D.currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

window.Wisky3D.parsePtBrNumber = function (value) {
  var str = String(value).trim();

  if (str.indexOf(",") !== -1) {
    // Vírgula presente: formato pt-BR completo (ponto é separador de
    // milhar, vírgula é decimal). Remove os pontos antes de trocar a
    // vírgula, senão "3.000,50" vira "3,50".
    return parseFloat(str.replace(/\./g, "").replace(",", "."));
  }

  // Sem vírgula: o ponto é ambíguo (milhar em pt-BR ou decimal em
  // formato internacional, ex.: campo type="number" ou autofill via
  // toFixed()). Um grupo de milhar sempre tem exatamente 3 dígitos após
  // o ponto ("3.000"); se o último grupo tiver 1 ou 2 dígitos ("174.9"),
  // é decimal, não milhar.
  var parts = str.split(".");
  if (parts.length > 1 && parts[parts.length - 1].length !== 3) {
    var decimal = parts.pop();
    return parseFloat(parts.join("") + "." + decimal);
  }
  return parseFloat(str.replace(/\./g, ""));
};

// Para campos de medida (densidade g/cm³, altura de camada mm, velocidade
// mm/s): nunca precisam de separador de milhar, então um "." sem vírgula é
// sempre decimal. Evita o caso ambíguo de parsePtBrNumber onde um decimal de
// 3 casas (ex.: densidade "1.250") seria lido como milhar (1250).
window.Wisky3D.parsePtBrMeasure = function (value) {
  var str = String(value).trim();
  if (str.indexOf(",") !== -1) {
    return parseFloat(str.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(str);
};

// weightG, hours, filamentPricePerKg, powerW, kwhRate, wear (custo fixo de desgaste da impressora)
window.Wisky3D.calculateBaseSubtotal = function (params) {
  var filamentCost = (params.weightG / 1000) * params.filamentPricePerKg;
  var energy = (params.powerW * params.hours / 1000) * params.kwhRate;
  var wear = params.wear;
  return {
    filamentCost: filamentCost,
    energy: energy,
    wear: wear,
    subtotal: filamentCost + energy + wear
  };
};
