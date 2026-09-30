// ---------------------------------------------------------------------------
// BLOCO: Colorir 3MF. Pinta um STL sem cor no navegador (viewer Three.js +
// balde/seleção mágica por tolerância de curvatura) e exporta um .3mf com cor
// por triângulo (3MF Materials and Properties Extension: colorgroup + pid/p1).
// ---------------------------------------------------------------------------
import * as THREE from "three";
import {
  criarViewerBasico,
  computeFaceNormals,
  criarMeshTriangulos,
  aplicarCoresComDestaque,
  AVISO_TRIANGULOS_GRANDE
} from "wisky3d/three-viewer-basico.js";

const root = document.getElementById("cor3mf");

if (root) {
  const ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  const ThreeMFWriter = window.Wisky3D && window.Wisky3D.ThreeMFWriter;

  const dropzone = document.getElementById("cor3mf-dropzone");
  const upload = document.getElementById("cor3mf-upload");
  const loadingEl = document.getElementById("cor3mf-loading");
  const erroEl = document.getElementById("cor3mf-erro");
  const painel = document.getElementById("cor3mf-painel");
  const canvasEl = document.getElementById("cor3mf-canvas");
  const avisoGrandeEl = document.getElementById("cor3mf-aviso-grande");
  const avisoGrandeTextoEl = document.getElementById("cor3mf-aviso-grande-texto");
  const avisoGrandeFecharBtn = document.getElementById("cor3mf-aviso-grande-fechar");
  const toolBaldeBtn = document.getElementById("cor3mf-tool-balde");
  const toolMagicaBtn = document.getElementById("cor3mf-tool-magica");
  const toleranciaCampoEl = document.getElementById("cor3mf-tolerancia-campo");
  const toleranciaInput = document.getElementById("cor3mf-tolerancia");
  const toleranciaValorEl = document.getElementById("cor3mf-tolerancia-valor");
  const paletaListaEl = document.getElementById("cor3mf-paleta-lista");
  const paletaAddBtn = document.getElementById("cor3mf-paleta-add");
  const paletaNovaCorInput = document.getElementById("cor3mf-paleta-nova-cor");
  const acoesSelecaoEl = document.getElementById("cor3mf-acoes-selecao");
  const selecaoContagemEl = document.getElementById("cor3mf-selecao-contagem");
  const aplicarSelecaoBtn = document.getElementById("cor3mf-aplicar-selecao");
  const limparSelecaoBtn = document.getElementById("cor3mf-limpar-selecao");
  const desfazerBtn = document.getElementById("cor3mf-desfazer");
  const resetarBtn = document.getElementById("cor3mf-resetar");
  const exportBtn = document.getElementById("cor3mf-exportar");
  const outEl = document.getElementById("cor3mf-out");
  const recentralizarBtn = document.getElementById("cor3mf-recentralizar");
  const abasEl = document.getElementById("cor3mf-abas");

  const DEFAULT_COLOR = ThreeMFWriter.DEFAULT_COLOR;
  const MAX_UNDO = 20;
  const PALETA_PRESETS = ["#3fb6e8", "#ff6b4a", "#8b7cf6", "#5cd65c", "#ffd633", "#ff4fa3", "#4dd0e1", "#ffa726"];

  const DEFAULT_COLOR_HEX = "#" + DEFAULT_COLOR.map(ThreeMFWriter.toHexByte).join("");
  // Tolerância fixa do balde: 0° exato só pega o triângulo clicado em malhas
  // orgânicas bem trianguladas (STL de scan/escultura), já que ali quase
  // nenhum triângulo vizinho tem normal idêntica, o clique parecia "não
  // pintar nada". Um valor pequeno cobre essa variação natural sem invadir
  // faces realmente distintas (uma quina reta muda a normal bem mais que
  // isso).
  const BALDE_TOLERANCIA_DEG = 8;

  let currentTool = "balde";
  // Viewer Three.js compartilhado (assets/js/three-viewer-basico.js): câmera,
  // luzes, trackball, zoom no cursor, loop de render, enquadramento e resize.
  // Criado só no primeiro arquivo carregado (initSceneOnce).
  let viewer = null;
  let state = null;
  /*
   * state = {
   *   fileName, triCount,
   *   faceNormals: Float32Array(triCount*3),
   *   adjacency: Array<number[]> (vizinhos por triângulo),
   *   baseColors: Uint8ClampedArray(triCount*3) (fonte de verdade da cor),
   *   selection: Set<number>,
   *   geometry, cornerExportIndex: Int32Array(triCount*3),
   *   exportVertices: Array<[x,y,z]>, undoStack: Uint8ClampedArray[]
   * }
   */

  function mostrarErro(msg) {
    erroEl.textContent = msg;
    erroEl.hidden = !msg;
  }

  function mostrarCarregando(ativo) {
    loadingEl.hidden = !ativo;
  }

  // -------------------------------------------------------------------------
  // Viewer Three.js
  // -------------------------------------------------------------------------

  function initSceneOnce() {
    if (viewer) return;
    viewer = criarViewerBasico(canvasEl, { onClique: handleCanvasClick });
  }

  // -------------------------------------------------------------------------
  // Geometria: STL bruto -> BufferGeometry não indexada (cor sólida por
  // triângulo) + adjacência de triângulos + lista de vértices únicos pra
  // exportação (independente da geometria não-indexada usada no viewer).
  // -------------------------------------------------------------------------

  function buildGeometryData(triangulos) {
    const triCount = triangulos.length;
    const positions = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const tri = triangulos[t];
      for (let c = 0; c < 3; c++) {
        const base = t * 9 + c * 3;
        positions[base] = tri[c][0];
        positions[base + 1] = tri[c][1];
        positions[base + 2] = tri[c][2];
      }
    }
    return { triCount, positions };
  }

  // computeFaceNormals/expandFaceNormalsToCorners moram em
  // three-viewer-basico.js (compartilhadas com o Split 3MF).

  // buildAdjacencyAndExportIndex mora em model-parser.js
  // (ModelParser.buildAdjacencyAndExportIndex): é geometria pura, sem
  // DOM/Three.js, reaproveitável por outras ferramentas.

  // Compartilhada por balde e seleção mágica: BFS a partir do triângulo
  // clicado. `compararComOrigem` decide contra qual normal cada vizinho é
  // comparado:
  //  - false (seleção mágica): compara com o vizinho imediato que o
  //    descobriu, não com a origem. Segue curvaturas suaves ao longo de
  //    vários cliques, mesmo que a normal final esteja bem longe da do clique.
  //  - true (balde): compara sempre com a normal do triângulo clicado. A
  //    região fica presa a uma vizinhança realmente próxima do clique, sem a
  //    deriva acumulada de passo a passo que faria a mesma tolerância
  //    "vazar" por uma superfície curva inteira.
  function floodFillByNormalTolerance(startTri, toleranceDeg, adjacency, faceNormals, triCount, compararComOrigem, filtroVisivel) {
    // Pequena margem: normais de triângulos coplanares raramente são
    // bit-idênticas (erro de ponto flutuante do produto vetorial), então com
    // tolerância 0° o "dot >= 1" exato quase nunca passava mesmo entre
    // triângulos da mesma face plana.
    const toleranceCos = Math.cos((toleranceDeg * Math.PI) / 180) - 1e-6;
    const visited = new Uint8Array(triCount);
    visited[startTri] = 1;
    const stack = [startTri];
    const result = [startTri];
    const origX = faceNormals[startTri * 3], origY = faceNormals[startTri * 3 + 1], origZ = faceNormals[startTri * 3 + 2];

    while (stack.length) {
      const cur = stack.pop();
      const cx = compararComOrigem ? origX : faceNormals[cur * 3];
      const cy = compararComOrigem ? origY : faceNormals[cur * 3 + 1];
      const cz = compararComOrigem ? origZ : faceNormals[cur * 3 + 2];
      const vizinhos = adjacency[cur];
      for (let i = 0; i < vizinhos.length; i++) {
        const n = vizinhos[i];
        if (visited[n]) continue;
        if (filtroVisivel && !filtroVisivel.has(n)) continue;
        const nx = faceNormals[n * 3], ny = faceNormals[n * 3 + 1], nz = faceNormals[n * 3 + 2];
        const dot = cx * nx + cy * ny + cz * nz;
        if (dot >= toleranceCos) {
          visited[n] = 1;
          result.push(n);
          stack.push(n);
        }
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Cor: baseColors é a fonte de verdade; o atributo "color" da geometria
  // reflete baseColors misturado com o destaque de seleção (só visual).
  // -------------------------------------------------------------------------

  function refreshColorBuffer() {
    aplicarCoresComDestaque(state.geometry, state.triCount, state.baseColors, (t) => state.selection.has(t));
    viewer.requestRender();
  }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // -------------------------------------------------------------------------
  // Paleta de cores usadas (numerada, ao estilo dos slots de cor do Bambu
  // Studio): cada slot é clicável (define a cor ativa pra pintar) e tem um
  // color picker nativo embutido pra editar a própria cor do slot.
  // -------------------------------------------------------------------------

  function corAtivaHex() {
    if (!state || !state.paleta.length) return PALETA_PRESETS[0];
    return state.paleta[state.paletaAtivaIndex].hex;
  }

  function renderPaleta() {
    if (!state) return;
    paletaListaEl.innerHTML = "";
    state.paleta.forEach((cor, i) => {
      const slot = document.createElement("div");
      slot.className = "cor3mf-slot" + (i === state.paletaAtivaIndex ? " is-ativa" : "");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cor3mf-slot-btn";
      btn.style.background = cor.hex;
      btn.textContent = String(i + 1);
      btn.setAttribute("aria-label", "Usar cor " + (i + 1));
      btn.addEventListener("click", () => {
        state.paletaAtivaIndex = i;
        renderPaleta();
      });

      const edit = document.createElement("input");
      edit.type = "color";
      edit.className = "cor3mf-slot-edit";
      edit.value = cor.hex;
      edit.setAttribute("aria-label", "Editar cor " + (i + 1));
      edit.addEventListener("click", (e) => e.stopPropagation());
      // "input" dispara a cada movimento do seletor de cor, só atualiza a
      // prévia visual do botão, sem tocar na malha (evitaria recolorir a
      // malha inteira dezenas de vezes durante o arraste). A troca de fato
      // (e o replace nos triângulos já pintados com a cor antiga) só
      // acontece em "change", quando o usuário confirma a nova cor.
      edit.addEventListener("input", () => {
        btn.style.background = edit.value;
      });
      edit.addEventListener("change", () => {
        const hexAntigo = cor.hex;
        const hexNovo = edit.value;
        cor.hex = hexNovo;
        if (hexAntigo.toLowerCase() !== hexNovo.toLowerCase()) {
          recolorirCor(hexToRgb(hexAntigo), hexToRgb(hexNovo));
        }
        renderPaleta();
      });

      slot.appendChild(btn);
      slot.appendChild(edit);

      if (state.paleta.length > 1) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "cor3mf-slot-del";
        del.textContent = "×";
        del.setAttribute("aria-label", "Remover cor " + (i + 1));
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          recolorirCor(hexToRgb(cor.hex), DEFAULT_COLOR);
          state.paleta.splice(i, 1);
          if (state.paletaAtivaIndex >= state.paleta.length) state.paletaAtivaIndex = state.paleta.length - 1;
          renderPaleta();
        });
        slot.appendChild(del);
      }

      paletaListaEl.appendChild(slot);
    });
  }

  function pushUndo() {
    state.undoStack.push(state.baseColors.slice());
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    desfazerBtn.disabled = false;
  }

  function undo() {
    if (!state || !state.undoStack.length) return;
    state.baseColors = state.undoStack.pop();
    refreshColorBuffer();
    desfazerBtn.disabled = state.undoStack.length === 0;
  }

  function paintTriangles(triList, rgb) {
    pushUndo();
    for (let i = 0; i < triList.length; i++) {
      const t = triList[i];
      state.baseColors[t * 3] = rgb[0];
      state.baseColors[t * 3 + 1] = rgb[1];
      state.baseColors[t * 3 + 2] = rgb[2];
    }
    refreshColorBuffer();
  }

  // Troca em lote: acha todo triângulo já pintado com "de" e repinta com
  // "para". Usado ao editar a cor de um slot da paleta, pra que a mudança
  // valha pras áreas já pintadas com a cor antiga, não só pras próximas.
  function recolorirCor(de, para) {
    if (!state) return;
    const alvo = [];
    for (let t = 0; t < state.triCount; t++) {
      if (
        state.baseColors[t * 3] === de[0] &&
        state.baseColors[t * 3 + 1] === de[1] &&
        state.baseColors[t * 3 + 2] === de[2]
      ) {
        alvo.push(t);
      }
    }
    if (alvo.length) paintTriangles(alvo, para);
  }

  // -------------------------------------------------------------------------
  // Ferramentas de pintura
  // -------------------------------------------------------------------------

  function setTool(tool) {
    currentTool = tool;
    toolBaldeBtn.classList.toggle("is-ativa", tool === "balde");
    toolBaldeBtn.setAttribute("aria-checked", tool === "balde" ? "true" : "false");
    toolMagicaBtn.classList.toggle("is-ativa", tool === "magica");
    toolMagicaBtn.setAttribute("aria-checked", tool === "magica" ? "true" : "false");
    acoesSelecaoEl.hidden = tool !== "magica";
    // Tolerância só faz sentido pra seleção mágica (agrupar curvas em vários
    // cliques); o balde sempre pinta só a face plana clicada (tolerância 0).
    toleranciaCampoEl.hidden = tool !== "magica";
    if (state && state.selection.size) {
      state.selection.clear();
      refreshColorBuffer();
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    if (!state) return;
    const n = state.selection.size;
    selecaoContagemEl.textContent = n
      ? n + (n === 1 ? " triângulo selecionado" : " triângulos selecionados")
      : "Nenhuma seleção ainda";
    aplicarSelecaoBtn.disabled = n === 0;
    limparSelecaoBtn.disabled = n === 0;
  }

  // -------------------------------------------------------------------------
  // Abas de chapa (3MF multi-plate): barra "Todos" + uma aba por chapa. Fica
  // oculta quando o arquivo não tem metadado de chapa (state.chapas === null,
  // o caso mais comum hoje: STL ou 3MF de uma chapa só), preservando o
  // comportamento anterior à risca.
  // -------------------------------------------------------------------------

  function renderAbasChapa() {
    if (!state || !state.chapas) {
      abasEl.hidden = true;
      abasEl.innerHTML = "";
      return;
    }

    abasEl.innerHTML = "";
    abasEl.hidden = false;

    function criarAba(indice, rotulo) {
      const ativa = state.chapaAtivaIndice === indice;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cor3mf-aba" + (ativa ? " is-ativa" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", ativa ? "true" : "false");
      btn.dataset.chapa = indice === null ? "" : String(indice);
      btn.textContent = rotulo;
      btn.addEventListener("click", () => setChapaAtiva(indice));
      return btn;
    }

    abasEl.appendChild(criarAba(null, "Todos"));
    state.chapas.forEach((chapa) => {
      abasEl.appendChild(criarAba(chapa.indice, "Modelo " + chapa.indice));
    });
  }

  // Reescreve, em cada triângulo, a posição real (chapa visível) ou um ponto
  // degenerado (chapa oculta: os 3 vértices colapsam no pivô do modelo, área
  // zero -> invisível e não raycastável de forma útil). Não mexe em
  // baseColors/cor nem na câmera: trocar de aba não perde pintura já feita
  // nem reseta o enquadramento que o usuário escolheu.
  function aplicarFiltroDeVisibilidade() {
    if (!state) return;
    const posArr = state.geometry.attributes.position.array;

    if (state.chapaAtivaIndice === null || !state.chapas) {
      posArr.set(state.positionsOriginais);
    } else {
      const visiveis = state.triangulosPorChapa && state.triangulosPorChapa.get(state.chapaAtivaIndice);
      const meshPivotLocal = viewer.getPivotLocal();
      const pivotX = meshPivotLocal ? meshPivotLocal.x : 0;
      const pivotY = meshPivotLocal ? meshPivotLocal.y : 0;
      const pivotZ = meshPivotLocal ? meshPivotLocal.z : 0;
      for (let t = 0; t < state.triCount; t++) {
        const base = t * 9;
        if (visiveis && visiveis.has(t)) {
          for (let i = 0; i < 9; i++) posArr[base + i] = state.positionsOriginais[base + i];
        } else {
          for (let c = 0; c < 3; c++) {
            posArr[base + c * 3] = pivotX;
            posArr[base + c * 3 + 1] = pivotY;
            posArr[base + c * 3 + 2] = pivotZ;
          }
        }
      }
    }

    state.geometry.attributes.position.needsUpdate = true;
    state.geometry.computeBoundingSphere();
    viewer.requestRender();
  }

  // Bbox (em espaço local, a partir das posições reais em positionsOriginais)
  // dos triângulos da chapa `indice`, usado só pra enquadrar a câmera nela.
  function computeChapaPivotERaio(indice) {
    const visiveis = state.triangulosPorChapa && state.triangulosPorChapa.get(indice);
    if (!visiveis || !visiveis.size) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    visiveis.forEach((t) => {
      const base = t * 9;
      for (let c = 0; c < 3; c++) {
        const x = state.positionsOriginais[base + c * 3];
        const y = state.positionsOriginais[base + c * 3 + 1];
        const z = state.positionsOriginais[base + c * 3 + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    });
    const pivotLocal = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const radius = pivotLocal.distanceTo(new THREE.Vector3(minX, minY, minZ)) || 1;
    return { pivotLocal, radius };
  }

  // Reenquadra a câmera na chapa ativa (ou no modelo inteiro, se `indice` for
  // null), via viewer.focarEm (three-viewer-basico.js): mesmo esquema de
  // near/far/min/maxDistance de frameToGeometry, e também move o pivô do
  // trackball pra chapa em foco, senão o clamp de deriva do zoom prenderia a
  // câmera perto do centro do modelo inteiro mesmo com uma chapa distante em
  // foco.
  function atualizarFocoDaChapa(indice) {
    let pivotLocalNovo = state.pivotLocalTodos;
    let raioNovo = state.radiusTodos;
    if (indice !== null) {
      const foco = computeChapaPivotERaio(indice);
      if (foco) {
        pivotLocalNovo = foco.pivotLocal;
        raioNovo = foco.radius;
      }
    }
    viewer.focarEm(pivotLocalNovo, raioNovo);
  }

  function setChapaAtiva(indice) {
    if (!state) return;
    state.chapaAtivaIndice = indice;
    if (state.selection.size) {
      state.selection.clear();
    }
    aplicarFiltroDeVisibilidade();
    atualizarFocoDaChapa(indice);
    renderAbasChapa();
    refreshColorBuffer();
    updateSelectionUI();
  }

  // Raycaster, trackball (giro do objeto) e detecção de clique vs. arraste
  // moram em three-viewer-basico.js; o viewer chama handleCanvasClick num
  // clique de verdade (opção onClique de criarViewerBasico).

  function handleCanvasClick(e) {
    if (!state || !viewer || !viewer.mesh) return;
    const hits = viewer.intersect(e);
    if (!hits.length) return;

    const triIndex = hits[0].faceIndex;
    const isBalde = currentTool === "balde";
    // Balde usa uma tolerância pequena fixa (não o slider, que é só da seleção
    // mágica) comparada sempre contra a normal do triângulo clicado. Cobre a
    // face plana clicada (e a granularidade fina de malhas orgânicas) sem
    // vazar pras faces vizinhas nem depender de deriva acumulada.
    const toleranceDeg = isBalde ? BALDE_TOLERANCIA_DEG : Number(toleranciaInput.value);
    const filtroVisivel = state.chapaAtivaIndice !== null && state.triangulosPorChapa
      ? state.triangulosPorChapa.get(state.chapaAtivaIndice)
      : null;
    const regiao = floodFillByNormalTolerance(triIndex, toleranceDeg, state.adjacency, state.faceNormals, state.triCount, isBalde, filtroVisivel);

    if (currentTool === "balde") {
      paintTriangles(regiao, hexToRgb(corAtivaHex()));
    } else {
      regiao.forEach((t) => state.selection.add(t));
      refreshColorBuffer();
      updateSelectionUI();
    }
  }

  // -------------------------------------------------------------------------
  // Carregar STL e montar o estado/viewer
  // -------------------------------------------------------------------------

  function buildState(triangulos, fileName, origem) {
    initSceneOnce();

    const { triCount, positions } = buildGeometryData(triangulos);
    // Cópia imutável das posições reais, capturada antes de qualquer filtro de
    // visibilidade por chapa (ver aplicarFiltroDeVisibilidade): é a fonte de
    // verdade usada tanto para restaurar "Todos" quanto para reescrever, na
    // troca de aba, os 9 floats de cada triângulo visível.
    const positionsOriginais = positions.slice();
    const faceNormals = computeFaceNormals(positions, triCount);
    const { adjacency, exportVertices, cornerExportIndex } = ModelParser.buildAdjacencyAndExportIndex(positions, triCount);

    // setMesh descarta a mesh anterior, zera o giro e fixa o pivô do
    // trackball no centro geométrico do modelo (ver three-viewer-basico.js).
    const mesh = criarMeshTriangulos(positions, faceNormals, triCount);
    const geometry = mesh.geometry;
    viewer.setMesh(mesh);

    const baseColors = new Uint8ClampedArray(triCount * 3);
    for (let i = 0; i < triCount; i++) {
      baseColors[i * 3] = DEFAULT_COLOR[0];
      baseColors[i * 3 + 1] = DEFAULT_COLOR[1];
      baseColors[i * 3 + 2] = DEFAULT_COLOR[2];
    }

    state = {
      fileName,
      triCount,
      faceNormals,
      adjacency,
      baseColors,
      selection: new Set(),
      geometry,
      cornerExportIndex,
      exportVertices,
      undoStack: [],
      positionsOriginais,
      // O slot 1 começa com a mesma cor cinza do "não pintado" (DEFAULT_COLOR).
      // Assim dá pra recolorir de uma vez toda a área ainda não pintada só
      // trocando a cor desse slot (mesmo mecanismo de replace do editor de
      // paleta), sem precisar pintar triângulo por triângulo.
      paleta: [{ hex: DEFAULT_COLOR_HEX }],
      paletaAtivaIndex: 0,
      // Presentes só quando o arquivo original é um .3mf: permitem, na
      // exportação, remendar o pacote original (preservando Metadata/,
      // thumbnails etc.) em vez de reconstruir tudo do zero.
      triangleOrigins: (origem && origem.origins) || null,
      zip: (origem && origem.zip) || null
    };

    // Chapas (plates) detectadas num 3MF multi-plate (ver detectarChapas em
    // processarArquivo): guardado no estado pra uso futuro (seletor de chapa
    // na UI, ainda não implementado), null quando o arquivo não tem esse
    // metadado (STL, 3MF single-plate). triangulosPorChapa é derivado uma
    // única vez aqui, não recalculado a cada clique.
    state.chapas = (origem && origem.chapas) || null;
    state.chapaAtivaIndice = null; // null = "Todos"
    // mapearTriangulosParaChapas devolve arrays (ordem de varredura); aqui
    // viram Set pra permitir teste O(1) de pertencimento tanto no filtro de
    // visibilidade (aplicarFiltroDeVisibilidade) quanto no BFS de
    // balde/seleção mágica (floodFillByNormalTolerance).
    if (state.chapas) {
      state.triangulosPorChapa = new Map();
      ModelParser.mapearTriangulosParaChapas(state.triangleOrigins, state.chapas).forEach((lista, indice) => {
        state.triangulosPorChapa.set(indice, new Set(lista));
      });
    } else {
      state.triangulosPorChapa = null;
    }

    renderPaleta();
    refreshColorBuffer();
    viewer.frameToGeometry();
    // Snapshot do pivô/raio de "Todos" (modelo inteiro), capturado logo após
    // frameToGeometry (que os calculou a partir da geometria ainda sem
    // filtro nenhum aplicado) — usado por atualizarFocoDaChapa pra voltar a
    // esse enquadramento sempre que o usuário volta pra aba "Todos".
    state.pivotLocalTodos = viewer.getPivotLocal();
    state.radiusTodos = viewer.getRaio();
    renderAbasChapa();

    const grande = triCount >= AVISO_TRIANGULOS_GRANDE;
    avisoGrandeEl.hidden = !grande;
    if (grande) {
      avisoGrandeTextoEl.textContent = "Modelo com " + triCount.toLocaleString("pt-BR") + " triângulos, pintar regiões grandes pode ficar um pouco mais lento.";
    }

    exportBtn.disabled = false;
    resetarBtn.disabled = false;
    desfazerBtn.disabled = true;
    setTool("balde");
    outEl.textContent = "";
  }

  function extrairTriangulosDoArquivo(file) {
    if (/\.stl$/i.test(file.name)) {
      return file.arrayBuffer().then((buffer) => ({ triangulos: ModelParser.parseSTL(buffer), origins: null, zip: null }));
    }

    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("não foi possível carregar o leitor de 3MF"));
    }

    return JSZip.loadAsync(file).then((zip) => {
      const modelFile = ModelParser.localizarModeloRaiz(zip);
      if (!modelFile) throw new Error("3dmodel.model não encontrado no pacote 3MF");
      const rootPath = modelFile.name;
      const modelSettingsEntry = ModelParser.localizarArquivoUnico(zip, "model_settings.config");
      const modelSettingsPromise = modelSettingsEntry ? modelSettingsEntry.async("text") : Promise.resolve(null);
      return modelFile.async("text").then((modelText) =>
        Promise.all([ModelParser.extractTriangles3MF(zip, modelText, rootPath), modelSettingsPromise]).then(
          ([resultado, modelSettingsText]) => ({
            triangulos: resultado.triangulos,
            origins: resultado.origins,
            zip,
            modelSettingsText
          })
        )
      );
    });
  }

  // Detecta as chapas (plates) de um pacote 3MF multi-plate a partir do texto
  // de Metadata/model_settings.config, casando cada objectId com o índice de
  // chapa a que pertence. Retorna null quando o arquivo não tem metadados de
  // chapa (STL, 3MF single-plate ou 3MF sem esse metadado), caso em que a
  // ferramenta continua se comportando como hoje (uma "chapa" implícita só).
  function detectarChapas(modelSettingsText, triangleOrigins) {
    if (!modelSettingsText) return null;
    const plateAssignments = ModelParser.parsePlateAssignments(modelSettingsText);
    if (!plateAssignments) return null;
    return plateAssignments.map((objectIds, indice) => ({
      indice: indice + 1,
      objectIds: new Set(objectIds)
    }));
  }

  function processarArquivo(file) {
    if (!file) return;
    if (!/\.(stl|3mf)$/i.test(file.name)) {
      mostrarErro("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      return;
    }
    if (!ModelParser) {
      mostrarErro("Não foi possível carregar o leitor de modelos 3D.");
      return;
    }

    mostrarErro("");
    mostrarCarregando(true);
    painel.hidden = true;

    extrairTriangulosDoArquivo(file)
      .then((resultado) => {
        if (!resultado.triangulos.length) throw new Error("nenhuma geometria encontrada no arquivo");
        resultado.chapas = detectarChapas(resultado.modelSettingsText, resultado.origins);
        buildState(resultado.triangulos, file.name, resultado);
        painel.hidden = false;
        viewer.resize();
        viewer.frameToGeometry();
      })
      .catch((err) => {
        if (window.console && console.error) console.error("Colorir 3MF:", err);
        const detalhe = err && err.message ? " (" + err.message + ")" : "";
        mostrarErro("Não foi possível ler esse arquivo. Confirme que é um .stl ou .3mf válido." + detalhe);
      })
      .then(() => {
        mostrarCarregando(false);
      });
  }

  // -------------------------------------------------------------------------
  // Exportação: cor por triângulo sempre via 3MF Materials and Properties
  // Extension (m:colorgroup + pid/p1). Se a origem foi um .3mf, remenda o
  // pacote original (preserva Metadata/, thumbnails etc.); se foi um .stl,
  // monta um pacote novo do zero.
  // -------------------------------------------------------------------------

  function nomeArquivoSaida(nomeOriginal) {
    return nomeOriginal.replace(/\.(stl|3mf)$/i, "") + "-colorido.3mf";
  }

  const baixarBlob = ModelParser.baixarBlob;

  // Monta a paleta final de filamentos. Se sobrar alguma área ainda não
  // pintada (triângulo com a cor cinza default), o slot 1 fica reservado pra
  // ela: é nele que caem os triângulos sem paint_color, que usam o
  // extrusor/filamento padrão do objeto, e as cores pintadas ocupam os
  // slots seguintes. Mas se o modelo inteiro já foi pintado (nenhum
  // triângulo com a cor default sobrando, por exemplo depois de trocar a
  // cor do próprio slot 1 pela paleta), o cinza não teria nenhum uso real no
  // arquivo final, então ele é omitido e as cores pintadas ocupam os slots a
  // partir do 1.
  function coresPintadasGlobal() {
    const cores = [];
    const indiceDaCorGlobal = new Map();
    let temNaoPintado = false;
    for (let t = 0; t < state.triCount; t++) {
      const r = state.baseColors[t * 3], g = state.baseColors[t * 3 + 1], b = state.baseColors[t * 3 + 2];
      if (r === DEFAULT_COLOR[0] && g === DEFAULT_COLOR[1] && b === DEFAULT_COLOR[2]) {
        temNaoPintado = true;
        continue;
      }
      const chave = r + "," + g + "," + b;
      if (!indiceDaCorGlobal.has(chave)) {
        indiceDaCorGlobal.set(chave, cores.length);
        cores.push([r, g, b]);
      }
    }

    const paleta = temNaoPintado ? [DEFAULT_COLOR, ...cores] : cores.length ? cores : [DEFAULT_COLOR];
    const offset = temNaoPintado ? 2 : 1;
    const slotPorCor = new Map();
    cores.forEach((c, i) => slotPorCor.set(c[0] + "," + c[1] + "," + c[2], i + offset));

    return { paleta, slotPorCor };
  }

  // Caminho usado quando o arquivo de origem é um .3mf: reabre o zip
  // original e escreve as cores diretamente nos <triangle> de onde vieram,
  // sem tocar em Metadata/, thumbnails ou qualquer outro arquivo do pacote,
  // evita o aviso de "configuração inválida" do Bambu Studio, que aparece
  // quando o pacote deixa de parecer um projeto legítimo.
  function exportarModeloPreservandoPacote() {
    outEl.textContent = "Gerando arquivo 3MF...";

    const porArquivo = new Map();
    for (let t = 0; t < state.triCount; t++) {
      const origem = state.triangleOrigins[t];
      if (!origem) continue;
      let porObjeto = porArquivo.get(origem.path);
      if (!porObjeto) {
        porObjeto = new Map();
        porArquivo.set(origem.path, porObjeto);
      }
      let lista = porObjeto.get(origem.objectId);
      if (!lista) {
        lista = [];
        porObjeto.set(origem.objectId, lista);
      }
      lista.push({
        localIndex: origem.localIndex,
        r: state.baseColors[t * 3],
        g: state.baseColors[t * 3 + 1],
        b: state.baseColors[t * 3 + 2]
      });
    }

    const zip = state.zip;
    const { paleta, slotPorCor } = coresPintadasGlobal();

    const configEntry = ModelParser.localizarArquivoUnico(zip, "project_settings.config");
    const configPromise = configEntry
      ? configEntry.async("text").then((texto) => {
          try {
            const cfgOriginal = JSON.parse(texto);
            const novoCfg = ThreeMFWriter.reconstruirProjectSettings(cfgOriginal, paleta);
            if (novoCfg) {
              zip.file(configEntry.name, JSON.stringify(novoCfg, null, 4));
              return novoCfg.filament_colour.length;
            }
            return null;
          } catch (e) {
            return null;
          }
        })
      : Promise.resolve(null);

    const modelSettingsEntry = ModelParser.localizarArquivoUnico(zip, "model_settings.config");

    const tarefas = configPromise.then((numSlots) => {
      const slotPorCorAtivo = numSlots ? slotPorCor : null;
      const ajustesModelSettings = modelSettingsEntry
        ? modelSettingsEntry
            .async("text")
            .then((xmlText) => {
              zip.file(modelSettingsEntry.name, ThreeMFWriter.ajustarFilamentMapsNoModelSettings(xmlText, numSlots || 1));
            })
        : Promise.resolve();

      return Promise.all([
        ajustesModelSettings,
        ...Array.from(porArquivo.keys()).map((path) => {
          const entry = zip.file(path);
          if (!entry) return Promise.resolve();
          return entry.async("text").then((xmlText) => {
            zip.file(path, ThreeMFWriter.injetarCoresNoXml(xmlText, porArquivo.get(path), slotPorCorAtivo));
          });
        })
      ]);
    });

    tarefas
      .then(() => zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }))
      .then((blob) => {
        baixarBlob(blob, nomeArquivoSaida(state.fileName));
        outEl.textContent = "3MF colorido baixado.";
      })
      .catch((err) => {
        if (window.console && console.error) console.error("Colorir 3MF:", err);
        outEl.textContent = "Não foi possível gerar o arquivo 3MF.";
      });
  }

  function exportarModelo() {
    if (state.zip && state.triangleOrigins) {
      exportarModeloPreservandoPacote();
      return;
    }
    exportarModeloDoZero();
  }

  // Caminho usado quando o arquivo de origem é um .stl (não existe pacote
  // 3MF original pra preservar): monta um .3mf novo do zero via JSZip.
  function exportarModeloDoZero() {
    outEl.textContent = "Gerando arquivo 3MF...";

    const triangulos = new Array(state.triCount);
    for (let t = 0; t < state.triCount; t++) {
      triangulos[t] = {
        v1: state.cornerExportIndex[t * 3],
        v2: state.cornerExportIndex[t * 3 + 1],
        v3: state.cornerExportIndex[t * 3 + 2],
        color: [state.baseColors[t * 3], state.baseColors[t * 3 + 1], state.baseColors[t * 3 + 2]]
      };
    }

    const { modelXml, contentTypesXml, relsXml } = ThreeMFWriter.montarModeloDoZero([
      { objectId: 2, vertices: state.exportVertices, triangulos: triangulos }
    ]);

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypesXml);
    zip.file("_rels/.rels", relsXml);
    zip.file("3D/3dmodel.model", modelXml);

    zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
      .then((blob) => {
        baixarBlob(blob, nomeArquivoSaida(state.fileName));
        outEl.textContent = "3MF colorido baixado.";
      })
      .catch((err) => {
        if (window.console && console.error) console.error("Colorir 3MF:", err);
        outEl.textContent = "Não foi possível gerar o arquivo 3MF.";
      });
  }

  // -------------------------------------------------------------------------
  // Eventos de UI
  // -------------------------------------------------------------------------

  upload.addEventListener("change", () => {
    processarArquivo(upload.files && upload.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, () => {
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    processarArquivo(file);
  });

  toolBaldeBtn.addEventListener("click", () => setTool("balde"));
  toolMagicaBtn.addEventListener("click", () => setTool("magica"));

  toleranciaInput.addEventListener("input", () => {
    toleranciaValorEl.textContent = toleranciaInput.value + "°";
  });

  aplicarSelecaoBtn.addEventListener("click", () => {
    if (!state || !state.selection.size) return;
    const rgb = hexToRgb(corAtivaHex());
    const triList = Array.from(state.selection);
    state.selection.clear();
    paintTriangles(triList, rgb);
    updateSelectionUI();
  });

  paletaAddBtn.addEventListener("click", () => {
    if (!state) return;
    // O slot 1 (índice 0) é o cinza default, não um preset. Os presets
    // começam a valer a partir do primeiro slot adicionado.
    paletaNovaCorInput.value = PALETA_PRESETS[(state.paleta.length - 1) % PALETA_PRESETS.length];
    paletaNovaCorInput.click();
  });

  paletaNovaCorInput.addEventListener("change", () => {
    if (!state) return;
    state.paleta.push({ hex: paletaNovaCorInput.value });
    state.paletaAtivaIndex = state.paleta.length - 1;
    renderPaleta();
  });

  limparSelecaoBtn.addEventListener("click", () => {
    if (!state) return;
    state.selection.clear();
    refreshColorBuffer();
    updateSelectionUI();
  });

  recentralizarBtn.addEventListener("click", () => {
    if (viewer) viewer.recentralizarVista();
  });
  avisoGrandeFecharBtn.addEventListener("click", () => { avisoGrandeEl.hidden = true; });

  desfazerBtn.addEventListener("click", () => undo());

  resetarBtn.addEventListener("click", () => {
    if (!state) return;
    pushUndo();
    for (let i = 0; i < state.baseColors.length; i += 3) {
      state.baseColors[i] = DEFAULT_COLOR[0];
      state.baseColors[i + 1] = DEFAULT_COLOR[1];
      state.baseColors[i + 2] = DEFAULT_COLOR[2];
    }
    state.selection.clear();
    refreshColorBuffer();
    updateSelectionUI();
  });

  exportBtn.addEventListener("click", () => {
    if (!state) return;
    if (typeof JSZip === "undefined") {
      outEl.textContent = "Não foi possível carregar o gerador de 3MF. Verifique sua conexão e tente novamente.";
      return;
    }
    exportarModelo();
  });
}
