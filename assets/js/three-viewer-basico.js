// ---------------------------------------------------------------------------
// BLOCO: viewer Three.js básico compartilhado (Colorir 3MF, Split 3MF).
// Câmera + luzes, OrbitControls restrito a pan (botão direito), trackball
// manual pra girar o próprio objeto (botão esquerdo), zoom em direção ao
// ponto sob o cursor, loop de render sob demanda, enquadramento/recentralizar
// e resize. Extraído de colorir-3mf.js (Task 11) sem mudar comportamento:
// o que é específico de cada ferramenta (cores, seleção, abas de chapa) fica
// no módulo da ferramenta, que só chama a API devolvida por
// criarViewerBasico.
//
// Carregado via importmap ("wisky3d/three-viewer-basico.js", com ?v=hash de
// cache-busting), não por caminho relativo: o service worker do site
// (sw-orcamento.js) serve qualquer GET do cache antes da rede, então uma URL
// sem versão ficaria presa na versão antiga após um deploy.
// ---------------------------------------------------------------------------
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// A partir desse número de triângulos as ferramentas mostram o aviso de
// "modelo grande" sobre o canvas.
export const AVISO_TRIANGULOS_GRANDE = 150000;

// Cor de destaque (seleção), misturada 50/50 com a cor base do triângulo.
export const HIGHLIGHT_COLOR = [255, 214, 51];

// Normal de face por triângulo a partir de posições não-indexadas
// (Float32Array(triCount*9)).
export function computeFaceNormals(positions, triCount) {
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

export function expandFaceNormalsToCorners(faceNormals, triCount) {
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

// Mesh não-indexada com cor sólida por triângulo: atributos position,
// normal (de face, flat shading) e color (zerado; preencher com
// aplicarCoresComDestaque).
export function criarMeshTriangulos(positions, faceNormals, triCount) {
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

  return new THREE.Mesh(geometry, material);
}

// Reescreve o atributo "color" da geometria a partir de baseColors
// (Uint8ClampedArray(triCount*3), 0-255), misturando HIGHLIGHT_COLOR nos
// triângulos em que destacado(t) for verdadeiro. Só visual: baseColors não é
// alterado. Quem chama deve pedir um novo frame (viewer.requestRender()).
export function aplicarCoresComDestaque(geometry, triCount, baseColors, destacado) {
  const colorAttr = geometry.getAttribute("color");
  const arr = colorAttr.array;
  for (let t = 0; t < triCount; t++) {
    let r = baseColors[t * 3];
    let g = baseColors[t * 3 + 1];
    let b = baseColors[t * 3 + 2];
    if (destacado(t)) {
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
}

// Preview de um plano de corte (Split 3MF, Task 14): um quadrado
// semi-transparente com borda, criado uma vez só e reaproveitado — cada
// atualização mexe só na transformação (posição/rotação/escala), sem recriar
// geometria nem material. Deve ser anexado como filho da mesh exibida
// (anexarA(viewer.mesh)) pra girar junto com o trackball; como o raycast do
// viewer não é recursivo, o plano nunca intercepta cliques na malha.
// atualizar(normal, ponto, tamanho): normal/ponto [x,y,z] no espaço local da
// mesh (mesmo formato de MeshClip.definirPlanoDeCorte), tamanho = lado do
// quadrado.
export function criarPreviewDePlano() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x3fa9f5,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const plano = new THREE.Mesh(geometry, material);
  const bordaGeometry = new THREE.EdgesGeometry(geometry);
  const bordaMaterial = new THREE.LineBasicMaterial({ color: 0x3fa9f5 });
  plano.add(new THREE.LineSegments(bordaGeometry, bordaMaterial));
  plano.renderOrder = 1;
  plano.visible = false;

  const EIXO_Z = new THREE.Vector3(0, 0, 1);
  const normalTmp = new THREE.Vector3();

  function atualizar(normal, ponto, tamanho) {
    normalTmp.set(normal[0], normal[1], normal[2]).normalize();
    plano.quaternion.setFromUnitVectors(EIXO_Z, normalTmp);
    plano.position.set(ponto[0], ponto[1], ponto[2]);
    plano.scale.set(tamanho, tamanho, 1);
    plano.visible = true;
  }

  function esconder() {
    plano.visible = false;
  }

  function anexarA(pai) {
    if (plano.parent === pai) return;
    if (plano.parent) plano.parent.remove(plano);
    if (pai) pai.add(plano);
  }

  function dispose() {
    anexarA(null);
    geometry.dispose();
    material.dispose();
    bordaGeometry.dispose();
    bordaMaterial.dispose();
  }

  return { objeto: plano, atualizar, esconder, anexarA, dispose };
}

// Cria o viewer sobre `canvasEl` (cujo parentElement define a largura).
// opcoes.onClique(evento): chamado num clique "de verdade" (pointerup a até
// 5px do pointerdown, ou seja, não foi arraste de giro/pan).
//
// Retorna:
//   scene, camera, renderer, controls, mesh (getter, a mesh atual ou null)
//   setMesh(mesh)        troca a mesh exibida (descarta a anterior), zera o
//                        giro e fixa o pivô do trackball no centro da esfera
//                        envolvente da geometria
//   frameToGeometry()    ajusta near/far/min/maxDistance ao raio da geometria
//                        e recentraliza
//   focarEm(pivotLocal, raio)  move o pivô (espaço local da mesh) e o raio de
//                        referência pra uma sub-região e recentraliza nela
//   getPivotLocal()      cópia do pivô atual em espaço local (ou null)
//   getRaio()            raio de referência atual
//   recentralizarVista() enquadramento padrão, sem desfazer o giro do objeto
//   intersect(evento)    raycast do ponto do evento contra a mesh atual
//   requestRender()      marca que o próximo frame precisa ser desenhado
//   resize()             reajusta renderer/câmera ao tamanho do wrapper
//   destroy()            remove listeners, para o loop e libera recursos
export function criarViewerBasico(canvasEl, opcoes) {
  const onClique = opcoes && opcoes.onClique;

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d47, 1.15));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(1, 1.6, 1.2);
  scene.add(dirLight);

  let mesh = null;
  let needsRender = true;
  let modelRadius = 1; // raio da esfera envolvente do modelo (ou da região em foco)
  let rafId = null;

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

  function intersect(e) {
    if (!mesh) return [];
    const ndc = ndcFromEvent(e);
    pointerNdc.x = ndc.x;
    pointerNdc.y = ndc.y;
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObject(mesh, false);
  }

  function onPointerDown(e) {
    pointerDownPos = [e.clientX, e.clientY];
    if (e.button === 0 && mesh) {
      trackballDrag = { ndc0: ndcFromEvent(e), qStart: mesh.quaternion.clone() };
      canvasEl.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e) {
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
  }

  function onPointerCancel() {
    trackballDrag = null;
  }

  function onPointerUp(e) {
    trackballDrag = null;
    if (!pointerDownPos) return;
    const dx = e.clientX - pointerDownPos[0];
    const dy = e.clientY - pointerDownPos[1];
    pointerDownPos = null;
    if (Math.hypot(dx, dy) > 5) return; // foi arraste (girar), não clique
    if (onClique) onClique(e);
  }

  // Registrados ANTES do OrbitControls (que também escuta pointerdown/up no
  // mesmo canvas), preservando a ordem de disparo que o Colorir 3MF tinha
  // antes da extração (lá esses listeners eram ligados no load do módulo e o
  // OrbitControls só depois, no primeiro arquivo carregado).
  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointercancel", onPointerCancel);
  canvasEl.addEventListener("pointerup", onPointerUp);

  const controls = new OrbitControls(camera, renderer.domElement);
  // Sem inércia (o modelo para na hora que solta o botão) e zoom controlado
  // à mão (abaixo) pra aproximar/afastar em direção ao ponto sob o cursor.
  controls.enableDamping = false;
  controls.enableZoom = false;
  // O giro é feito à mão (ver bloco "Trackball" acima), estilo trackball: gira
  // o próprio objeto livremente em qualquer direção a partir do ponto
  // agarrado, sem o eixo vertical fixo do esquema padrão do OrbitControls
  // (que trava ao tentar virar o objeto de frente/costas a partir de um
  // ponto fora do eixo central). O OrbitControls fica só com o botão
  // direito (pan).
  controls.enableRotate = false;
  controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: THREE.MOUSE.PAN };
  function onControlsChange() {
    needsRender = true;
  }
  controls.addEventListener("change", onControlsChange);

  // Zoom em direção ao ponto sob o cursor (como no Bambu Studio), em vez de
  // sempre em direção ao centro do modelo: acha o ponto 3D sob o mouse (ou
  // usa o alvo da órbita se o raio não acertar a malha) e escala tanto a
  // posição da câmera quanto o alvo a partir desse pivô, mantendo o ponto
  // fixo na tela.
  function handleWheelZoom(e) {
    if (!mesh) return;
    e.preventDefault();

    const hits = intersect(e);
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
      const maxDistAlvoPivo = modelRadius * 1.5;
      const alvoOffset = controls.target.clone().sub(meshPivotWorld);
      const distAlvoPivo = alvoOffset.length();
      if (distAlvoPivo > maxDistAlvoPivo) {
        controls.target.copy(meshPivotWorld).addScaledVector(alvoOffset, maxDistAlvoPivo / distAlvoPivo);
      }
    }

    // Único limite de segurança: manter a distância câmera-alvo dentro de
    // [minDistance, maxDistance] (minDistance já garante que a câmera nunca
    // entra na esfera envolvente do modelo, ver aplicarLimitesPorRaio).
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

  canvasEl.addEventListener("wheel", handleWheelZoom, { passive: false });

  function resize() {
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
    rafId = requestAnimationFrame(animate);
    controls.update();
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  }

  // near/far e limites de distância da órbita proporcionais ao raio de
  // referência. minDistance >= raio da esfera envolvente: garante que a
  // câmera nunca consiga entrar no volume do modelo, mesmo em formas
  // não-esféricas (ex.: um cubo tem raio inscrito bem menor que o raio da
  // esfera circunscrita), evita a câmera atravessar a malha ao dar zoom
  // demais.
  function aplicarLimitesPorRaio(radius) {
    camera.near = Math.max(radius / 100, 0.01);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 1.05;
    controls.maxDistance = radius * 8;
  }

  function setMesh(novaMesh) {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    mesh = novaMesh;
    mesh.quaternion.identity();
    scene.add(mesh);

    // Pivô do trackball: o centro geométrico do modelo, fixo no mundo. O
    // objeto sempre gira em torno dele, não importa qual ponto você "agarra".
    mesh.geometry.computeBoundingSphere();
    meshPivotLocal = mesh.geometry.boundingSphere.center.clone();
    meshPivotWorld = meshPivotLocal.clone();
    updateMeshPivotPosition();
    needsRender = true;
  }

  function frameToGeometry() {
    mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    const radius = sphere.radius || 1;
    modelRadius = radius;
    aplicarLimitesPorRaio(radius);
    recentralizarVista();
  }

  // Move o pivô do trackball (e a referência do clamp de deriva do zoom, que
  // usa meshPivotWorld) pra `pivotLocal` (espaço local da mesh), usa `raio`
  // como raio de referência e recentraliza ali. Sem isso o clamp prenderia a
  // câmera perto do centro do modelo inteiro mesmo com uma sub-região
  // distante em foco.
  function focarEm(pivotLocal, raio) {
    mesh.updateMatrixWorld(true);
    meshPivotLocal = pivotLocal.clone();
    meshPivotWorld = mesh.localToWorld(pivotLocal.clone());
    modelRadius = raio;
    aplicarLimitesPorRaio(modelRadius);
    recentralizarVista();
  }

  // Reposiciona a câmera no enquadramento padrão, sem mexer no giro que o
  // usuário já deu no modelo, útil pra "se achar" de novo depois de perder o
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

  function requestRender() {
    needsRender = true;
  }

  function destroy() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener("resize", resize);
    canvasEl.removeEventListener("wheel", handleWheelZoom);
    canvasEl.removeEventListener("pointerdown", onPointerDown);
    canvasEl.removeEventListener("pointermove", onPointerMove);
    canvasEl.removeEventListener("pointercancel", onPointerCancel);
    canvasEl.removeEventListener("pointerup", onPointerUp);
    controls.removeEventListener("change", onControlsChange);
    controls.dispose();
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    }
    renderer.dispose();
  }

  window.addEventListener("resize", resize);
  resize();
  animate();

  return {
    scene,
    camera,
    renderer,
    controls,
    get mesh() {
      return mesh;
    },
    setMesh,
    frameToGeometry,
    focarEm,
    getPivotLocal() {
      return meshPivotLocal ? meshPivotLocal.clone() : null;
    },
    getRaio() {
      return modelRadius;
    },
    recentralizarVista,
    intersect,
    requestRender,
    resize,
    destroy
  };
}
