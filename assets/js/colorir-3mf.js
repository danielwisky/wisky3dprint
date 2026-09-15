// ---------------------------------------------------------------------------
// BLOCO: Colorir 3MF — pinta um STL sem cor no navegador (viewer Three.js +
// balde/seleção mágica por tolerância de curvatura) e exporta um .3mf com cor
// por triângulo (3MF Materials and Properties Extension: colorgroup + pid/p1).
// ---------------------------------------------------------------------------
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const root = document.getElementById("cor3mf");

if (root) {
  const ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;

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

  const DEFAULT_COLOR = [176, 176, 190];
  const HIGHLIGHT_COLOR = [255, 214, 51];
  const AVISO_TRIANGULOS_GRANDE = 150000;
  const MAX_UNDO = 20;
  const PALETA_PRESETS = ["#3fb6e8", "#ff6b4a", "#8b7cf6", "#5cd65c", "#ffd633", "#ff4fa3", "#4dd0e1", "#ffa726"];
  // Tolerância fixa do balde: 0° exato só pega o triângulo clicado em malhas
  // orgânicas bem trianguladas (STL de scan/escultura), já que ali quase
  // nenhum triângulo vizinho tem normal idêntica — o clique parecia "não
  // pintar nada". Um valor pequeno cobre essa variação natural sem invadir
  // faces realmente distintas (uma quina reta muda a normal bem mais que
  // isso).
  const BALDE_TOLERANCIA_DEG = 8;

  let currentTool = "balde";
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let mesh = null;
  let needsRender = true;
  let modelRadius = 1; // raio da esfera envolvente do modelo, fixo desde o carregamento
  let state = null;
  /*
   * state = {
   *   fileName, triCount,
   *   faceNormals: Float32Array(triCount*3),
   *   adjacency: Array<number[]> (vizinhos por triângulo),
   *   baseColors: Uint8ClampedArray(triCount*3) — fonte de verdade da cor,
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
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14161c);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d47, 1.15));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(1, 1.6, 1.2);
    scene.add(dirLight);

    controls = new OrbitControls(camera, renderer.domElement);
    // Sem inércia (o modelo para na hora que solta o botão) e zoom controlado
    // à mão (abaixo) pra aproximar/afastar em direção ao ponto sob o cursor.
    controls.enableDamping = false;
    controls.enableZoom = false;
    // O giro é feito à mão (ver bloco "Trackball" abaixo), estilo trackball: gira o
    // próprio objeto livremente em qualquer direção a partir do ponto
    // agarrado, sem o eixo vertical fixo do esquema padrão do OrbitControls
    // (que trava ao tentar virar o objeto de frente/costas a partir de um
    // ponto fora do eixo central). O OrbitControls fica só com o botão
    // direito (pan).
    controls.enableRotate = false;
    controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: THREE.MOUSE.PAN };
    controls.addEventListener("change", () => {
      needsRender = true;
    });

    canvasEl.addEventListener("wheel", handleWheelZoom, { passive: false });

    window.addEventListener("resize", resizeRenderer);
    resizeRenderer();
    animate();
  }

  // Zoom em direção ao ponto sob o cursor (como no Bambu Studio), em vez de
  // sempre em direção ao centro do modelo: acha o ponto 3D sob o mouse (ou
  // usa o alvo da órbita se o raio não acertar a malha) e escala tanto a
  // posição da câmera quanto o alvo a partir desse pivô, mantendo o ponto
  // fixo na tela.
  function handleWheelZoom(e) {
    if (!mesh) return;
    e.preventDefault();

    const rect = canvasEl.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);

    const hits = raycaster.intersectObject(mesh, false);
    const pivot = hits.length ? hits[0].point : controls.target.clone();

    const zoomSpeed = 1.1;
    // Trackpads às vezes mandam deltaY muito grande num só evento; sem limite
    // por evento a câmera podia pular quase até (ou pra dentro) do modelo
    // numa scrollada só, o que "bugava" a visualização.
    const passoZoom = THREE.MathUtils.clamp(e.deltaY * 0.0015 * zoomSpeed, -0.6, 0.6);
    const factor = Math.exp(passoZoom);

    // Câmera e alvo escalam juntos em torno do pivô pelo mesmo fator: a
    // distância câmera-alvo muda exatamente por "factor", sem depender da
    // distância até o pivô (que pode ficar perto de zero e, se usada num
    // denominador, gera saltos numéricos gigantes — bug já visto em produção).
    camera.position.sub(pivot).multiplyScalar(factor).add(pivot);
    controls.target.sub(pivot).multiplyScalar(factor).add(pivot);

    // Trava de segurança: o alvo da órbita nunca pode se afastar demais do
    // centro fixo do modelo. Sem isso, uma sequência longa de zoom (sobretudo
    // perto do limite máximo, onde o raio às vezes deixa de acertar a malha)
    // podia fazer o alvo "andar" pra fora do modelo evento após evento — a
    // câmera sempre reorienta pro alvo, então o erro se acumulava até o
    // modelo sumir da tela.
    if (meshPivotWorld) {
      const maxDistAlvoPivo = modelRadius * 1.5;
      const alvoOffset = controls.target.clone().sub(meshPivotWorld);
      const distAlvoPivo = alvoOffset.length();
      if (distAlvoPivo > maxDistAlvoPivo) {
        controls.target.copy(meshPivotWorld).addScaledVector(alvoOffset, maxDistAlvoPivo / distAlvoPivo);
      }
    }

    // Único limite de segurança: manter a distância câmera-alvo dentro de
    // [minDistance, maxDistance] — minDistance já garante que a câmera nunca
    // entra na esfera envolvente do modelo (ver frameCameraToGeometry).
    // Importante: capturar o deslocamento ANTES de mexer em camera.position —
    // encadear "camera.position.copy(target).add(camera.position.clone()...)"
    // é uma armadilha clássica, pois o .copy() já mutou camera.position antes
    // do .clone() rodar, colapsando câmera e alvo no mesmo ponto.
    const offset = camera.position.clone().sub(controls.target);
    const dist = offset.length();
    if (dist < controls.minDistance || dist > controls.maxDistance) {
      const clampedDist = THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).addScaledVector(offset, clampedDist / dist);
    }

    controls.update();
    needsRender = true;
  }

  function resizeRenderer() {
    const wrap = canvasEl.parentElement;
    const largura = wrap.clientWidth || 320;
    const altura = Math.max(420, Math.round(largura * 0.72));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  }

  function frameCameraToGeometry() {
    mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    const radius = sphere.radius || 1;
    modelRadius = radius;
    camera.near = Math.max(radius / 100, 0.01);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    // minDistance >= raio da esfera envolvente: garante que a câmera nunca
    // consiga entrar no volume do modelo, mesmo em formas não-esféricas
    // (ex.: um cubo tem raio inscrito bem menor que o raio da esfera
    // circunscrita) — evita a câmera atravessar a malha ao dar zoom demais.
    controls.minDistance = radius * 1.05;
    controls.maxDistance = radius * 8;
    recentralizarVista();
  }

  // Reposiciona a câmera no enquadramento padrão, sem mexer no giro que o
  // usuário já deu no modelo — útil pra "se achar" de novo depois de perder o
  // objeto de vista com muito zoom/pan. meshPivotWorld é fixo desde a carga
  // do arquivo, então serve de referência estável mesmo com o objeto girado.
  function recentralizarVista() {
    if (!mesh || !meshPivotWorld) return;
    const radius = modelRadius;
    camera.position.set(
      meshPivotWorld.x + radius * 1.6,
      meshPivotWorld.y + radius * 1.2,
      meshPivotWorld.z + radius * 1.6
    );
    controls.target.copy(meshPivotWorld);
    controls.update();
    needsRender = true;
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

  function computeFaceNormals(positions, triCount) {
    const normals = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const b = t * 9;
      const p0x = positions[b], p0y = positions[b + 1], p0z = positions[b + 2];
      const p1x = positions[b + 3], p1y = positions[b + 4], p1z = positions[b + 5];
      const p2x = positions[b + 6], p2y = positions[b + 7], p2z = positions[b + 8];
      const ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z;
      const vx = p2x - p0x, vy = p2y - p0y, vz = p2z - p0z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normals[t * 3] = nx;
      normals[t * 3 + 1] = ny;
      normals[t * 3 + 2] = nz;
    }
    return normals;
  }

  function expandFaceNormalsToCorners(faceNormals, triCount) {
    const out = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const nx = faceNormals[t * 3], ny = faceNormals[t * 3 + 1], nz = faceNormals[t * 3 + 2];
      for (let c = 0; c < 3; c++) {
        const base = t * 9 + c * 3;
        out[base] = nx;
        out[base + 1] = ny;
        out[base + 2] = nz;
      }
    }
    return out;
  }

  // Dá pra ter até 3 vizinhos por triângulo (um por aresta). Vértices são
  // "soldados" por posição quantizada pra achar arestas compartilhadas, já
  // que a geometria do viewer não compartilha vértices entre triângulos.
  function buildAdjacencyAndExportIndex(positions, triCount) {
    const FATOR_QUANTIZACAO = 1e4; // ~0.0001mm de tolerância pra "mesmo ponto"
    const keyToIndex = new Map();
    const exportVertices = [];
    const cornerExportIndex = new Int32Array(triCount * 3);

    for (let i = 0; i < triCount * 3; i++) {
      const base = i * 3;
      const x = positions[base], y = positions[base + 1], z = positions[base + 2];
      const chave = Math.round(x * FATOR_QUANTIZACAO) + "," + Math.round(y * FATOR_QUANTIZACAO) + "," + Math.round(z * FATOR_QUANTIZACAO);
      let idx = keyToIndex.get(chave);
      if (idx === undefined) {
        idx = exportVertices.length;
        exportVertices.push([x, y, z]);
        keyToIndex.set(chave, idx);
      }
      cornerExportIndex[i] = idx;
    }

    const adjacencySets = new Array(triCount);
    for (let t = 0; t < triCount; t++) adjacencySets[t] = new Set();

    const edgeMap = new Map();
    function edgeKey(a, b) {
      return a < b ? a + "_" + b : b + "_" + a;
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = cornerExportIndex[t * 3];
      const i1 = cornerExportIndex[t * 3 + 1];
      const i2 = cornerExportIndex[t * 3 + 2];
      const arestas = [[i0, i1], [i1, i2], [i2, i0]];
      for (let e = 0; e < arestas.length; e++) {
        const chave = edgeKey(arestas[e][0], arestas[e][1]);
        let lista = edgeMap.get(chave);
        if (!lista) {
          lista = [];
          edgeMap.set(chave, lista);
        }
        for (let j = 0; j < lista.length; j++) {
          const outro = lista[j];
          adjacencySets[t].add(outro);
          adjacencySets[outro].add(t);
        }
        lista.push(t);
      }
    }

    const adjacency = adjacencySets.map((s) => Array.from(s));
    return { adjacency, exportVertices, cornerExportIndex };
  }

  // Compartilhada por balde e seleção mágica: BFS a partir do triângulo
  // clicado. `compararComOrigem` decide contra qual normal cada vizinho é
  // comparado:
  //  - false (seleção mágica): compara com o vizinho imediato que o
  //    descobriu, não com a origem — segue curvaturas suaves ao longo de
  //    vários cliques, mesmo que a normal final esteja bem longe da do clique.
  //  - true (balde): compara sempre com a normal do triângulo clicado — a
  //    região fica presa a uma vizinhança realmente próxima do clique, sem a
  //    deriva acumulada de passo a passo que faria a mesma tolerância
  //    "vazar" por uma superfície curva inteira.
  function floodFillByNormalTolerance(startTri, toleranceDeg, adjacency, faceNormals, triCount, compararComOrigem) {
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
    const colorAttr = state.geometry.getAttribute("color");
    const arr = colorAttr.array;
    for (let t = 0; t < state.triCount; t++) {
      let r = state.baseColors[t * 3];
      let g = state.baseColors[t * 3 + 1];
      let b = state.baseColors[t * 3 + 2];
      if (state.selection.has(t)) {
        r = (r + HIGHLIGHT_COLOR[0]) / 2;
        g = (g + HIGHLIGHT_COLOR[1]) / 2;
        b = (b + HIGHLIGHT_COLOR[2]) / 2;
      }
      const base = t * 9;
      const rN = r / 255, gN = g / 255, bN = b / 255;
      for (let c = 0; c < 3; c++) {
        arr[base + c * 3] = rN;
        arr[base + c * 3 + 1] = gN;
        arr[base + c * 3 + 2] = bN;
      }
    }
    colorAttr.needsUpdate = true;
    needsRender = true;
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
      edit.addEventListener("input", () => {
        state.paleta[i].hex = edit.value;
        btn.style.background = edit.value;
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

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let pointerDownPos = null;

  // -------------------------------------------------------------------------
  // Trackball: gira o próprio objeto (não a câmera) livremente em qualquer
  // direção, como se você estivesse segurando uma bola nas mãos. O ponto que
  // você clica fica "grudado" no cursor durante todo o arraste, em vez de
  // orbitar em torno de um eixo vertical fixo (o que travava ao tentar virar
  // o objeto de frente/costas segurando um ponto fora do centro, como a mão
  // de um boneco em pé).
  // -------------------------------------------------------------------------
  let meshPivotLocal = null; // centro geométrico do modelo, em espaço local
  let meshPivotWorld = null; // ponto do mundo onde esse centro deve sempre ficar
  let trackballDrag = null; // { ndc0: {x,y}, qStart: Quaternion }

  // Projeção clássica de "virtual trackball" (Chen/Mountford/Sellen): mapeia
  // um ponto 2D normalizado de tela pra um ponto 3D numa esfera/hemisfério
  // virtual, indo pra uma folha hiperbólica quando o cursor sai do círculo
  // central — isso evita comportamento estranho perto das bordas.
  function trackballPoint(x, y) {
    const d2 = x * x + y * y;
    const z = d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2);
    return new THREE.Vector3(x, y, z).normalize();
  }

  function updateMeshPivotPosition() {
    mesh.position.copy(meshPivotWorld).sub(meshPivotLocal.clone().applyQuaternion(mesh.quaternion));
  }

  function ndcFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    pointerDownPos = [e.clientX, e.clientY];
    if (e.button === 0 && mesh) {
      trackballDrag = { ndc0: ndcFromEvent(e), qStart: mesh.quaternion.clone() };
      canvasEl.setPointerCapture(e.pointerId);
    }
  });

  canvasEl.addEventListener("pointermove", (e) => {
    if (!trackballDrag || !mesh) return;
    const ndc1 = ndcFromEvent(e);
    const p0 = trackballPoint(trackballDrag.ndc0.x, trackballDrag.ndc0.y);
    const p1 = trackballPoint(ndc1.x, ndc1.y);
    const axisView = new THREE.Vector3().crossVectors(p0, p1);
    if (axisView.lengthSq() < 1e-9) return;
    const angle = Math.acos(THREE.MathUtils.clamp(p0.dot(p1), -1, 1));
    const axisWorld = axisView.normalize().applyQuaternion(camera.quaternion);
    const q = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle);
    mesh.quaternion.copy(q).multiply(trackballDrag.qStart);
    updateMeshPivotPosition();
    needsRender = true;
  });

  canvasEl.addEventListener("pointercancel", () => {
    trackballDrag = null;
  });

  canvasEl.addEventListener("pointerup", (e) => {
    trackballDrag = null;
    if (!pointerDownPos) return;
    const dx = e.clientX - pointerDownPos[0];
    const dy = e.clientY - pointerDownPos[1];
    pointerDownPos = null;
    if (Math.hypot(dx, dy) > 5) return; // foi arraste (girar), não clique
    handleCanvasClick(e);
  });

  function handleCanvasClick(e) {
    if (!state || !mesh) return;
    const rect = canvasEl.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return;

    const triIndex = hits[0].faceIndex;
    const isBalde = currentTool === "balde";
    // Balde usa uma tolerância pequena fixa (não o slider, que é só da seleção
    // mágica) comparada sempre contra a normal do triângulo clicado — cobre a
    // face plana clicada (e a granularidade fina de malhas orgânicas) sem
    // vazar pras faces vizinhas nem depender de deriva acumulada.
    const toleranceDeg = isBalde ? BALDE_TOLERANCIA_DEG : Number(toleranciaInput.value);
    const regiao = floodFillByNormalTolerance(triIndex, toleranceDeg, state.adjacency, state.faceNormals, state.triCount, isBalde);

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
    const faceNormals = computeFaceNormals(positions, triCount);
    const { adjacency, exportVertices, cornerExportIndex } = buildAdjacencyAndExportIndex(positions, triCount);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(expandFaceNormalsToCorners(faceNormals, triCount), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(triCount * 9), 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    mesh = new THREE.Mesh(geometry, material);
    mesh.quaternion.identity();
    scene.add(mesh);

    // Pivô do trackball: o centro geométrico do modelo, fixo no mundo — o
    // objeto sempre gira em torno dele, não importa qual ponto você "agarra".
    geometry.computeBoundingSphere();
    meshPivotLocal = geometry.boundingSphere.center.clone();
    meshPivotWorld = meshPivotLocal.clone();
    updateMeshPivotPosition();

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
      paleta: [{ hex: PALETA_PRESETS[0] }],
      paletaAtivaIndex: 0,
      // Presentes só quando o arquivo original é um .3mf: permitem, na
      // exportação, remendar o pacote original (preservando Metadata/,
      // thumbnails etc.) em vez de reconstruir tudo do zero.
      triangleOrigins: (origem && origem.origins) || null,
      zip: (origem && origem.zip) || null
    };

    renderPaleta();
    refreshColorBuffer();
    frameCameraToGeometry();

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
      let modelFiles = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
      if (!modelFiles.length) modelFiles = zip.file(/3dmodel\.model$/i);
      if (!modelFiles.length) throw new Error("3dmodel.model não encontrado no pacote 3MF");
      const rootPath = modelFiles[0].name;
      return modelFiles[0].async("text").then((modelText) =>
        ModelParser.extractTriangles3MF(zip, modelText, rootPath).then((resultado) => ({
          triangulos: resultado.triangulos,
          origins: resultado.origins,
          zip
        }))
      );
    });
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
        buildState(resultado.triangulos, file.name, resultado);
        painel.hidden = false;
        resizeRenderer();
        frameCameraToGeometry();
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
  // Exportação — cor por triângulo sempre via 3MF Materials and Properties
  // Extension (m:colorgroup + pid/p1). Se a origem foi um .3mf, remenda o
  // pacote original (preserva Metadata/, thumbnails etc.); se foi um .stl,
  // monta um pacote novo do zero.
  // -------------------------------------------------------------------------

  function rgbToHex3mf(c) {
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return "#" + toHex(c[0]) + toHex(c[1]) + toHex(c[2]) + "ff";
  }

  function nomeArquivoSaida(nomeOriginal) {
    return nomeOriginal.replace(/\.(stl|3mf)$/i, "") + "-colorido.3mf";
  }

  function baixarBlob(blob, nomeArquivo) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const NS_MATERIAL = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";

  function filhoDireto(el, tag) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) return n;
    }
    return null;
  }

  function filhosDiretos(el, tag) {
    const out = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) out.push(n);
    }
    return out;
  }

  // Compara pelo nome local (ignorando prefixo de namespace) — necessário para
  // achar <m:colorgroup> já existentes no arquivo, cujo prefixo pode variar
  // (ou nem existir, se o pacote original declarou a extensão com outro
  // prefixo/namespace default).
  function filhosDiretosPorNomeLocal(el, nomeLocal) {
    const out = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 1 && n.localName && n.localName.toLowerCase() === nomeLocal) out.push(n);
    }
    return out;
  }

  function acharObjectPorId(doc, objectId) {
    const objetos = doc.getElementsByTagName("object");
    for (let i = 0; i < objetos.length; i++) {
      if (objetos[i].getAttribute("id") === String(objectId)) return objetos[i];
    }
    return null;
  }

  // Bambu Studio/OrcaSlicer ignoram o pid/p1 padrão do 3MF (extensão de
  // materiais) em pacotes que reconhecem como projeto nativo, e só pintam a
  // partir do atributo proprietário "paint_color" (mesma serialização do
  // slic3rpe:mmu_segmentation do PrusaSlicer). Para um triângulo inteiro e não
  // dividido, o valor é: 2 bits de "não dividido" (00) + o estado (índice do
  // slot de filamento, 1-based; valores 0-2 cabem em 2 bits, valores >=3 usam
  // um "escape" 11 seguido de nibbles de extensão, cada 0xF valendo +15 até o
  // nibble final somar o resto) — tudo em uma string hex com os nibbles em
  // ordem invertida (o último caractere é o primeiro nibble do fluxo).
  function filamentIndexParaPaintColor(indice1Based) {
    const nibbles = [];
    if (indice1Based < 3) {
      nibbles.push(indice1Based << 2);
    } else {
      nibbles.push(3 << 2);
      let resto = indice1Based - 3;
      while (resto >= 15) {
        nibbles.push(15);
        resto -= 15;
      }
      nibbles.push(resto);
    }
    return nibbles
      .reverse()
      .map((n) => n.toString(16).toUpperCase())
      .join("");
  }

  function rgbParaHexBambu(c) {
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return ("#" + toHex(c[0]) + toHex(c[1]) + toHex(c[2])).toUpperCase();
  }

  // Monta a paleta final de filamentos: o slot 1 é sempre o cinza default (é
  // nele que caem os triângulos não pintados, já que ficam sem paint_color e
  // usam o extrusor/filamento padrão do objeto) e os slots seguintes são as
  // cores efetivamente pintadas nesta ferramenta, na ordem em que aparecem.
  // Sem isso, o slot 1 acabava sendo a primeira cor pintada e as áreas não
  // pintadas eram exibidas com essa cor em vez de cinza.
  function coresPintadasGlobal() {
    const slotPorCor = new Map();
    const paleta = [DEFAULT_COLOR];
    for (let t = 0; t < state.triCount; t++) {
      const r = state.baseColors[t * 3], g = state.baseColors[t * 3 + 1], b = state.baseColors[t * 3 + 2];
      if (r === DEFAULT_COLOR[0] && g === DEFAULT_COLOR[1] && b === DEFAULT_COLOR[2]) continue;
      const chave = r + "," + g + "," + b;
      if (!slotPorCor.has(chave)) {
        slotPorCor.set(chave, paleta.length + 1);
        paleta.push([r, g, b]);
      }
    }
    return { paleta, slotPorCor };
  }

  // Reconstrói Metadata/project_settings.config para ter exatamente um slot de
  // filamento por cor da paleta (slot 1 = cinza default, os demais = cores
  // pintadas) — em vez de aproximar a pintura aos slots de AMS que já
  // existiam no projeto. Todo ajuste de configuração que não seja a própria
  // cor (perfil de temperatura, tipo de material, id do preset etc.) é clonado
  // do slot 0 original, que no fluxo do Bambu Studio já é o "Bambu PLA Basic"
  // — assim os novos slots herdam o mesmo preset/perfil de impressora do
  // projeto, sem a ferramenta precisar adivinhar qual variante do PLA Basic
  // usar.
  function reconstruirProjectSettings(cfgOriginal, paleta) {
    const nAntigo = Array.isArray(cfgOriginal.filament_colour) ? cfgOriginal.filament_colour.length : 0;
    if (!nAntigo) return null;

    const cfg = JSON.parse(JSON.stringify(cfgOriginal));
    const n = paleta.length;

    Object.keys(cfg).forEach((chave) => {
      const valor = cfg[chave];
      if (Array.isArray(valor) && valor.length === nAntigo) {
        cfg[chave] = new Array(n).fill(valor[0]);
      }
    });

    cfg.filament_colour = paleta.map(rgbParaHexBambu);
    cfg.filament_multi_colour = cfg.filament_colour.slice();
    cfg.filament_colour_type = new Array(n).fill("1");
    cfg.filament_self_index = paleta.map((_, i) => String(i + 1));
    cfg.filament_map = new Array(n).fill("1");

    return cfg;
  }

  // Ajusta, no texto do Metadata/model_settings.config, as listas
  // filament_maps/filament_volume_maps (uma entrada por slot de filamento)
  // para o novo número de slots, e força o extrusor/filamento padrão de cada
  // object para o slot 1 (o cinza) — o slot original podia apontar para um
  // índice que deixou de existir (ou que agora é outra cor) depois da
  // reconstrução da paleta.
  function ajustarFilamentMapsNoModelSettings(xmlText, n) {
    const mapaFilamentos = new Array(n).fill("1").join(" ");
    const mapaVolumes = new Array(n).fill("0").join(" ");
    return xmlText
      .replace(/(<metadata\s+key="filament_maps"\s+value=")[^"]*(")/g, "$1" + mapaFilamentos + "$2")
      .replace(/(<metadata\s+key="filament_volume_maps"\s+value=")[^"]*(")/g, "$1" + mapaVolumes + "$2")
      .replace(/(<metadata\s+key="extruder"\s+value=")[^"]*(")/g, "$11$2");
  }

  // Edita, no texto XML de um dos arquivos .model do pacote original, só os
  // <triangle> das regiões pintadas (adiciona pid/p1 e um <m:colorgroup> novo
  // com id que não colida com nenhum recurso já existente nesse arquivo, e,
  // quando o pacote tem slots de filamento configurados, também paint_color —
  // sem o qual Bambu Studio/OrcaSlicer não mostram a cor). Tudo mais no XML
  // (metadados, outros objects, extensões desconhecidas) permanece intacto.
  function injetarCoresNoXml(xmlText, porObjeto, slotPorCor) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const modelEl = doc.documentElement;

    if (!modelEl.getAttribute("xmlns:m")) {
      modelEl.setAttribute("xmlns:m", NS_MATERIAL);
    }

    const resourcesEl = filhoDireto(modelEl, "resources");
    if (!resourcesEl) return xmlText;

    const idsUsados = new Set();
    (function coletarIds(el) {
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 1) {
          const id = n.getAttribute && n.getAttribute("id");
          if (id) idsUsados.add(id);
          coletarIds(n);
        }
      }
    })(resourcesEl);

    let colorGroupId = 900001;
    while (idsUsados.has(String(colorGroupId))) colorGroupId++;

    const colorToIndex = new Map();
    const cores = [];
    function indiceDaCor(r, g, b) {
      const chave = r + "," + g + "," + b;
      let idx = colorToIndex.get(chave);
      if (idx === undefined) {
        idx = cores.length;
        cores.push([r, g, b]);
        colorToIndex.set(chave, idx);
      }
      return idx;
    }

    porObjeto.forEach((lista, objectId) => {
      const objectEl = acharObjectPorId(doc, objectId);
      if (!objectEl) return;
      const meshEl = filhoDireto(objectEl, "mesh");
      if (!meshEl) return;
      const trianglesEl = filhoDireto(meshEl, "triangles");
      if (!trianglesEl) return;
      const triEls = filhosDiretos(trianglesEl, "triangle");
      lista.forEach(({ localIndex, r, g, b }) => {
        const triEl = triEls[localIndex];
        if (!triEl) return;
        const pIndex = indiceDaCor(r, g, b);
        triEl.setAttribute("pid", String(colorGroupId));
        triEl.setAttribute("p1", String(pIndex));
        // Sempre limpa o paint_color que já existia no triângulo (pintura
        // feita antes, direto no Bambu Studio) para a exportação refletir só
        // o que foi pintado nesta ferramenta — sem misturar as duas pinturas.
        triEl.removeAttribute("paint_color");
        const foiPintado = r !== DEFAULT_COLOR[0] || g !== DEFAULT_COLOR[1] || b !== DEFAULT_COLOR[2];
        if (slotPorCor && foiPintado) {
          const slot = slotPorCor.get(r + "," + g + "," + b);
          if (slot) triEl.setAttribute("paint_color", filamentIndexParaPaintColor(slot));
        }
      });
    });

    if (cores.length) {
      const colorGroupEl = doc.createElementNS(NS_MATERIAL, "m:colorgroup");
      colorGroupEl.setAttribute("id", String(colorGroupId));
      cores.forEach((c) => {
        const colorEl = doc.createElementNS(NS_MATERIAL, "m:color");
        colorEl.setAttribute("color", rgbToHex3mf(c));
        colorGroupEl.appendChild(colorEl);
      });
      resourcesEl.insertBefore(colorGroupEl, resourcesEl.firstChild);
    }

    // Limpa colorgroups órfãos: qualquer <m:colorgroup> que já existia no
    // arquivo (do pacote original ou de uma exportação anterior desta mesma
    // ferramenta) e cujo id não é mais referenciado por nenhum pid no
    // documento — sem isso, cada export acumula um novo colorgroup morto no
    // <resources>. Preserva colorgroups ainda referenciados por outra coisa
    // (ex.: pid de object para cor padrão do objeto inteiro).
    const pidsEmUso = new Set();
    (function coletarPids(el) {
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 1) {
          const pid = n.getAttribute && n.getAttribute("pid");
          if (pid) pidsEmUso.add(pid);
          coletarPids(n);
        }
      }
    })(modelEl);
    filhosDiretosPorNomeLocal(resourcesEl, "colorgroup").forEach((cg) => {
      const id = cg.getAttribute("id");
      if (id && !pidsEmUso.has(id)) resourcesEl.removeChild(cg);
    });

    // Serializar o Document inteiro (em vez de só o elemento raiz) já inclui
    // a declaração <?xml ...?> em navegadores baseados em Chromium — repeti-la
    // aqui geraria uma segunda declaração e um XML inválido.
    const serializado = new XMLSerializer().serializeToString(doc);
    return /^<\?xml/.test(serializado) ? serializado : '<?xml version="1.0" encoding="UTF-8"?>\n' + serializado;
  }

  // Caminho usado quando o arquivo de origem é um .3mf: reabre o zip
  // original e escreve as cores diretamente nos <triangle> de onde vieram,
  // sem tocar em Metadata/, thumbnails ou qualquer outro arquivo do pacote —
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

    const configEntry = zip.file(/(^|\/)project_settings\.config$/i)[0];
    const configPromise = configEntry
      ? configEntry.async("text").then((texto) => {
          try {
            const cfgOriginal = JSON.parse(texto);
            const novoCfg = reconstruirProjectSettings(cfgOriginal, paleta);
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

    const modelSettingsEntry = zip.file(/(^|\/)model_settings\.config$/i)[0];

    const tarefas = configPromise.then((numSlots) => {
      const slotPorCorAtivo = numSlots ? slotPorCor : null;
      const ajustesModelSettings = modelSettingsEntry
        ? modelSettingsEntry
            .async("text")
            .then((xmlText) => {
              zip.file(modelSettingsEntry.name, ajustarFilamentMapsNoModelSettings(xmlText, numSlots || 1));
            })
        : Promise.resolve();

      return Promise.all([
        ajustesModelSettings,
        ...Array.from(porArquivo.keys()).map((path) => {
          const entry = zip.file(path);
          if (!entry) return Promise.resolve();
          return entry.async("text").then((xmlText) => {
            zip.file(path, injetarCoresNoXml(xmlText, porArquivo.get(path), slotPorCorAtivo));
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

    const colorToIndex = new Map();
    const cores = [];
    function indiceDaCor(r, g, b) {
      const chave = r + "," + g + "," + b;
      let idx = colorToIndex.get(chave);
      if (idx === undefined) {
        idx = cores.length;
        cores.push([r, g, b]);
        colorToIndex.set(chave, idx);
      }
      return idx;
    }

    const linhasTriangulos = new Array(state.triCount);
    for (let t = 0; t < state.triCount; t++) {
      const v1 = state.cornerExportIndex[t * 3];
      const v2 = state.cornerExportIndex[t * 3 + 1];
      const v3 = state.cornerExportIndex[t * 3 + 2];
      const r = state.baseColors[t * 3], g = state.baseColors[t * 3 + 1], b = state.baseColors[t * 3 + 2];
      const pIndex = indiceDaCor(r, g, b);
      linhasTriangulos[t] = '<triangle v1="' + v1 + '" v2="' + v2 + '" v3="' + v3 + '" pid="1" p1="' + pIndex + '"/>';
    }

    const linhasVertices = state.exportVertices.map((v) => '<vertex x="' + v[0] + '" y="' + v[1] + '" z="' + v[2] + '"/>');
    const linhasCores = cores.map((c) => "<m:color color=\"" + rgbToHex3mf(c) + "\"/>");

    const modelXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n' +
      "  <resources>\n" +
      '    <m:colorgroup id="1">\n' +
      linhasCores.map((l) => "      " + l + "\n").join("") +
      "    </m:colorgroup>\n" +
      '    <object id="2" type="model">\n' +
      "      <mesh>\n" +
      "        <vertices>\n" +
      linhasVertices.map((l) => "          " + l + "\n").join("") +
      "        </vertices>\n" +
      "        <triangles>\n" +
      linhasTriangulos.map((l) => "          " + l + "\n").join("") +
      "        </triangles>\n" +
      "      </mesh>\n" +
      "    </object>\n" +
      "  </resources>\n" +
      "  <build>\n" +
      '    <item objectid="2"/>\n' +
      "  </build>\n" +
      "</model>\n";

    const contentTypesXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
      "</Types>\n";

    const relsXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
      "</Relationships>\n";

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
    paletaNovaCorInput.value = PALETA_PRESETS[state.paleta.length % PALETA_PRESETS.length];
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

  recentralizarBtn.addEventListener("click", () => recentralizarVista());
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
