// ---------------------------------------------------------------------------
// Fórmula de custo compartilhada entre a calculadora simples (home.js) e a
// calculadora completa (orcamento.js): filamento + energia + desgaste.
// Precisa ser carregado antes dos dois.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

window.Wisky3D.formatarMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

window.Wisky3D.parseNumeroPtBr = function (value) {
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
  var partes = str.split(".");
  if (partes.length > 1 && partes[partes.length - 1].length !== 3) {
    var decimal = partes.pop();
    return parseFloat(partes.join("") + "." + decimal);
  }
  return parseFloat(str.replace(/\./g, ""));
};

// pesoG, horas, filamentoKg, potenciaW, tarifaKwh, desgaste (custo fixo de desgaste da impressora)
window.Wisky3D.calcularSubtotalBase = function (params) {
  var custoFilamento = (params.pesoG / 1000) * params.filamentoKg;
  var energia = (params.potenciaW * params.horas / 1000) * params.tarifaKwh;
  var desgaste = params.desgaste;
  return {
    custoFilamento: custoFilamento,
    energia: energia,
    desgaste: desgaste,
    subtotal: custoFilamento + energia + desgaste
  };
};
