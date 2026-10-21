// ---------------------------------------------------------------------------
// BLOCO: Colorir 3MF. Pinta um STL sem cor no navegador (viewer Three.js +
// balde/seleção mágica por tolerância de curvatura) e exporta um .3mf com cor
// por triângulo (3MF Materials and Properties Extension: colorgroup + pid/p1).
// ---------------------------------------------------------------------------
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const root = document.getElementById("colorize3mf");
const modules = window.Wisky3D || {};

if (root && !(modules.ModelParser && modules.ThreeMFWriter && modules.ToolUtils && modules.ColorizeCalculations)) {
  const errorEl = document.getElementById("colorize3mf-error");
  errorEl.textContent = "Não foi possível carregar a ferramenta. Recarregue a página e tente novamente.";
  errorEl.hidden = false;
} else if (root) {
  const { ModelParser, ThreeMFWriter, ToolUtils, ColorizeCalculations } = modules;
  const {
    buildGeometryData,
    computeFaceNormals,
    expandFaceNormalsToCorners,
    buildAdjacencyAndExportIndex,
    floodFillByNormalTolerance,
    hexToRgb
  } = ColorizeCalculations;

  const dropzone = document.getElementById("colorize3mf-dropzone");
  const upload = document.getElementById("colorize3mf-upload");
  const loadingEl = document.getElementById("colorize3mf-loading");
  const errorEl = document.getElementById("colorize3mf-error");
  const panel = document.getElementById("colorize3mf-panel");
  const canvasEl = document.getElementById("colorize3mf-canvas");
  const largeWarningEl = document.getElementById("colorize3mf-large-warning");
  const largeWarningTextEl = document.getElementById("colorize3mf-large-warning-text");
  const largeWarningCloseBtn = document.getElementById("colorize3mf-large-warning-close");
  const toolBucketBtn = document.getElementById("colorize3mf-tool-bucket");
  const toolMagicBtn = document.getElementById("colorize3mf-tool-magic");
  const toleranceFieldEl = document.getElementById("colorize3mf-tolerance-field");
  const toleranceInput = document.getElementById("colorize3mf-tolerance");
  const toleranceValueEl = document.getElementById("colorize3mf-tolerance-value");
  const paletteListEl = document.getElementById("colorize3mf-palette-list");
  const paletteAddBtn = document.getElementById("colorize3mf-palette-add");
  const paletteNewColorInput = document.getElementById("colorize3mf-palette-new-color");
  const selectionActionsEl = document.getElementById("colorize3mf-selection-actions");
  const selectionCountEl = document.getElementById("colorize3mf-selection-count");
  const applySelectionBtn = document.getElementById("colorize3mf-apply-selection");
  const clearSelectionBtn = document.getElementById("colorize3mf-clear-selection");
  const undoBtn = document.getElementById("colorize3mf-undo");
  const resetBtn = document.getElementById("colorize3mf-reset");
  const exportBtn = document.getElementById("colorize3mf-export");
  const outEl = document.getElementById("colorize3mf-out");
  const recenterBtn = document.getElementById("colorize3mf-recenter");
  const tabsEl = document.getElementById("colorize3mf-tabs");

  const DEFAULT_COLOR = ThreeMFWriter.DEFAULT_COLOR;
  const HIGHLIGHT_COLOR = [255, 214, 51];
  const LARGE_TRIANGLE_WARNING = 150000;
  const MAX_UNDO = 20;
  const PALETTE_PRESETS = ["#3fb6e8", "#ff6b4a", "#8b7cf6", "#5cd65c", "#ffd633", "#ff4fa3", "#4dd0e1", "#ffa726"];

  const DEFAULT_COLOR_HEX = "#" + DEFAULT_COLOR.map(ThreeMFWriter.toHexByte).join("");
  // Tolerância fixa do balde: 0° exato só pega o triângulo clicado em malhas
  // orgânicas bem trianguladas (STL de scan/escultura), já que ali quase
  // nenhum triângulo vizinho tem normal idêntica, o clique parecia "não
  // pintar nada". Um valor pequeno cobre essa variação natural sem invadir
  // faces realmente distintas (uma quina reta muda a normal bem mais que
  // isso).
  const BUCKET_TOLERANCE_DEG = 8;
  const loads = ToolUtils.createSequencer();

  let currentTool = "bucket";
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let mesh = null;
  let needsRender = true;
  let modelRadius = 1; // raio da esfera envolvente do modelo, fixo desde o carregamento
  /*
   * Campos principais (o formato completo é montado em buildState):
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
  let state = null;
  // Exportação em andamento: as duas exportações gravariam no mesmo zip
  // (state.zip) ao mesmo tempo.
  let exporting = false;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function showLoading(active) {
    loadingEl.hidden = !active;
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
    const zoomStep = THREE.MathUtils.clamp(e.deltaY * 0.0015 * zoomSpeed, -0.6, 0.6);
    const factor = Math.exp(zoomStep);

    // Câmera e alvo escalam juntos em torno do pivô pelo mesmo fator: a
    // distância câmera-alvo muda exatamente por "factor", sem depender da
    // distância até o pivô (que pode ficar perto de zero e, se usada num
    // denominador, gera saltos numéricos gigantes; bug já visto em produção).
    camera.position.sub(pivot).multiplyScalar(factor).add(pivot);
    controls.target.sub(pivot).multiplyScalar(factor).add(pivot);

    // Trava de segurança: o alvo da órbita nunca pode se afastar demais do
    // centro fixo do modelo. Sem isso, uma sequência longa de zoom (sobretudo
    // perto do limite máximo, onde o raio às vezes deixa de acertar a malha)
    // podia fazer o alvo "andar" pra fora do modelo evento após evento, e a
    // câmera sempre reorienta pro alvo, então o erro se acumulava até o
    // modelo sumir da tela.
    if (meshPivotWorld) {
      const maxTargetPivotDist = modelRadius * 1.5;
      const targetOffset = controls.target.clone().sub(meshPivotWorld);
      const targetPivotDist = targetOffset.length();
      if (targetPivotDist > maxTargetPivotDist) {
        controls.target.copy(meshPivotWorld).addScaledVector(targetOffset, maxTargetPivotDist / targetPivotDist);
      }
    }

    // Único limite de segurança: manter a distância câmera-alvo dentro de
    // [minDistance, maxDistance] (minDistance já garante que a câmera nunca
    // entra na esfera envolvente do modelo, ver frameCameraToGeometry).
    // Importante: capturar o deslocamento ANTES de mexer em camera.position.
    // Encadear "camera.position.copy(target).add(camera.position.clone()...)"
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
    const width = wrap.clientWidth || 320;
    const height = Math.max(420, Math.round(width * 0.72));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  function animate() {
    requestAnimationFrame(animate);
    applyPendingTrackballMove();
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
    // circunscrita), evita a câmera atravessar a malha ao dar zoom demais.
    controls.minDistance = radius * 1.05;
    controls.maxDistance = radius * 8;
    recenterView();
  }

  // Reposiciona a câmera no enquadramento padrão, sem mexer no giro que o
  // usuário já deu no modelo, útil pra "se achar" de novo depois de perder o
  // objeto de vista com muito zoom/pan. meshPivotWorld é fixo desde a carga
  // do arquivo, então serve de referência estável mesmo com o objeto girado.
  function recenterView() {
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
      const rN = r / 255,
        gN = g / 255,
        bN = b / 255;
      for (let c = 0; c < 3; c++) {
        arr[base + c * 3] = rN;
        arr[base + c * 3 + 1] = gN;
        arr[base + c * 3 + 2] = bN;
      }
    }
    colorAttr.needsUpdate = true;
    needsRender = true;
  }

  // -------------------------------------------------------------------------
  // Paleta de cores usadas (numerada, ao estilo dos slots de cor do Bambu
  // Studio): cada slot é clicável (define a cor ativa pra pintar) e tem um
  // color picker nativo embutido pra editar a própria cor do slot.
  // -------------------------------------------------------------------------

  function activeColorHex() {
    if (!state || !state.palette.length) return PALETTE_PRESETS[0];
    return state.palette[state.activePaletteIndex].hex;
  }

  function renderPalette() {
    if (!state) return;
    paletteListEl.innerHTML = "";
    state.palette.forEach((color, i) => {
      const slot = document.createElement("div");
      slot.className = "colorize3mf-slot" + (i === state.activePaletteIndex ? " is-active" : "");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "colorize3mf-slot-btn";
      btn.style.background = color.hex;
      btn.textContent = String(i + 1);
      btn.setAttribute("aria-label", "Usar cor " + (i + 1));
      btn.setAttribute("aria-pressed", i === state.activePaletteIndex ? "true" : "false");
      btn.addEventListener("click", () => {
        state.activePaletteIndex = i;
        renderPalette();
      });

      const edit = document.createElement("input");
      edit.type = "color";
      edit.className = "colorize3mf-slot-edit";
      edit.value = color.hex;
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
        const oldHex = color.hex;
        const newHex = edit.value;
        color.hex = newHex;
        if (oldHex.toLowerCase() !== newHex.toLowerCase()) {
          recolorColor(hexToRgb(oldHex), hexToRgb(newHex));
        }
        renderPalette();
      });

      slot.appendChild(btn);
      slot.appendChild(edit);

      if (state.palette.length > 1) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "colorize3mf-slot-del";
        del.textContent = "×";
        del.setAttribute("aria-label", "Remover cor " + (i + 1));
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          recolorColor(hexToRgb(color.hex), DEFAULT_COLOR);
          state.palette.splice(i, 1);
          if (state.activePaletteIndex >= state.palette.length) state.activePaletteIndex = state.palette.length - 1;
          renderPalette();
        });
        slot.appendChild(del);
      }

      paletteListEl.appendChild(slot);
    });
  }

  function pushUndo() {
    state.undoStack.push(state.baseColors.slice());
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    undoBtn.disabled = false;
  }

  function undo() {
    if (!state || !state.undoStack.length) return;
    state.baseColors = state.undoStack.pop();
    refreshColorBuffer();
    undoBtn.disabled = state.undoStack.length === 0;
  }

  function paintTriangles(triList, rgb) {
    pushUndo();
    const paint = (t) => {
      state.baseColors[t * 3] = rgb[0];
      state.baseColors[t * 3 + 1] = rgb[1];
      state.baseColors[t * 3 + 2] = rgb[2];
    };
    for (let i = 0; i < triList.length; i++) {
      paint(triList[i]);
      if (state.copies) ModelParser.forEachCopy(state.copies, triList[i], paint);
    }
    refreshColorBuffer();
  }

  // Troca em lote: acha todo triângulo já pintado com "from" e repinta com
  // "to". Usado ao editar a cor de um slot da paleta, pra que a mudança
  // valha pras áreas já pintadas com a cor antiga, não só pras próximas.
  function recolorColor(from, to) {
    if (!state) return;
    const targets = [];
    for (let t = 0; t < state.triCount; t++) {
      if (
        state.baseColors[t * 3] === from[0] &&
        state.baseColors[t * 3 + 1] === from[1] &&
        state.baseColors[t * 3 + 2] === from[2]
      ) {
        targets.push(t);
      }
    }
    if (targets.length) paintTriangles(targets, to);
  }

  // -------------------------------------------------------------------------
  // Ferramentas de pintura
  // -------------------------------------------------------------------------

  function setTool(tool) {
    currentTool = tool;
    toolBucketBtn.classList.toggle("is-active", tool === "bucket");
    toolBucketBtn.setAttribute("aria-checked", tool === "bucket" ? "true" : "false");
    toolMagicBtn.classList.toggle("is-active", tool === "magic");
    toolMagicBtn.setAttribute("aria-checked", tool === "magic" ? "true" : "false");
    selectionActionsEl.hidden = tool !== "magic";
    // Tolerância só faz sentido pra seleção mágica (agrupar curvas em vários
    // cliques); o balde sempre pinta só a face plana clicada (tolerância 0).
    toleranceFieldEl.hidden = tool !== "magic";
    if (state && state.selection.size) {
      state.selection.clear();
      refreshColorBuffer();
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    if (!state) return;
    const n = state.selection.size;
    selectionCountEl.textContent = n
      ? n + (n === 1 ? " triângulo selecionado" : " triângulos selecionados")
      : "Nenhuma seleção ainda";
    applySelectionBtn.disabled = n === 0;
    clearSelectionBtn.disabled = n === 0;
  }

  // -------------------------------------------------------------------------
  // Abas de chapa (3MF multi-plate): barra "Todos" + uma aba por chapa. Fica
  // oculta quando o arquivo não tem metadado de chapa (state.plates === null,
  // o caso mais comum hoje: STL ou 3MF de uma chapa só), preservando o
  // comportamento anterior à risca.
  // -------------------------------------------------------------------------

  function renderPlateTabs() {
    if (!state || !state.plates) {
      tabsEl.hidden = true;
      tabsEl.innerHTML = "";
      return;
    }

    tabsEl.innerHTML = "";
    tabsEl.hidden = false;

    function createTab(index, label) {
      const active = state.activePlateIndex === index;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "colorize3mf-tab" + (active ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.dataset.plate = index === null ? "" : String(index);
      btn.textContent = label;
      btn.addEventListener("click", () => setActivePlate(index));
      return btn;
    }

    tabsEl.appendChild(createTab(null, "Todos"));
    state.plates.forEach((plate) => {
      tabsEl.appendChild(createTab(plate.index, "Modelo " + plate.index));
    });
  }

  // Reescreve, em cada triângulo, a posição real (chapa visível) ou um ponto
  // degenerado (chapa oculta: os 3 vértices colapsam no pivô do modelo, área
  // zero -> invisível e não raycastável de forma útil). Não mexe em
  // baseColors/cor nem na câmera: trocar de aba não perde pintura já feita
  // nem reseta o enquadramento que o usuário escolheu.
  function applyVisibilityFilter() {
    if (!state) return;
    const posArr = state.geometry.attributes.position.array;

    if (state.activePlateIndex === null || !state.plates) {
      posArr.set(state.originalPositions);
    } else {
      const visible = state.trianglesByPlate && state.trianglesByPlate.get(state.activePlateIndex);
      const pivotX = meshPivotLocal ? meshPivotLocal.x : 0;
      const pivotY = meshPivotLocal ? meshPivotLocal.y : 0;
      const pivotZ = meshPivotLocal ? meshPivotLocal.z : 0;
      for (let t = 0; t < state.triCount; t++) {
        const base = t * 9;
        if (visible && visible.has(t)) {
          for (let i = 0; i < 9; i++) posArr[base + i] = state.originalPositions[base + i];
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
    needsRender = true;
  }

  // Bbox (em espaço local, a partir das posições reais em originalPositions)
  // dos triângulos da chapa `index`, usado só pra enquadrar a câmera nela.
  function computePlatePivotAndRadius(index) {
    const visible = state.trianglesByPlate && state.trianglesByPlate.get(index);
    if (!visible || !visible.size) return null;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    visible.forEach((t) => {
      const base = t * 9;
      for (let c = 0; c < 3; c++) {
        const x = state.originalPositions[base + c * 3];
        const y = state.originalPositions[base + c * 3 + 1];
        const z = state.originalPositions[base + c * 3 + 2];
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

  // Reenquadra a câmera na chapa ativa (ou no modelo inteiro, se `index` for
  // null), reaproveitando o mesmo esquema de near/far/min/maxDistance de
  // frameCameraToGeometry. Também move o pivô do trackball (meshPivotLocal/
  // meshPivotWorld) pra chapa em foco, senão o clamp de deriva do zoom (que
  // usa meshPivotWorld como referência) prenderia a câmera perto do centro do
  // modelo inteiro mesmo com uma chapa distante em foco.
  function updatePlateFocus(index) {
    mesh.updateMatrixWorld(true);
    let newPivotLocal = state.pivotLocalAll;
    let newRadius = state.radiusAll;
    if (index !== null) {
      const focus = computePlatePivotAndRadius(index);
      if (focus) {
        newPivotLocal = focus.pivotLocal;
        newRadius = focus.radius;
      }
    }
    meshPivotLocal = newPivotLocal.clone();
    meshPivotWorld = mesh.localToWorld(newPivotLocal.clone());
    modelRadius = newRadius;
    camera.near = Math.max(modelRadius / 100, 0.01);
    camera.far = modelRadius * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = modelRadius * 1.05;
    controls.maxDistance = modelRadius * 8;
    recenterView();
  }

  function setActivePlate(index) {
    if (!state) return;
    state.activePlateIndex = index;
    if (state.selection.size) {
      state.selection.clear();
    }
    applyVisibilityFilter();
    updatePlateFocus(index);
    renderPlateTabs();
    refreshColorBuffer();
    updateSelectionUI();
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
  // central, isso evita comportamento estranho perto das bordas.
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

  // O listener só guarda a posição mais recente; o cálculo de trigonometria/
  // quaternion (applyPendingTrackballMove) roda no máximo uma vez por frame,
  // dentro do loop de animate(), em vez de uma vez por evento de pointermove
  // bruto (o navegador pode disparar vários por frame durante um arraste
  // rápido, recalcular a rotação em cada um é trabalho redundante que nunca
  // chega a aparecer na tela).
  let pendingPointerMoveEvent = null;

  canvasEl.addEventListener("pointermove", (e) => {
    if (!trackballDrag || !mesh) return;
    pendingPointerMoveEvent = e;
  });

  function applyPendingTrackballMove() {
    if (!pendingPointerMoveEvent || !trackballDrag || !mesh) {
      pendingPointerMoveEvent = null;
      return;
    }
    const ndc1 = ndcFromEvent(pendingPointerMoveEvent);
    pendingPointerMoveEvent = null;
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
  }

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
    const isBucket = currentTool === "bucket";
    // Balde usa uma tolerância pequena fixa (não o slider, que é só da seleção
    // mágica) comparada sempre contra a normal do triângulo clicado. Cobre a
    // face plana clicada (e a granularidade fina de malhas orgânicas) sem
    // vazar pras faces vizinhas nem depender de deriva acumulada.
    const toleranceDeg = isBucket ? BUCKET_TOLERANCE_DEG : Number(toleranceInput.value);
    const visibleFilter =
      state.activePlateIndex !== null && state.trianglesByPlate
        ? state.trianglesByPlate.get(state.activePlateIndex)
        : null;
    const region = floodFillByNormalTolerance(
      triIndex,
      toleranceDeg,
      state.adjacency,
      state.faceNormals,
      state.triCount,
      isBucket,
      visibleFilter
    );

    if (currentTool === "bucket") {
      paintTriangles(region, hexToRgb(activeColorHex()));
    } else {
      region.forEach((t) => state.selection.add(t));
      refreshColorBuffer();
      updateSelectionUI();
    }
  }

  // -------------------------------------------------------------------------
  // Carregar STL/3MF e montar o estado/viewer
  // -------------------------------------------------------------------------

  function createGeometry(positions, faceNormals, triCount) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(expandFaceNormalsToCorners(faceNormals, triCount), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(triCount * 9), 3));
    return geometry;
  }

  function replaceMesh(geometry) {
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

    // Pivô do trackball: o centro geométrico do modelo, fixo no mundo. O
    // objeto sempre gira em torno dele, não importa qual ponto você "agarra".
    geometry.computeBoundingSphere();
    meshPivotLocal = geometry.boundingSphere.center.clone();
    meshPivotWorld = meshPivotLocal.clone();
    updateMeshPivotPosition();
  }

  function initialColors(triCount) {
    const baseColors = new Uint8ClampedArray(triCount * 3);
    for (let i = 0; i < triCount; i++) {
      baseColors[i * 3] = DEFAULT_COLOR[0];
      baseColors[i * 3 + 1] = DEFAULT_COLOR[1];
      baseColors[i * 3 + 2] = DEFAULT_COLOR[2];
    }
    return baseColors;
  }

  // mapTrianglesToPlates devolve arrays (ordem de varredura); aqui
  // viram Set pra permitir teste O(1) de pertencimento tanto no filtro de
  // visibilidade (applyVisibilityFilter) quanto no BFS de
  // balde/seleção mágica (floodFillByNormalTolerance).
  function trianglesByPlate(triangleOrigins, plates) {
    if (!plates) return null;
    const byPlate = new Map();
    ModelParser.mapTrianglesToPlates(triangleOrigins, plates).forEach((list, index) => {
      byPlate.set(index, new Set(list));
    });
    return byPlate;
  }

  function updateLargeModelWarning(triCount) {
    const large = triCount >= LARGE_TRIANGLE_WARNING;
    largeWarningEl.hidden = !large;
    if (large) {
      largeWarningTextEl.textContent =
        "Modelo com " +
        triCount.toLocaleString("pt-BR") +
        " triângulos, pintar regiões grandes pode ficar um pouco mais lento.";
    }
  }

  function buildState(triangles, fileName, origin) {
    initSceneOnce();

    const { triCount, positions } = buildGeometryData(triangles);
    // Cópia imutável das posições reais, capturada antes de qualquer filtro de
    // visibilidade por chapa (ver applyVisibilityFilter): é a fonte de
    // verdade usada tanto para restaurar "Todos" quanto para reescrever, na
    // troca de aba, os 9 floats de cada triângulo visível.
    const originalPositions = positions.slice();
    const faceNormals = computeFaceNormals(positions, triCount);
    const { adjacency, exportVertices, cornerExportIndex } = buildAdjacencyAndExportIndex(positions, triCount);
    const geometry = createGeometry(positions, faceNormals, triCount);
    replaceMesh(geometry);

    const triangleOrigins = (origin && origin.origins) || null;
    // Chapas (plates) detectadas num 3MF multi-plate (ver detectPlates em
    // processFile); null quando o arquivo não tem esse metadado (STL,
    // 3MF single-plate).
    const plates = (origin && origin.plates) || null;

    state = {
      fileName,
      triCount,
      faceNormals,
      adjacency,
      baseColors: initialColors(triCount),
      selection: new Set(),
      geometry,
      cornerExportIndex,
      exportVertices,
      undoStack: [],
      originalPositions,
      // O slot 1 começa com a mesma cor cinza do "não pintado" (DEFAULT_COLOR).
      // Assim dá pra recolorir de uma vez toda a área ainda não pintada só
      // trocando a cor desse slot (mesmo mecanismo de replace do editor de
      // paleta), sem precisar pintar triângulo por triângulo.
      palette: [{ hex: DEFAULT_COLOR_HEX }],
      activePaletteIndex: 0,
      // Presentes só quando o arquivo original é um .3mf: permitem, na
      // exportação, remendar o pacote original (preservando Metadata/,
      // thumbnails etc.) em vez de reconstruir tudo do zero.
      triangleOrigins,
      zip: (origin && origin.zip) || null,
      // Cópias de uma mesma malha (o mesmo object em dois <item>) pintam
      // juntas: no 3MF exportado elas têm uma cor só (ver mapMeshCopies).
      copies: triangleOrigins ? ModelParser.mapMeshCopies(triangleOrigins) : null,
      plates,
      activePlateIndex: null, // null = "Todos"
      trianglesByPlate: trianglesByPlate(triangleOrigins, plates)
    };

    renderPalette();
    refreshColorBuffer();
    frameCameraToGeometry();
    // Snapshot do pivô/raio de "Todos" (modelo inteiro), capturado logo após
    // frameCameraToGeometry (que os calculou a partir da geometria ainda sem
    // filtro nenhum aplicado) — usado por updatePlateFocus pra voltar a
    // esse enquadramento sempre que o usuário volta pra aba "Todos".
    state.pivotLocalAll = meshPivotLocal.clone();
    state.radiusAll = modelRadius;
    renderPlateTabs();
    updateLargeModelWarning(triCount);

    exportBtn.disabled = exporting;
    resetBtn.disabled = false;
    undoBtn.disabled = true;
    setTool("bucket");
    outEl.textContent = "";
  }

  // Erro de modelo grande demais: a mensagem vai inteira para o usuário (ver
  // processFile), em vez do "não foi possível ler esse arquivo".
  function limitError(count) {
    const error = new Error(
      "Modelo muito complexo para pintar no navegador (" +
        count.toLocaleString("pt-BR") +
        " triângulos, máx. " +
        (ToolUtils.MAX_TRIANGLES / 1e6).toLocaleString("pt-BR") +
        " milhões). Tente simplificar a malha."
    );
    error.limit = true;
    return error;
  }

  // Conta os triângulos antes de montar a malha: estourar o limite depois de
  // alocar milhões de arrays já poderia travar a aba.
  function extractTrianglesFromFile(file) {
    if (/\.stl$/i.test(file.name)) {
      return file.arrayBuffer().then((buffer) => {
        const count = ModelParser.countTrianglesSTL(buffer);
        if (count > ToolUtils.MAX_TRIANGLES) throw limitError(count);
        return { triangles: ModelParser.parseSTL(buffer), origins: null, zip: null };
      });
    }

    return ToolUtils.read3MFPackage(file)
      .then((pkg) => {
        if (!pkg.modelText) throw new Error("3dmodel.model não encontrado no pacote 3MF");
        // Com modificadores ou bloqueadores de suporte, a contagem prévia (que
        // inclui as partes que a extração deixa de fora) poderia recusar um
        // modelo que cabe: fica só a checagem depois da extração.
        if (ModelParser.hasNonSolidParts(pkg.modelSettingsText)) return pkg;
        return ModelParser.countTriangles3MF(pkg.zip, pkg.modelText, pkg.modelPath).then((count) => {
          if (count > ToolUtils.MAX_TRIANGLES) throw limitError(count);
          return pkg;
        });
      })
      .then((pkg) => {
        return ModelParser.extractTriangles3MF(pkg.zip, pkg.modelText, pkg.modelPath, pkg.modelSettingsText).then(
          (result) => ({
            triangles: result.triangles,
            origins: result.origins,
            zip: pkg.zip,
            modelSettingsText: pkg.modelSettingsText
          })
        );
      });
  }

  // Detecta as chapas (plates) de um pacote 3MF multi-plate a partir do texto
  // de Metadata/model_settings.config, casando cada objectId com o índice de
  // chapa a que pertence. Retorna null quando o arquivo não tem metadados de
  // chapa (STL, 3MF single-plate ou 3MF sem esse metadado), caso em que a
  // ferramenta continua se comportando como hoje (uma "chapa" implícita só).
  function detectPlates(modelSettingsText) {
    if (!modelSettingsText) return null;
    const plateAssignments = ModelParser.parsePlateAssignments(modelSettingsText);
    if (!plateAssignments) return null;
    return plateAssignments.map((objectIds, index) => ({
      index: index + 1,
      objectIds: new Set(objectIds)
    }));
  }

  function processFile(file) {
    if (!file) return;
    if (!/\.(stl|3mf)$/i.test(file.name)) {
      showError("Formato não suportado. Envie um arquivo .stl ou .3mf.");
      return;
    }

    const id = loads.next();
    showError("");
    showLoading(true);
    panel.hidden = true;

    extractTrianglesFromFile(file)
      .then((result) => {
        if (!loads.isCurrent(id)) return;
        if (!result.triangles.length) throw new Error("nenhuma geometria encontrada no arquivo");
        // A contagem prévia não multiplica objetos usados por dois <item>.
        if (result.triangles.length > ToolUtils.MAX_TRIANGLES) throw limitError(result.triangles.length);
        result.plates = detectPlates(result.modelSettingsText);
        buildState(result.triangles, file.name, result);
        panel.hidden = false;
        resizeRenderer();
        frameCameraToGeometry();
      })
      .catch((err) => {
        if (!loads.isCurrent(id)) return;
        if (err && err.limit) {
          showError(err.message);
          return;
        }
        if (window.console && console.error) console.error("Colorir 3MF:", err);
        const detail = err && err.message ? " (" + err.message + ")" : "";
        showError("Não foi possível ler esse arquivo. Confirme que é um .stl ou .3mf válido." + detail);
      })
      .then(() => {
        if (loads.isCurrent(id)) showLoading(false);
      });
  }

  // -------------------------------------------------------------------------
  // Exportação: cor por triângulo sempre via 3MF Materials and Properties
  // Extension (m:colorgroup + pid/p1). Se a origem foi um .3mf, remenda o
  // pacote original (preserva Metadata/, thumbnails etc.); se foi um .stl,
  // monta um pacote novo do zero.
  // -------------------------------------------------------------------------

  function outputFileName(originalName) {
    return originalName.replace(/\.(stl|3mf)$/i, "") + "-colorido.3mf";
  }

  function generateAndDownload(zip, outputName) {
    return zip
      .generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
      .then((blob) => {
        ModelParser.downloadBlob(blob, outputName);
        outEl.textContent = "3MF colorido baixado.";
      });
  }

  // Reescreve project_settings.config com a paleta final. Resolve com o
  // número de slots de filamento gravados, ou null se o arquivo não existe
  // ou não pôde ser ajustado.
  function updateProjectSettings(zip, palette) {
    const configEntry = ModelParser.findUniqueFile(zip, "project_settings.config");
    if (!configEntry) return Promise.resolve(null);
    return configEntry.async("text").then((text) => {
      try {
        const newCfg = ThreeMFWriter.rebuildProjectSettings(JSON.parse(text), palette);
        if (!newCfg) return null;
        zip.file(configEntry.name, JSON.stringify(newCfg, null, 4));
        return newCfg.filament_colour.length;
      } catch (e) {
        return null;
      }
    });
  }

  function updateModelSettings(zip, numSlots) {
    const entry = ModelParser.findUniqueFile(zip, "model_settings.config");
    if (!entry) return Promise.resolve();
    return entry.async("text").then((xmlText) => {
      zip.file(entry.name, ThreeMFWriter.adjustFilamentMapsInModelSettings(xmlText, numSlots || 1));
    });
  }

  function injectColorsIntoModels(zip, byFile, slotByColor) {
    return Promise.all(
      Array.from(byFile.keys()).map((path) => {
        const entry = zip.file(path);
        if (!entry) return Promise.resolve();
        return entry.async("text").then((xmlText) => {
          zip.file(path, ThreeMFWriter.injectColorsIntoXml(xmlText, byFile.get(path), slotByColor));
        });
      })
    );
  }

  // Caminho usado quando o arquivo de origem é um .3mf: reabre o zip
  // original e escreve as cores diretamente nos <triangle> de onde vieram,
  // sem tocar em Metadata/, thumbnails ou qualquer outro arquivo do pacote,
  // evita o aviso de "configuração inválida" do Bambu Studio, que aparece
  // quando o pacote deixa de parecer um projeto legítimo.
  function exportModelPreservingPackage(outputName) {
    const zip = state.zip;
    const byFile = ColorizeCalculations.groupColorsByFile(state.triangleOrigins, state.baseColors, state.triCount);
    const { palette, slotByColor } = ColorizeCalculations.exportPalette(
      state.baseColors,
      state.triCount,
      DEFAULT_COLOR
    );

    return updateProjectSettings(zip, palette)
      .then((numSlots) =>
        Promise.all([
          updateModelSettings(zip, numSlots),
          injectColorsIntoModels(zip, byFile, numSlots ? slotByColor : null)
        ])
      )
      .then(() => generateAndDownload(zip, outputName));
  }

  // Caminho usado quando o arquivo de origem é um .stl (não existe pacote
  // 3MF original pra preservar): monta um .3mf novo do zero via JSZip.
  function exportModelFromScratch(outputName) {
    const triangles = ColorizeCalculations.trianglesForExport(
      state.cornerExportIndex,
      state.baseColors,
      state.triCount
    );
    const { modelXml, contentTypesXml, relsXml } = ThreeMFWriter.buildModelFromScratch([
      { objectId: 2, vertices: state.exportVertices, triangles: triangles }
    ]);

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypesXml);
    zip.file("_rels/.rels", relsXml);
    zip.file("3D/3dmodel.model", modelXml);
    return generateAndDownload(zip, outputName);
  }

  function exportModel() {
    outEl.textContent = "Gerando arquivo 3MF...";
    // Tudo que vem de state é lido de forma síncrona (aqui e no início das
    // funções de exportação): se outro arquivo for carregado durante a
    // exportação, state passa a ser o dele.
    const outputName = outputFileName(state.fileName);
    if (state.zip && state.triangleOrigins) return exportModelPreservingPackage(outputName);
    return exportModelFromScratch(outputName);
  }

  // -------------------------------------------------------------------------
  // Eventos de UI
  // -------------------------------------------------------------------------

  ToolUtils.bindDropzone(dropzone, upload, processFile);

  toolBucketBtn.addEventListener("click", () => setTool("bucket"));
  toolMagicBtn.addEventListener("click", () => setTool("magic"));

  toleranceInput.addEventListener("input", () => {
    toleranceValueEl.textContent = toleranceInput.value + "°";
  });

  applySelectionBtn.addEventListener("click", () => {
    if (!state || !state.selection.size) return;
    const rgb = hexToRgb(activeColorHex());
    const triList = Array.from(state.selection);
    state.selection.clear();
    paintTriangles(triList, rgb);
    updateSelectionUI();
  });

  paletteAddBtn.addEventListener("click", () => {
    if (!state) return;
    // O slot 1 (índice 0) é o cinza default, não um preset. Os presets
    // começam a valer a partir do primeiro slot adicionado.
    paletteNewColorInput.value = PALETTE_PRESETS[(state.palette.length - 1) % PALETTE_PRESETS.length];
    paletteNewColorInput.click();
  });

  paletteNewColorInput.addEventListener("change", () => {
    if (!state) return;
    state.palette.push({ hex: paletteNewColorInput.value });
    state.activePaletteIndex = state.palette.length - 1;
    renderPalette();
  });

  clearSelectionBtn.addEventListener("click", () => {
    if (!state) return;
    state.selection.clear();
    refreshColorBuffer();
    updateSelectionUI();
  });

  recenterBtn.addEventListener("click", () => recenterView());
  largeWarningCloseBtn.addEventListener("click", () => {
    largeWarningEl.hidden = true;
  });

  undoBtn.addEventListener("click", () => undo());

  resetBtn.addEventListener("click", () => {
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
    if (!state || exporting) return;
    if (typeof JSZip === "undefined") {
      outEl.textContent = "Não foi possível carregar o gerador de 3MF. Verifique sua conexão e tente novamente.";
      return;
    }
    exporting = true;
    exportBtn.disabled = true;
    // Promise.resolve().then: um erro síncrono na montagem do arquivo (ex.:
    // string grande demais) também cai no catch, em vez de deixar o botão
    // desabilitado para sempre.
    Promise.resolve()
      .then(exportModel)
      .catch((err) => {
        if (window.console && console.error) console.error("Colorir 3MF:", err);
        outEl.textContent = "Não foi possível gerar o arquivo 3MF.";
      })
      .then(() => {
        exporting = false;
        exportBtn.disabled = !state;
      });
  });
}
