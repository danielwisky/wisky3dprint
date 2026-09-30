// ---------------------------------------------------------------------------
// BLOCO: Conectores/pinos de encaixe entre peças cortadas (Split 3MF, Task 15)
// ---------------------------------------------------------------------------
// Depois de um corte por plano (mesh-clip.js / split-3mf.js), gera um pino
// cilíndrico saliente numa peça (CSG ADDITION) e o furo correspondente, com
// folga, na outra (CSG SUBTRACTION), usando three-bvh-csg.
//
// ES module, mas SEM import estático: Three.js/three-bvh-csg são carregados
// sob demanda (import() dinâmico, entradas "three"/"three-bvh-csg" do
// importmap de split-3mf.html) só quando um conector é de fato pedido, ou
// injetados via `opcoes.libs` (testes em Node: lá o "main" do pacote
// three-bvh-csg é um UMD CommonJS que puxaria uma segunda cópia do Three.js,
// então o teste importa o src/ ESM direto e injeta aqui). Assim toda a parte
// pura (validação de manifold, ponto de ancoragem, cabimento do pino,
// conversão de geometria) roda em Node sem Three.js nenhum.
//
// ModelParser (model-parser.js, script clássico) vem de window.Wisky3D, como
// no resto do site.
//
// Limitação real do timeout: o CSG do three-bvh-csg é síncrono. Um
// Promise.race com setTimeout NÃO interrompe uma operação que já começou —
// o timer só consegue disparar entre uma etapa e outra (ver
// executarComTimeout). A proteção serve pra não emendar a segunda operação
// quando a primeira já estourou o prazo, e pra não aplicar um resultado
// atrasado; travar de verdade só seria evitável rodando o CSG num Web Worker.
// ---------------------------------------------------------------------------

// Mesma grade de solda das peças do Split 3MF (split-3mf.js FATOR_SOLDA): as
// peças já chegam soldadas nela, então requantizar na mesma grade preserva a
// indexação exatamente.
const FATOR_SOLDA_PECAS = 1e5;

// Distância máxima (mm) ao plano pra um vértice contar como "na tampa". Os
// pontos de corte saem do plano só por ruído de ponto flutuante (~1e-12, ver
// interpolarNaAresta em mesh-clip.js); 1e-5 é a mesma escala da solda.
const TOL_PLANO_MM = 1e-5;

// Parede mínima (mm) que precisa sobrar em volta do furo e além da ponta do
// pino/fundo do furo (~2 perímetros com bico de 0,4 mm).
const PAREDE_MINIMA_MM = 0.8;

// Comprimento mínimo (mm) da parte saliente do pino pra valer a pena.
const SALIENCIA_MINIMA_MM = 1;

const SEGMENTOS_PADRAO = 32;
const TIMEOUT_PADRAO_MS = 8000;

// Cor do pino e da parede do furo: mesmo cinza da tampa do corte
// (MeshClip.COR_TAMPA_PADRAO), já que ambos são superfície "nova".
const COR_CONECTOR_PADRAO = [176, 176, 190];

function obterModelParser() {
  const ns = globalThis.Wisky3D;
  const mp = ns && ns.ModelParser;
  if (!mp) throw new Error("ModelParser (model-parser.js) não carregado.");
  return mp;
}

// ---------------------------------------------------------------------------
// Vetores
// ---------------------------------------------------------------------------

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function escalar(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function somar(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function norma(a) { return Math.sqrt(dot(a, a)); }
function normalizar(a) {
  const n = norma(a);
  return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}

function distanciaAoPlano(p, plano) {
  return dot(sub(p, plano.ponto), plano.normal);
}

function projetarNoPlano(p, plano) {
  return sub(p, escalar(plano.normal, distanciaAoPlano(p, plano)));
}

function planoNormalizado(plano) {
  return { ponto: plano.ponto, normal: normalizar(plano.normal) };
}

// ---------------------------------------------------------------------------
// Manifold
// ---------------------------------------------------------------------------

// `adjacency`: o resultado de ModelParser.buildAdjacencyAndExportIndex
// chamado com { contarArestas: true } (ou direto o Map `triangulosPorAresta`
// dele). `exportVertices`: os vértices soldados do mesmo resultado, usados só
// pra validar que as arestas apontam pra vértices existentes (aresta com
// índice fora do intervalo conta como não-manifold). Malha fechada (2-manifold)
// = toda aresta usada por exatamente 2 triângulos; 1 = borda de furo; 3+ =
// não-manifold.
function validarManifold(adjacency, exportVertices) {
  const mapa = adjacency instanceof Map ? adjacency : adjacency && adjacency.triangulosPorAresta;
  if (!(mapa instanceof Map)) {
    throw new Error("validarManifold precisa da contagem de triângulos por aresta (buildAdjacencyAndExportIndex com { contarArestas: true }).");
  }
  const totalVertices = exportVertices ? exportVertices.length : Infinity;
  let furos = 0;
  let naoManifold = 0;
  mapa.forEach(function (contagem, chave) {
    const partes = chave.split("_");
    const a = Number(partes[0]), b = Number(partes[1]);
    if (!(a < totalVertices && b < totalVertices)) {
      naoManifold++;
      return;
    }
    if (contagem === 1) furos++;
    else if (contagem >= 3) naoManifold++;
  });
  return { furos: furos, naoManifold: naoManifold };
}

// Peça indexada ({vertices, triangulos:[{v1,v2,v3}]}) -> Float64Array plano
// (formato de buildAdjacencyAndExportIndex). Float64 aqui: as peças guardam
// coordenadas em double e a solda na grade de 1e-5 mm depende delas.
function positionsDaPeca(peca) {
  const n = peca.triangulos.length;
  const positions = new Float64Array(n * 9);
  for (let i = 0; i < n; i++) {
    const t = peca.triangulos[i];
    const cantos = [peca.vertices[t.v1], peca.vertices[t.v2], peca.vertices[t.v3]];
    for (let c = 0; c < 3; c++) {
      positions[i * 9 + c * 3] = cantos[c][0];
      positions[i * 9 + c * 3 + 1] = cantos[c][1];
      positions[i * 9 + c * 3 + 2] = cantos[c][2];
    }
  }
  return positions;
}

// Recalcula adjacência/contagem de arestas da peça do zero (ruling da
// Task 14/15 no ledger: nada disso é guardado em state.pecas) e valida.
function diagnosticarManifoldDaPeca(peca) {
  const ModelParser = obterModelParser();
  const indice = ModelParser.buildAdjacencyAndExportIndex(positionsDaPeca(peca), peca.triangulos.length, {
    fatorQuantizacao: FATOR_SOLDA_PECAS,
    contarArestas: true
  });
  return validarManifold(indice, indice.exportVertices);
}

// Mesma validação, pra uma geometria em "soup" (array plano triCount*9,
// ex.: o position de uma BufferGeometry não-indexada saída do CSG).
function diagnosticarManifoldDeSoup(positions, triCount) {
  const ModelParser = obterModelParser();
  const indice = ModelParser.buildAdjacencyAndExportIndex(positions, triCount, {
    fatorQuantizacao: FATOR_SOLDA_PECAS,
    contarArestas: true
  });
  return validarManifold(indice, indice.exportVertices);
}

// ---------------------------------------------------------------------------
// Seção de corte (tampa) e ponto de ancoragem
// ---------------------------------------------------------------------------

// Triângulos da peça com os 3 vértices no plano (a tampa do corte, mais
// qualquer face original coplanar), com área > 0, e as arestas de borda
// dessa região (usadas por exatamente 1 triângulo da tampa, pelos índices
// soldados da peça).
function secaoNoPlano(peca, plano) {
  const pl = planoNormalizado(plano);
  const noPlano = peca.vertices.map(function (v) { return Math.abs(distanciaAoPlano(v, pl)) <= TOL_PLANO_MM; });
  const triangulos = [];
  const contagem = new Map();
  for (let i = 0; i < peca.triangulos.length; i++) {
    const t = peca.triangulos[i];
    if (!noPlano[t.v1] || !noPlano[t.v2] || !noPlano[t.v3]) continue;
    const a = peca.vertices[t.v1], b = peca.vertices[t.v2], c = peca.vertices[t.v3];
    const area = norma(cross(sub(b, a), sub(c, a))) / 2;
    if (!(area > 0)) continue;
    triangulos.push({ a: a, b: b, c: c, area: area });
    [[t.v1, t.v2], [t.v2, t.v3], [t.v3, t.v1]].forEach(function (e) {
      const chave = e[0] < e[1] ? e[0] + "_" + e[1] : e[1] + "_" + e[0];
      const atual = contagem.get(chave);
      contagem.set(chave, atual ? { n: atual.n + 1, a: atual.a, b: atual.b } : { n: 1, a: e[0], b: e[1] });
    });
  }
  const borda = [];
  contagem.forEach(function (info) {
    if (info.n === 1) borda.push([peca.vertices[info.a], peca.vertices[info.b]]);
  });
  return { triangulos: triangulos, borda: borda, plano: pl };
}

function pontoNoTriangulo(p, tri, normal) {
  const s1 = dot(cross(sub(tri.b, tri.a), sub(p, tri.a)), normal);
  const s2 = dot(cross(sub(tri.c, tri.b), sub(p, tri.b)), normal);
  const s3 = dot(cross(sub(tri.a, tri.c), sub(p, tri.c)), normal);
  const eps = -1e-12 * Math.max(1, tri.area);
  return (s1 >= eps && s2 >= eps && s3 >= eps) || (s1 <= -eps && s2 <= -eps && s3 <= -eps);
}

function distanciaPontoSegmento(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return norma(sub(p, somar(a, escalar(ab, t))));
}

// { dentro, distanciaAteBorda } do ponto (projetado no plano) em relação à
// seção de corte da peça.
function analisarPontoNaSecao(secao, ponto) {
  const p = projetarNoPlano(ponto, secao.plano);
  let dentro = false;
  for (let i = 0; i < secao.triangulos.length; i++) {
    if (pontoNoTriangulo(p, secao.triangulos[i], secao.plano.normal)) {
      dentro = true;
      break;
    }
  }
  let distancia = Infinity;
  for (let j = 0; j < secao.borda.length; j++) {
    const d = distanciaPontoSegmento(p, secao.borda[j][0], secao.borda[j][1]);
    if (d < distancia) distancia = d;
  }
  return { dentro: dentro, distanciaAteBorda: dentro ? distancia : 0 };
}

// Máximo de candidatos (centroides de triângulos da tampa, maiores
// primeiro) testados quando o centroide da área cai fora da seção.
const MAX_CANDIDATOS_ANCORAGEM = 2000;

// Ponto padrão pro conector: centroide (ponderado por área) da seção de
// corte da peça. Se ele cair fora da seção (seção em anel/"C", ex. tubo
// cortado), usa o centroide de triângulo da tampa mais longe da borda.
// Retorna { ponto, distanciaAteBorda } ou null se a peça não tem seção
// nesse plano.
function calcularPontoDeAncoragem(peca, plano) {
  const secao = secaoNoPlano(peca, plano);
  if (!secao.triangulos.length) return null;

  let areaTotal = 0;
  let acumulado = [0, 0, 0];
  secao.triangulos.forEach(function (t) {
    const centroide = escalar(somar(somar(t.a, t.b), t.c), 1 / 3);
    acumulado = somar(acumulado, escalar(centroide, t.area));
    areaTotal += t.area;
  });
  const centroideArea = escalar(acumulado, 1 / areaTotal);
  const analise = analisarPontoNaSecao(secao, centroideArea);
  if (analise.dentro) return { ponto: projetarNoPlano(centroideArea, secao.plano), distanciaAteBorda: analise.distanciaAteBorda };

  const candidatos = secao.triangulos.slice().sort(function (a, b) { return b.area - a.area; }).slice(0, MAX_CANDIDATOS_ANCORAGEM);
  let melhor = null;
  candidatos.forEach(function (t) {
    const c = escalar(somar(somar(t.a, t.b), t.c), 1 / 3);
    const r = analisarPontoNaSecao(secao, c);
    if (r.dentro && (!melhor || r.distanciaAteBorda > melhor.distanciaAteBorda)) {
      melhor = { ponto: projetarNoPlano(c, secao.plano), distanciaAteBorda: r.distanciaAteBorda };
    }
  });
  return melhor;
}

// Distância, a partir de `origem` na direção `direcao` (unitária), até o
// primeiro triângulo da peça atingido (Möller–Trumbore), ignorando acertos
// a menos de TOL_PLANO_MM (a própria tampa onde o raio nasce). Infinity se
// nada for atingido. Usada como espessura local da peça no eixo do pino.
function distanciaAteSuperficie(peca, origem, direcao) {
  let melhor = Infinity;
  for (let i = 0; i < peca.triangulos.length; i++) {
    const t = peca.triangulos[i];
    const a = peca.vertices[t.v1], b = peca.vertices[t.v2], c = peca.vertices[t.v3];
    const e1 = sub(b, a), e2 = sub(c, a);
    const pv = cross(direcao, e2);
    const det = dot(e1, pv);
    if (Math.abs(det) < 1e-18) continue;
    const inv = 1 / det;
    const tv = sub(origem, a);
    const u = dot(tv, pv) * inv;
    if (u < 0 || u > 1) continue;
    const qv = cross(tv, e1);
    const v = dot(direcao, qv) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = dot(e2, qv) * inv;
    if (dist > TOL_PLANO_MM && dist < melhor) melhor = dist;
  }
  return melhor;
}

// Espessura local da peça "embaixo" de um cilindro de raio `raio` com base
// em `ponto` (no plano) e eixo `direcao`: menor distanciaAteSuperficie entre
// o eixo e RAIOS_PERIMETRO pontos do contorno do cilindro. Pega faces
// inclinadas/curvas que o eixo sozinho não vê (o pino/furo furaria a
// lateral da peça). Ainda é amostragem, não garantia: um detalhe estreito
// entre dois raios amostrados pode passar.
const RAIOS_PERIMETRO = 12;
function espessuraNoCilindro(peca, ponto, direcao, raio) {
  const auxiliar = Math.abs(direcao[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalizar(cross(auxiliar, direcao));
  const w = cross(direcao, u);
  let menor = distanciaAteSuperficie(peca, ponto, direcao);
  for (let i = 0; i < RAIOS_PERIMETRO; i++) {
    const ang = (2 * Math.PI * i) / RAIOS_PERIMETRO;
    const origem = somar(ponto, somar(escalar(u, raio * Math.cos(ang)), escalar(w, raio * Math.sin(ang))));
    const d = distanciaAteSuperficie(peca, origem, direcao);
    if (d < menor) menor = d;
  }
  return menor;
}

// Lado da peça em relação ao plano: +1 se o volume dela fica do lado da
// normal, -1 se do lado oposto (média das distâncias dos vértices).
function ladoDaPeca(peca, plano) {
  let soma = 0;
  for (let i = 0; i < peca.vertices.length; i++) soma += distanciaAoPlano(peca.vertices[i], plano);
  return soma >= 0 ? 1 : -1;
}

// Decide as dimensões do conector e se ele cabe, sem CSG (puro):
//  - o ponto precisa estar dentro da seção de corte das duas peças, com
//    raio (peça do pino) e raio + folga + parede (peça do furo) até a borda;
//  - a saliência do pino (metade do cilindro, o resto fica embutido na peça
//    A) é min(diâmetro, espaço disponível): embutido cabe em A e o furo
//    (saliência + folga de fundo) cabe em B, ambos deixando PAREDE_MINIMA_MM.
//    A espessura é amostrada no eixo e em RAIOS_PERIMETRO pontos do
//    contorno (espessuraNoCilindro).
// Retorna { ok:true, ponto, saliencia, raioPino, raioFuro,
// profundidadeFuro } ou { ok:false, motivo }.
function planejarConector(pecaA, pecaB, plano, pontoDeAncoragem, diametroMm, folgaMm, opcoes) {
  const pl = planoNormalizado(plano);
  const raio = diametroMm / 2;
  if (!(raio > 0)) return { ok: false, motivo: "Diâmetro do pino inválido." };
  if (!(folgaMm >= 0)) return { ok: false, motivo: "Folga inválida." };

  const ponto = projetarNoPlano(pontoDeAncoragem, pl);
  const secaoA = analisarPontoNaSecao(secaoNoPlano(pecaA, pl), ponto);
  const secaoB = analisarPontoNaSecao(secaoNoPlano(pecaB, pl), ponto);
  if (!secaoA.dentro || !secaoB.dentro) {
    return { ok: false, motivo: "O ponto do conector está fora da seção de corte das peças." };
  }
  const raioFuro = raio + folgaMm;
  if (secaoA.distanciaAteBorda < raio + PAREDE_MINIMA_MM / 2 || secaoB.distanciaAteBorda < raioFuro + PAREDE_MINIMA_MM) {
    const maximo = Math.max(0, 2 * (Math.min(secaoA.distanciaAteBorda - PAREDE_MINIMA_MM / 2, secaoB.distanciaAteBorda - PAREDE_MINIMA_MM - folgaMm)));
    return {
      ok: false,
      motivo: "O conector não cabe na seção do corte nesse ponto (diâmetro máximo ≈ " + maximo.toFixed(1) + " mm com essa folga)."
    };
  }

  const ladoA = ladoDaPeca(pecaA, pl);
  const dirParaA = escalar(pl.normal, ladoA);
  const dirParaB = escalar(pl.normal, -ladoA);
  const espessuraA = espessuraNoCilindro(pecaA, ponto, dirParaA, raio);
  const espessuraB = espessuraNoCilindro(pecaB, ponto, dirParaB, raioFuro);
  const pedida = opcoes && opcoes.salienciaMm > 0 ? opcoes.salienciaMm : diametroMm;
  const saliencia = Math.min(pedida, espessuraA - PAREDE_MINIMA_MM, espessuraB - PAREDE_MINIMA_MM - folgaMm);
  if (!(saliencia >= SALIENCIA_MINIMA_MM)) {
    return { ok: false, motivo: "As peças são finas demais nesse ponto pra um pino (espessura insuficiente no eixo do conector)." };
  }

  return {
    ok: true,
    ponto: ponto,
    normal: pl.normal,
    dirParaB: dirParaB,
    saliencia: saliencia,
    raioPino: raio,
    raioFuro: raioFuro,
    profundidadeFuro: saliencia + folgaMm
  };
}

// ---------------------------------------------------------------------------
// Conversão peça <-> BufferGeometry (Three.js injetado)
// ---------------------------------------------------------------------------

// Float64Array que aceita um ArrayBuffer de tamanho não múltiplo de 8
// (usa só os elementos inteiros que cabem). Contorna um detalhe do
// three-bvh-csg 0.0.16: TypeBackedArray.setSize arredonda o buffer da saída
// pra múltiplo de 4 bytes (ceilToFourByteStride) e depois faz
// `new type(buffer)`, o que com Float64Array puro lança "byte length of
// Float64Array should be a multiple of 8". Com esta subclasse (o Evaluator
// usa `array.constructor` da entrada), o CSG inteiro roda em double.
class Float64ArrayCSG extends Float64Array {
  constructor(arg, byteOffset, length) {
    const ehBuffer = arg instanceof ArrayBuffer ||
      (typeof SharedArrayBuffer !== "undefined" && arg instanceof SharedArrayBuffer);
    if (ehBuffer) {
      const inicio = byteOffset || 0;
      super(arg, inicio, length !== undefined ? length : Math.floor((arg.byteLength - inicio) / 8));
    } else {
      super(arg);
    }
  }
}

// Float64 de propósito: o three-bvh-csg aloca a saída com o mesmo tipo de
// array da entrada (Evaluator: aAttr.array.constructor), então o CSG inteiro
// roda em double e os vértices originais da peça voltam bit a bit iguais.
// `origem` (opcional, [x,y,z]): subtraída de todo vértice (centralizar perto
// do conector diminui a magnitude das coordenadas nas contas do CSG).
function pecaParaBufferGeometry(THREE, peca, origem) {
  const o = origem || [0, 0, 0];
  const n = peca.triangulos.length;
  const positions = new Float64ArrayCSG(n * 9);
  const colors = new Float64ArrayCSG(n * 9);
  for (let i = 0; i < n; i++) {
    const t = peca.triangulos[i];
    const cantos = [peca.vertices[t.v1], peca.vertices[t.v2], peca.vertices[t.v3]];
    const cor = t.color || COR_CONECTOR_PADRAO;
    for (let c = 0; c < 3; c++) {
      const b = i * 9 + c * 3;
      positions[b] = cantos[c][0] - o[0]; positions[b + 1] = cantos[c][1] - o[1]; positions[b + 2] = cantos[c][2] - o[2];
      colors[b] = cor[0] / 255; colors[b + 1] = cor[1] / 255; colors[b + 2] = cor[2] / 255;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Cilindro fechado (prisma de `segmentos` lados) de raio `raio` e altura
// `altura`, eixo ao longo de `direcao` (unitária), com o centro da face "de
// baixo" em `base` — vai de `base` até `base + direcao*altura`. Montado à
// mão em Float64 (não com THREE.CylinderGeometry, que é Float32, ver
// Float64ArrayCSG): com Float32 os vértices do pino saíam até ~5e-7 mm fora
// da posição exata, o que
// deixa vértices "quase no plano" (entre o EPS de 1e-7 do mesh-clip.js e a
// solda de 1e-5 mm) e abre buracos num corte posterior que passe pelo eixo
// do pino. Não-indexado, só position + color (os atributos do Evaluator),
// winding anti-horário visto de fora (mesma convenção do 3MF/Three.js).
function criarCilindro(THREE, raio, altura, base, direcao, cor, segmentos) {
  const d = normalizar(direcao);
  const auxiliar = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalizar(cross(auxiliar, d));
  const w = cross(d, u); // (u, w, d) destro: u × w = d
  const topo = somar(base, escalar(d, altura));
  const baixo = [];
  const cima = [];
  for (let i = 0; i < segmentos; i++) {
    const ang = (2 * Math.PI * i) / segmentos;
    const radial = somar(escalar(u, raio * Math.cos(ang)), escalar(w, raio * Math.sin(ang)));
    baixo.push(somar(base, radial));
    cima.push(somar(topo, radial));
  }
  const tris = [];
  for (let i = 0; i < segmentos; i++) {
    const j = (i + 1) % segmentos;
    tris.push([baixo[i], baixo[j], cima[j]]);
    tris.push([baixo[i], cima[j], cima[i]]);
    tris.push([topo, cima[i], cima[j]]);
    tris.push([base, baixo[j], baixo[i]]);
  }
  const positions = new Float64ArrayCSG(tris.length * 9);
  const colors = new Float64ArrayCSG(tris.length * 9);
  for (let t = 0; t < tris.length; t++) {
    for (let c = 0; c < 3; c++) {
      const k = t * 9 + c * 3;
      positions[k] = tris[t][c][0]; positions[k + 1] = tris[t][c][1]; positions[k + 2] = tris[t][c][2];
      colors[k] = cor[0] / 255; colors[k + 1] = cor[1] / 255; colors[k + 2] = cor[2] / 255;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// BufferGeometry (indexada ou não, com position e, opcional, color 0..1)
// -> { triangulos: soup, cores: [r,g,b] 0-255 por triângulo } (entrada de
// criarPeca/soldarTriangulos em split-3mf.js). Cores iguais compartilham o
// mesmo array. A cor de cada triângulo é a do 1º canto (o CSG só interpola
// cor dentro de um triângulo original, que já é uniforme). `origem`
// (opcional) é somada de volta (inverso de pecaParaBufferGeometry).
function geometriaParaSoup(geometry, origem) {
  const o = origem || [0, 0, 0];
  const pos = geometry.getAttribute("position");
  const col = geometry.getAttribute("color");
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const triangulos = new Array(triCount);
  const cores = new Array(triCount);
  const corInterna = new Map();
  function canto(i) { return index ? index.getX(i) : i; }
  for (let t = 0; t < triCount; t++) {
    const tri = [];
    for (let c = 0; c < 3; c++) {
      const v = canto(t * 3 + c);
      tri.push([pos.getX(v) + o[0], pos.getY(v) + o[1], pos.getZ(v) + o[2]]);
    }
    triangulos[t] = tri;
    if (col) {
      const v0 = canto(t * 3);
      const r = Math.round(col.getX(v0) * 255), g = Math.round(col.getY(v0) * 255), b = Math.round(col.getZ(v0) * 255);
      const chave = r + "," + g + "," + b;
      let cor = corInterna.get(chave);
      if (!cor) {
        cor = [r, g, b];
        corInterna.set(chave, cor);
      }
      cores[t] = cor;
    }
  }
  return { triangulos: triangulos, cores: cores };
}

// ---------------------------------------------------------------------------
// Costura do resultado do CSG
// ---------------------------------------------------------------------------
// O three-bvh-csg divide cada triângulo das duas malhas pela interseção de
// forma independente, então ao longo da curva pino/peça (e furo/peça) um
// lado costuma ter uma aresta longa onde o outro tem duas curtas com um
// vértice no meio (T-junction): a malha fica geometricamente fechada, mas
// topologicamente com "furos" (arestas usadas por 1 triângulo só), além de
// "agulhas" (triângulos achatados). Medido: ~230-280 arestas abertas por
// peça num cubo/cilindro simples. Isso atrapalharia um novo corte da peça
// (a tampa depende de arestas fechadas) e gera "open edges" no fatiador.
// costurarSoup:
//  1. solda com tolerância (MeshClip.criarSoldadorDeVertices, a mesma solda
//     de 27 células vizinhas usada na tampa do corte), descarta triângulos
//     que colapsam e agulhas de altura <= eps (ver alturaMinima);
//  2. repetidamente, pra cada aresta de borda (usada por 1 triângulo),
//     procura vértices de borda que caem sobre ela (distância <= eps, fora
//     das pontas) e subdivide o triângulo dono da aresta nesses pontos,
//     mantendo o winding;
//  3. remove pares de triângulos idênticos com winding oposto
//     (removerPaletasDuplas).
// Retorna { triangulos, cores } (soup) + { furos, naoManifold } finais.
// costurarDaGeometria tenta TOLERANCIAS_COSTURA_MM em ordem.

const EPS_COSTURA_MM = 1e-4;
const TOLERANCIAS_COSTURA_MM = [1e-4, 1e-5, 1e-3];
const MAX_PASSADAS_COSTURA = 8;

function obterSoldador(eps) {
  const ns = globalThis.Wisky3D;
  const MeshClip = ns && ns.MeshClip;
  if (!MeshClip || !MeshClip.criarSoldadorDeVertices) throw new Error("MeshClip (mesh-clip.js) não carregado.");
  return MeshClip.criarSoldadorDeVertices(eps);
}

// Chave numérica de aresta não-orientada (mais rápida que string em malhas
// de centenas de milhares de triângulos). Vale enquanto houver menos de 2^26
// vértices (a*2^26 + b < 2^53).
const BASE_CHAVE_ARESTA = 67108864;
function chaveAresta(a, b) { return a < b ? a * BASE_CHAVE_ARESTA + b : b * BASE_CHAVE_ARESTA + a; }

// Menor altura do triângulo (2*área / maior aresta): abaixo da tolerância
// de solda ele é uma "agulha" achatada (o CSG gera várias, com o vértice do
// meio sobre a aresta longa). Descartá-la abre uma T-junction que a
// subdivisão de arestas de borda logo abaixo fecha do jeito certo; mantê-la
// faria a subdivisão usar o próprio vértice oposto e gerar arestas com 3+
// triângulos.
function alturaMinima(a, b, c) {
  const dobroArea = norma(cross(sub(b, a), sub(c, a)));
  const maior = Math.max(norma(sub(b, a)), norma(sub(c, b)), norma(sub(a, c)));
  return maior > 0 ? dobroArea / maior : 0;
}

// Remove pares de triângulos com os mesmos 3 vértices e winding oposto
// (uma "paleta" de espessura zero, que a subdivisão pode produzir a partir
// de duas agulhas vizinhas): juntos eles não fecham volume nenhum e deixam
// suas arestas com 3+ triângulos.
function removerPaletasDuplas(tris) {
  const porChave = new Map();
  tris.forEach(function (t, i) {
    const chave = t.v.slice().sort(function (a, b) { return a - b; }).join("_");
    const lista = porChave.get(chave);
    if (lista) lista.push(i); else porChave.set(chave, [i]);
  });
  function orientacao(v) {
    // Rotação cíclica que põe o menor índice primeiro; +1/-1 pelo sentido.
    const m = v.indexOf(Math.min(v[0], v[1], v[2]));
    return v[(m + 1) % 3] < v[(m + 2) % 3] ? 1 : -1;
  }
  const remover = new Set();
  porChave.forEach(function (lista) {
    if (lista.length < 2) return;
    const positivos = lista.filter(function (i) { return orientacao(tris[i].v) > 0; });
    const negativos = lista.filter(function (i) { return orientacao(tris[i].v) < 0; });
    const pares = Math.min(positivos.length, negativos.length);
    for (let k = 0; k < pares; k++) {
      remover.add(positivos[k]);
      remover.add(negativos[k]);
    }
  });
  return remover.size ? tris.filter(function (t, i) { return !remover.has(i); }) : tris;
}

function verticesDeBordaDe(tris) {
  const contagem = new Map();
  for (let t = 0; t < tris.length; t++) {
    const v = tris[t].v;
    for (let e = 0; e < 3; e++) {
      const k = chaveAresta(v[e], v[(e + 1) % 3]);
      contagem.set(k, (contagem.get(k) || 0) + 1);
    }
  }
  const vertices = new Set();
  contagem.forEach(function (n, k) {
    if (n === 1) {
      vertices.add(Math.floor(k / BASE_CHAVE_ARESTA));
      vertices.add(k % BASE_CHAVE_ARESTA);
    }
  });
  return vertices;
}

function costurarSoup(triangulos, cores, eps) {
  const tol = eps || EPS_COSTURA_MM;

  // Solda exata primeiro (o CSG roda em double, ver Float64ArrayCSG: todo
  // vértice que não foi tocado pela interseção volta bit a bit igual), que é
  // barata; a solda com tolerância e o descarte de agulhas só olham os
  // vértices que ficaram em aresta de borda — o resto da malha já está
  // fechado e fica intacto.
  const pts = [];
  const indicePorChave = new Map();
  function indiceExato(p) {
    const chave = p[0] + "," + p[1] + "," + p[2];
    let idx = indicePorChave.get(chave);
    if (idx === undefined) {
      idx = pts.length;
      pts.push(p);
      indicePorChave.set(chave, idx);
    }
    return idx;
  }
  let tris = [];
  for (let i = 0; i < triangulos.length; i++) {
    const a = indiceExato(triangulos[i][0]);
    const b = indiceExato(triangulos[i][1]);
    const c = indiceExato(triangulos[i][2]);
    if (a === b || b === c || a === c) continue;
    tris.push({ v: [a, b, c], cor: cores ? cores[i] : undefined });
  }

  const deBorda = verticesDeBordaDe(tris);
  if (deBorda.size) {
    const soldador = obterSoldador(tol);
    const canonicoPorGrupo = new Map();
    const canonico = new Map();
    Array.from(deBorda).sort(function (x, y) { return x - y; }).forEach(function (v) {
      const grupo = soldador.indice(pts[v]);
      if (!canonicoPorGrupo.has(grupo)) canonicoPorGrupo.set(grupo, v);
      canonico.set(v, canonicoPorGrupo.get(grupo));
    });
    const filtrados = [];
    for (let t = 0; t < tris.length; t++) {
      const v = tris[t].v.map(function (i) { return canonico.has(i) ? canonico.get(i) : i; });
      if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
      const tocaBorda = deBorda.has(tris[t].v[0]) || deBorda.has(tris[t].v[1]) || deBorda.has(tris[t].v[2]);
      if (tocaBorda && alturaMinima(pts[v[0]], pts[v[1]], pts[v[2]]) <= tol) continue;
      filtrados.push({ v: v, cor: tris[t].cor });
    }
    tris = filtrados;
  }

  function contar() {
    const mapa = new Map();
    for (let t = 0; t < tris.length; t++) {
      const v = tris[t].v;
      for (let e = 0; e < 3; e++) {
        const k = chaveAresta(v[e], v[(e + 1) % 3]);
        const info = mapa.get(k);
        if (info) info.n++;
        else mapa.set(k, { n: 1, t: t, e: e });
      }
    }
    return mapa;
  }

  let bordasAntes = Infinity;
  for (let passada = 0; passada < MAX_PASSADAS_COSTURA; passada++) {
    const mapa = contar();
    const bordas = [];
    const verticesDeBorda = new Set();
    mapa.forEach(function (info) {
      if (info.n !== 1) return;
      bordas.push(info);
      const v = tris[info.t].v;
      verticesDeBorda.add(v[info.e]);
      verticesDeBorda.add(v[(info.e + 1) % 3]);
    });
    // Sem bordas, ou a última passada não diminuiu nada: para.
    if (!bordas.length || bordas.length >= bordasAntes) break;
    bordasAntes = bordas.length;

    // Vértices de borda ordenados por x, pra achar candidatos de cada
    // aresta por busca binária na faixa de x dela.
    const ordenados = Array.from(verticesDeBorda).sort(function (i, j) { return pts[i][0] - pts[j][0]; });
    const xs = ordenados.map(function (i) { return pts[i][0]; });
    function primeiroComXMaiorOuIgual(x) {
      let lo = 0, hi = xs.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] < x) lo = mid + 1; else hi = mid;
      }
      return lo;
    }

    // divisoes: índice de triângulo -> [lista de {s, v} por slot de aresta]
    const divisoes = new Map();
    bordas.forEach(function (info) {
      const v = tris[info.t].v;
      const ia = v[info.e], ib = v[(info.e + 1) % 3];
      const a = pts[ia], b = pts[ib];
      const ab = sub(b, a);
      const l2 = dot(ab, ab);
      if (!(l2 > 0)) return;
      const inicio = primeiroComXMaiorOuIgual(Math.min(a[0], b[0]) - tol);
      const xMax = Math.max(a[0], b[0]) + tol;
      const achados = [];
      for (let k = inicio; k < ordenados.length && xs[k] <= xMax; k++) {
        const iv = ordenados[k];
        if (iv === ia || iv === ib || iv === v[(info.e + 2) % 3]) continue;
        const p = pts[iv];
        const s = dot(sub(p, a), ab) / l2;
        if (s <= 0 || s >= 1) continue;
        const proj = somar(a, escalar(ab, s));
        if (norma(sub(p, proj)) <= tol) achados.push({ s: s, v: iv });
      }
      if (!achados.length) return;
      achados.sort(function (x, y) { return x.s - y.s; });
      let porSlot = divisoes.get(info.t);
      if (!porSlot) {
        porSlot = [null, null, null];
        divisoes.set(info.t, porSlot);
      }
      porSlot[info.e] = achados.map(function (x) { return x.v; });
    });
    if (!divisoes.size) break;

    const novos = [];
    for (let t = 0; t < tris.length; t++) {
      const porSlot = divisoes.get(t);
      if (!porSlot) {
        novos.push(tris[t]);
        continue;
      }
      const v = tris[t].v;
      const cor = tris[t].cor;
      const poligono = [];
      let slotsComPontos = 0;
      let unicoSlot = -1;
      for (let e = 0; e < 3; e++) {
        poligono.push(v[e]);
        if (porSlot[e]) {
          slotsComPontos++;
          unicoSlot = e;
          for (let k = 0; k < porSlot[e].length; k++) poligono.push(porSlot[e][k]);
        }
      }
      if (slotsComPontos === 1) {
        // Leque a partir do vértice oposto à aresta subdividida.
        const oposto = v[(unicoSlot + 2) % 3];
        const cadeia = [v[unicoSlot]].concat(porSlot[unicoSlot], [v[(unicoSlot + 1) % 3]]);
        for (let k = 0; k < cadeia.length - 1; k++) novos.push({ v: [cadeia[k], cadeia[k + 1], oposto], cor: cor });
      } else {
        // Pontos em 2+ arestas: leque a partir do centroide (vértice novo
        // interno), o único centro que não gera triângulos colineares.
        const pa = pts[v[0]], pb = pts[v[1]], pc = pts[v[2]];
        const centro = pts.length;
        pts.push(escalar(somar(somar(pa, pb), pc), 1 / 3));
        for (let k = 0; k < poligono.length; k++) {
          const i1 = poligono[k], i2 = poligono[(k + 1) % poligono.length];
          if (i1 !== centro && i2 !== centro) novos.push({ v: [i1, i2, centro], cor: cor });
        }
      }
    }
    tris = novos;
  }

  tris = removerPaletasDuplas(tris);

  const saidaTriangulos = new Array(tris.length);
  const saidaCores = new Array(tris.length);
  for (let t = 0; t < tris.length; t++) {
    saidaTriangulos[t] = [pts[tris[t].v[0]], pts[tris[t].v[1]], pts[tris[t].v[2]]];
    saidaCores[t] = tris[t].cor;
  }
  const mapaFinal = contar();
  let furos = 0, naoManifold = 0;
  mapaFinal.forEach(function (info) {
    if (info.n === 1) furos++;
    else if (info.n >= 3) naoManifold++;
  });
  return { triangulos: saidaTriangulos, cores: saidaCores, furos: furos, naoManifold: naoManifold };
}

// ---------------------------------------------------------------------------
// CSG
// ---------------------------------------------------------------------------

let bibliotecasPromise = null;
function carregarBibliotecas() {
  if (!bibliotecasPromise) {
    bibliotecasPromise = Promise.all([import("three"), import("three-bvh-csg")]).then(function (m) {
      return { THREE: m[0], CSG: m[1] };
    });
    bibliotecasPromise.catch(function () { bibliotecasPromise = null; });
  }
  return bibliotecasPromise;
}

function proximoMacrotask() {
  return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

const TEMPO_ESGOTADO = { tempoEsgotado: true };

// Roda `etapas` (funções síncronas) em sequência, cedendo o event loop
// (setTimeout 0) antes de cada uma, numa corrida (Promise.race) contra um
// timer de `timeoutMs`. Como cada etapa é síncrona, o timer só consegue
// vencer ENTRE etapas: se uma etapa demorar mais que o prazo, ela termina
// mesmo assim, e aí o timer (já vencido, com prazo anterior ao do próximo
// setTimeout 0) dispara, marca cancelado e as etapas seguintes não rodam.
// Resolve com o array de resultados ou com TEMPO_ESGOTADO.
function executarComTimeout(etapas, timeoutMs) {
  let cancelado = false;
  let timer = null;
  const trabalho = (async function () {
    const resultados = [];
    for (let i = 0; i < etapas.length; i++) {
      await proximoMacrotask();
      if (cancelado) return TEMPO_ESGOTADO;
      resultados.push(etapas[i](resultados));
    }
    return resultados;
  })();
  const prazo = new Promise(function (resolve) {
    timer = setTimeout(function () {
      cancelado = true;
      resolve(TEMPO_ESGOTADO);
    }, timeoutMs);
  });
  return Promise.race([trabalho, prazo]).then(function (r) {
    clearTimeout(timer);
    return r;
  }, function (err) {
    clearTimeout(timer);
    throw err;
  });
}

function acharPeca(opcoes, id) {
  const fonte = opcoes && opcoes.pecas;
  if (typeof fonte === "function") return fonte(id);
  if (Array.isArray(fonte)) return fonte.find(function (p) { return p.id === id; });
  return undefined;
}

// Adiciona um pino (peça A) e o furo correspondente (peça B) no corte.
//  - pecaAId/pecaBId: ids de peça (formato de state.pecas em split-3mf.js).
//  - plano: { ponto, normal } do corte (MeshClip.definirPlanoDeCorte).
//  - pontoDeAncoragem: [x,y,z] no plano (ver calcularPontoDeAncoragem).
//  - diametroMm, folgaMm: diâmetro do pino; o furo tem raio + folga (e
//    folga extra de profundidade no fundo).
//  - opcoes (extensão ao brief, necessária porque este módulo não enxerga o
//    state de split-3mf.js): { pecas (array de peças ou função id -> peça,
//    obrigatório), libs ({THREE, CSG}, default: import() dinâmico),
//    timeoutMs (default 8000), segmentos (default 32), salienciaMm
//    (default = diâmetro, reduzido automaticamente se a peça for fina),
//    corConector ([r,g,b]) }.
// Resolve com { ok:true, geometriaA, geometriaB (BufferGeometry crua do
// CSG, em coordenadas do arquivo), pecaA, pecaB ({triangulos, cores}: soup
// costurada, o que split-3mf.js usa pra montar as peças), conector
// (dimensões usadas), diagnosticoA/B ({furos, naoManifold} depois da
// costura) } ou { ok:false, motivo[, diagnosticoA/B] } — não rejeita por
// malha ruim, timeout nem exceção do CSG (vira ok:false).
async function adicionarConectorNoCorte(pecaAId, pecaBId, plano, pontoDeAncoragem, diametroMm, folgaMm, opcoes) {
  const pecaA = acharPeca(opcoes, pecaAId);
  const pecaB = acharPeca(opcoes, pecaBId);
  if (!pecaA || !pecaB) return { ok: false, motivo: "Peça não encontrada." };
  if (pecaA === pecaB) return { ok: false, motivo: "Escolha duas peças diferentes." };

  // 1. Manifold primeiro: three-bvh-csg exige malhas fechadas (2-manifold).
  const diagA = diagnosticarManifoldDaPeca(pecaA);
  const diagB = diagnosticarManifoldDaPeca(pecaB);
  if (diagA.furos > 0 || diagA.naoManifold > 0 || diagB.furos > 0 || diagB.naoManifold > 0) {
    return {
      ok: false,
      motivo: "malha não fechada o suficiente",
      diagnosticoA: diagA,
      diagnosticoB: diagB
    };
  }

  const plan = planejarConector(pecaA, pecaB, plano, pontoDeAncoragem, diametroMm, folgaMm, opcoes);
  if (!plan.ok) return plan;

  let libs;
  try {
    libs = (opcoes && opcoes.libs) || await carregarBibliotecas();
  } catch (err) {
    return { ok: false, motivo: "Não foi possível carregar a biblioteca de CSG (three-bvh-csg)." };
  }
  const THREE = libs.THREE;
  const CSG = libs.CSG;
  const segmentos = (opcoes && opcoes.segmentos) || SEGMENTOS_PADRAO;
  const cor = (opcoes && opcoes.corConector) || COR_CONECTOR_PADRAO;
  const timeoutMs = opcoes && opcoes.timeoutMs > 0 ? opcoes.timeoutMs : TIMEOUT_PADRAO_MS;

  // Pino: da ponta embutida em A (saliência pra dentro de A) até a ponta
  // saliente (saliência pra dentro do espaço de B). Furo: do plano (recuado
  // um pouco pra dentro de A, pra não ficar coplanar com a tampa de B) até
  // profundidadeFuro dentro de B.
  // Tudo em coordenadas locais, com origem no ponto do conector (ver
  // pecaParaBufferGeometry): o cilindro nasce em torno de [0,0,0].
  const origem = plan.ponto;
  const recuo = Math.min(1, plan.saliencia / 2);
  const basePino = escalar(plan.dirParaB, -plan.saliencia);
  const baseFuro = escalar(plan.dirParaB, -recuo);

  function novoEvaluator() {
    const ev = new CSG.Evaluator();
    ev.attributes = ["position", "color"];
    ev.useGroups = false;
    return ev;
  }

  function brush(geometry) {
    const b = new CSG.Brush(geometry);
    b.updateMatrixWorld();
    return b;
  }

  let resultados;
  try {
    resultados = await executarComTimeout([
      function () {
        const pino = criarCilindro(THREE, plan.raioPino, 2 * plan.saliencia, basePino, plan.dirParaB, cor, segmentos);
        return novoEvaluator().evaluate(brush(pecaParaBufferGeometry(THREE, pecaA, origem)), brush(pino), CSG.ADDITION).geometry;
      },
      function () {
        const furo = criarCilindro(THREE, plan.raioFuro, recuo + plan.profundidadeFuro, baseFuro, plan.dirParaB, cor, segmentos);
        return novoEvaluator().evaluate(brush(pecaParaBufferGeometry(THREE, pecaB, origem)), brush(furo), CSG.SUBTRACTION).geometry;
      },
      function (anteriores) {
        return [costurarDaGeometria(anteriores[0], origem), costurarDaGeometria(anteriores[1], origem)];
      }
    ], timeoutMs);
  } catch (err) {
    return { ok: false, motivo: "Falha no CSG: " + (err && err.message ? err.message : String(err)) };
  }
  if (resultados === TEMPO_ESGOTADO) return { ok: false, motivo: "tempo esgotado" };

  const geometriaA = resultados[0];
  const geometriaB = resultados[1];
  const costuradaA = resultados[2][0];
  const costuradaB = resultados[2][1];
  if (!costuradaA || !costuradaB) return { ok: false, motivo: "O CSG gerou uma peça vazia." };

  // Devolve as BufferGeometry do CSG em coordenadas do arquivo (o brief pede
  // as geometrias), mas quem monta as peças deve usar pecaA/pecaB: soup em
  // double, já costurada (ver costurarSoup).
  geometriaA.translate(origem[0], origem[1], origem[2]);
  geometriaB.translate(origem[0], origem[1], origem[2]);

  return {
    ok: true,
    geometriaA: geometriaA,
    geometriaB: geometriaB,
    pecaA: { triangulos: costuradaA.triangulos, cores: costuradaA.cores },
    pecaB: { triangulos: costuradaB.triangulos, cores: costuradaB.cores },
    conector: {
      ponto: plan.ponto,
      saliencia: plan.saliencia,
      raioPino: plan.raioPino,
      raioFuro: plan.raioFuro,
      profundidadeFuro: plan.profundidadeFuro
    },
    diagnosticoA: { furos: costuradaA.furos, naoManifold: costuradaA.naoManifold },
    diagnosticoB: { furos: costuradaB.furos, naoManifold: costuradaB.naoManifold }
  };
}

function costurarDaGeometria(geometry, origem) {
  const pos = geometry.getAttribute("position");
  if (!pos || !pos.count) return null;
  // Guarda contra regressão silenciosa: se um upgrade do three-bvh-csg
  // parar de preservar o tipo de array de entrada (ver Float64ArrayCSG),
  // o CSG passaria a rodar em Float32 sem erro nenhum — só ~4/600 cortes
  // sucessivos pelo eixo do pino abririam buraco, um defeito raro e tardio
  // demais pra pegar em teste manual. Falhar alto e claro aqui em vez disso.
  if (!(pos.array instanceof Float64Array)) {
    throw new Error("CSG não rodou em Float64 — possível mudança de comportamento em three-bvh-csg (ver Float64ArrayCSG)");
  }
  const soup = geometriaParaSoup(geometry, origem);
  // A costura decide por limiar (solda, altura de agulha, distância
  // vértice-aresta); um caso na beira do limiar pode sobrar com poucas
  // arestas abertas numa tolerância e fechar em outra. Tenta em ordem e
  // fica com a primeira que fecha tudo (ou a de menos defeitos).
  let melhor = null;
  for (let i = 0; i < TOLERANCIAS_COSTURA_MM.length; i++) {
    const r = costurarSoup(soup.triangulos, soup.cores, TOLERANCIAS_COSTURA_MM[i]);
    if (!melhor || r.furos + r.naoManifold < melhor.furos + melhor.naoManifold) melhor = r;
    if (melhor.furos + melhor.naoManifold === 0) break;
  }
  return melhor;
}

export {
  validarManifold,
  diagnosticarManifoldDaPeca,
  diagnosticarManifoldDeSoup,
  secaoNoPlano,
  analisarPontoNaSecao,
  calcularPontoDeAncoragem,
  distanciaAteSuperficie,
  planejarConector,
  pecaParaBufferGeometry,
  criarCilindro,
  geometriaParaSoup,
  costurarSoup,
  executarComTimeout,
  adicionarConectorNoCorte,
  TEMPO_ESGOTADO,
  PAREDE_MINIMA_MM
};
