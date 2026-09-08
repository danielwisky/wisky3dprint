// ---------------------------------------------------------------------------
// Fórmula de custo compartilhada entre a calculadora simples (home.js) e a
// calculadora completa (orcamento.js): filamento + energia + desgaste.
// Precisa ser carregado antes dos dois.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

window.Wisky3D.formatarMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

window.Wisky3D.parseNumeroPtBr = function (value) {
  return parseFloat(String(value).replace(",", "."));
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
