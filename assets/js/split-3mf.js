// ---------------------------------------------------------------------------
// BLOCO: Split 3MF. Separa um arquivo 3MF com várias chapas/objetos em
// arquivos individuais. Nesta etapa, o upload já detecta as unidades
// separáveis (chapas, se o pacote tiver Metadata/model_settings.config com
// mais de uma chapa; senão, um objeto de build de nível topo por unidade) e
// lista suas dimensões, com download por unidade/cor e uma visualização 3D
// (Task 11) em que cada unidade aparece com uma cor e pode ser selecionada
// com um clique. A Task 14 acrescenta o corte por plano: qualquer unidade (e,
// depois, qualquer peça resultante) pode ser cortada por um plano
// (MeshClip, mesh-clip.js), com preview do plano no viewer, cortes
// sucessivos e exportação das peças como .3mf gerado do zero.
//
// Carregado como <script type="module"> (split-3mf.html), mas sem import
// estático: os testes (test/split-3mf-*.test.js) avaliam este arquivo com
// `new Function(...)`, onde `import ... from` é erro de sintaxe. O viewer
// (three-viewer-basico.js, ES module que depende do Three.js via importmap)
// é carregado sob demanda com import() dinâmico, só quando um arquivo é
// aberto, e uma falha nele (CDN fora do ar, WebGL indisponível) só esconde a
// visualização 3D: a lista de unidades e os downloads continuam funcionando.
// ModelParser/ThreeMFWriter continuam vindo de window.Wisky3D (scripts
// clássicos com defer, que executam antes deste módulo, na ordem do HTML).
// ---------------------------------------------------------------------------
(function () {
  const root = document.getElementById("split3mf");

  if (root) {
    const ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
    const ThreeMFWriter = window.Wisky3D && window.Wisky3D.ThreeMFWriter;

    const dropzone = document.getElementById("split3mf-dropzone");
    const upload = document.getElementById("split3mf-upload");
    const loadingEl = document.getElementById("split3mf-loading");
    const erroEl = document.getElementById("split3mf-erro");
    const painel = document.getElementById("split3mf-painel");
    const listaEl = document.getElementById("split3mf-lista");
    const baixarTudoBtn = document.getElementById("split3mf-baixar-tudo");
    const canvasWrapEl = document.getElementById("split3mf-canvas-wrap");
    const canvasEl = document.getElementById("split3mf-canvas");
    const recentralizarBtn = document.getElementById("split3mf-recentralizar");
    const avisoGrandeEl = document.getElementById("split3mf-aviso-grande");
    const avisoGrandeTextoEl = document.getElementById("split3mf-aviso-grande-texto");
    const avisoGrandeFecharBtn = document.getElementById("split3mf-aviso-grande-fechar");
    const corteEl = document.getElementById("split3mf-corte");
    const corteAlvoEl = document.getElementById("split3mf-corte-alvo");
    const corteEixoEl = document.getElementById("split3mf-corte-eixo");
    const cortePosicaoEl = document.getElementById("split3mf-corte-posicao");
    const cortePosicaoValorEl = document.getElementById("split3mf-corte-posicao-valor");
    const corteInclinacaoEl = document.getElementById("split3mf-corte-inclinacao");
    const corteInclinacaoValorEl = document.getElementById("split3mf-corte-inclinacao-valor");
    const corteAfastarEl = document.getElementById("split3mf-corte-afastar");
    const cortarBtn = document.getElementById("split3mf-cortar");
    const descartarCortesBtn = document.getElementById("split3mf-descartar-cortes");
    const pecasEl = document.getElementById("split3mf-pecas");
    const pecasListaEl = document.getElementById("split3mf-pecas-lista");
    const baixarPecasBtn = document.getElementById("split3mf-baixar-pecas");

    // Especificador do importmap (split-3mf.html/colorir-3mf.html), que já
    // aponta pra URL com ?v=hash de cache-busting.
    const VIEWER_MODULO = "wisky3d/three-viewer-basico.js";

    // Estado do arquivo carregado. `unidades` é a lista de chapas ou objetos
    // detectados (ver detectarUnidadesDeSplit); populado depois que
    // processarArquivo termina de ler o pacote. null enquanto nada foi
    // carregado ainda.
    let state = null;

    function mostrarErro(msg) {
      erroEl.textContent = msg;
      erroEl.hidden = !msg;
    }

    function mostrarCarregando(ativo) {
      loadingEl.hidden = !ativo;
    }

    // Mesmo formato de bbox usado em orcamento.js/conversor-3mf.js
    // ("120.0 × 80.0 × 40.0 mm"), pra manter a leitura consistente entre as
    // ferramentas do site.
    function formatarBBoxMm(bbox) {
      if (!bbox) return "";
      const largura = (bbox.maxX - bbox.minX).toFixed(1);
      const profundidade = (bbox.maxY - bbox.minY).toFixed(1);
      const altura = (bbox.maxZ - bbox.minZ).toFixed(1);
      return largura + " × " + profundidade + " × " + altura + " mm";
    }

    // Decide o que vira "unidade separável" num pacote 3MF: se houver mais de
    // uma chapa em Metadata/model_settings.config, cada chapa é uma unidade
    // (modo "plates"); senão, cada item de build de nível topo é sua própria
    // unidade (modo "objects", cobre tanto 3MF de objeto único quanto 3MF
    // multi-objeto sem metadado de chapa).
    function detectarUnidadesDeSplit(zip, modelText, modelSettingsText) {
      return ModelParser.parse3MFPackage(zip, modelText).then(function (resultado) {
        const itens = resultado.itens;
        const plateAssignments = modelSettingsText
          ? ModelParser.parsePlateAssignments(modelSettingsText)
          : null;

        if (plateAssignments) {
          // Reaproveita ModelParser.calcularChapas (mesma função usada por
          // conversor-3mf.js) pra mesclar bbox por chapa a partir dos
          // objectIds — evita duplicar aqui a lógica de merge que já existe
          // e é testada em model-parser.js. `manterUnica: true` porque, ao
          // contrário do uso em conversor-3mf.js, o Split 3MF trata "sobrou
          // 1 chapa só com bbox válido" como caso normal, não como "não tem
          // chapa" (ver brief da Task 6).
          const chapas = ModelParser.calcularChapas(itens, plateAssignments, { manterUnica: true }) || [];
          const unidadesPlates = chapas.map(function (chapa) {
            return { id: chapa.indice - 1, rotulo: "Mesa " + chapa.indice, objectIds: chapa.objectIds, bbox: chapa.bbox };
          });
          return { modo: "plates", unidades: unidadesPlates };
        }

        const unidadesObjects = itens.map(function (item, i) {
          return { id: i, rotulo: "Objeto " + (i + 1), objectIds: [item.objectId], bbox: item.bbox };
        });
        return { modo: "objects", unidades: unidadesObjects };
      });
    }

    // Quadradinho de cor ao lado do título de um card (unidade ou grupo de
    // cor). Sem folha de CSS dedicada ao Split 3MF pra isso, então o
    // tamanho/formato é inline aqui mesmo — senão o <span> fica sem dimensão
    // e a amostra não aparece.
    function criarAmostraCor(rgb) {
      const amostra = document.createElement("span");
      amostra.className = "split3mf-cor-amostra";
      amostra.style.background = rgbParaHex(rgb);
      amostra.style.display = "inline-block";
      amostra.style.width = "14px";
      amostra.style.height = "14px";
      amostra.style.borderRadius = "3px";
      amostra.style.marginRight = "6px";
      amostra.style.verticalAlign = "middle";
      amostra.style.border = "1px solid rgba(0,0,0,0.15)";
      return amostra;
    }

    // Cor de identificação da unidade de índice `i` na visualização 3D (e na
    // amostra do card correspondente): matizes espaçados pelo ângulo áureo,
    // o que mantém cores vizinhas bem distintas pra qualquer número de
    // unidades, sem precisar de uma paleta fixa com tamanho máximo.
    function corDaUnidade(i) {
      const h = ((200 + i * 137.508) % 360) / 360;
      const sat = 0.6;
      const lum = 0.55;
      const q = lum + sat - lum * sat;
      const p = 2 * lum - q;
      function canal(t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }
      return [
        Math.round(canal(h + 1 / 3) * 255),
        Math.round(canal(h) * 255),
        Math.round(canal(h - 1 / 3) * 255)
      ];
    }

    // Popula #split3mf-lista com um card por unidade detectada (amostra da
    // cor da unidade no viewer + rótulo + dimensões + botão de download
    // individual + botão "Separar por cor"). Retorna os cards na mesma ordem
    // de `unidades`, pra destacar o card da unidade selecionada no viewer.
    function renderListaUnidades(unidades) {
      listaEl.innerHTML = "";
      const cards = [];
      unidades.forEach(function (unidade, indice) {
        const card = document.createElement("div");
        card.className = "split3mf-card";
        card.dataset.unidadeId = String(unidade.id);

        const titulo = document.createElement("div");
        titulo.className = "split3mf-card-titulo";
        titulo.appendChild(criarAmostraCor(corDaUnidade(indice)));
        titulo.appendChild(document.createTextNode(unidade.rotulo));
        card.appendChild(titulo);

        const dims = formatarBBoxMm(unidade.bbox);
        if (dims) {
          const dimsEl = document.createElement("div");
          dimsEl.className = "split3mf-card-dims";
          dimsEl.textContent = dims;
          card.appendChild(dimsEl);
        }

        const acoes = document.createElement("div");
        acoes.className = "split3mf-card-acoes";

        const baixarBtn = document.createElement("button");
        baixarBtn.type = "button";
        baixarBtn.className = "btn btn-secondary split3mf-card-baixar";
        baixarBtn.textContent = "Baixar";
        baixarBtn.addEventListener("click", function () {
          exportarUnidadePreservandoPacote(unidade).then(function (resultado) {
            ModelParser.baixarBlob(resultado.blob, resultado.nome);
          }).catch(function (err) {
            if (window.console && console.error) console.error("Split 3MF:", err);
            mostrarErro("Não foi possível gerar o arquivo dessa unidade.");
          });
        });
        acoes.appendChild(baixarBtn);

        const subunidadesEl = document.createElement("div");
        subunidadesEl.className = "split3mf-subunidades";
        subunidadesEl.hidden = true;

        const corBtn = document.createElement("button");
        corBtn.type = "button";
        corBtn.className = "btn btn-secondary split3mf-card-separar-cor";
        corBtn.textContent = "Separar por cor";
        corBtn.addEventListener("click", function () {
          corBtn.disabled = true;
          const textoOriginal = corBtn.textContent;
          corBtn.textContent = "Analisando cores...";
          separarUnidadePorCor(unidade).then(function (resultado) {
            renderSubunidadesDeCor(subunidadesEl, resultado, unidade);
            subunidadesEl.hidden = false;
          }).catch(function (err) {
            if (window.console && console.error) console.error("Split 3MF:", err);
            mostrarErro("Não foi possível separar essa unidade por cor.");
          }).then(function () {
            corBtn.disabled = false;
            corBtn.textContent = textoOriginal;
          });
        });
        acoes.appendChild(corBtn);

        card.appendChild(acoes);
        card.appendChild(subunidadesEl);

        listaEl.appendChild(card);
        cards.push(card);
      });
      return cards;
    }

    // Converte um array de triângulos (formato de ModelParser.parseSTL /
    // extractTriangles3MF: [[ [x,y,z], [x,y,z], [x,y,z] ], ...]) pro formato
    // plano Float32Array(triCount*9) que ModelParser.buildAdjacencyAndExportIndex
    // espera — mesmo layout que buildGeometryData monta em colorir-3mf.js,
    // reimplementado aqui em miniatura porque aquela função é local àquele
    // módulo (acoplada ao THREE.js/viewer) e não é exportada.
    function flattenTriangulos(triangulos) {
      const positions = new Float32Array(triangulos.length * 9);
      triangulos.forEach(function (tri, t) {
        const base = t * 9;
        for (let c = 0; c < 3; c++) {
          positions[base + c * 3] = tri[c][0];
          positions[base + c * 3 + 1] = tri[c][1];
          positions[base + c * 3 + 2] = tri[c][2];
        }
      });
      return positions;
    }

    // Une (via union-find) triângulos vizinhos que têm exatamente a mesma
    // cor, formando regiões de cor contígua. `adjacency` (ver
    // ModelParser.buildAdjacencyAndExportIndex) é a lista de triângulos
    // vizinhos por aresta compartilhada; `corPorTriangulo` (ver
    // ModelParser.lerCorPorTriangulo) é um Uint8ClampedArray(triCount*3) com
    // a cor RGB de cada triângulo. Retorna Map<raizDoGrupo, number[]> com os
    // índices de triângulo de cada grupo.
    function agruparPorCorContigua(adjacency, corPorTriangulo, triCount) {
      const parent = new Int32Array(triCount);
      for (let i = 0; i < triCount; i++) parent[i] = i;

      function find(i) {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]];
          i = parent[i];
        }
        return i;
      }

      function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      }

      function mesmaCor(a, b) {
        const ba = a * 3, bb = b * 3;
        return corPorTriangulo[ba] === corPorTriangulo[bb]
          && corPorTriangulo[ba + 1] === corPorTriangulo[bb + 1]
          && corPorTriangulo[ba + 2] === corPorTriangulo[bb + 2];
      }

      for (let t = 0; t < triCount; t++) {
        const vizinhos = adjacency[t] || [];
        for (let i = 0; i < vizinhos.length; i++) {
          const v = vizinhos[i];
          if (mesmaCor(t, v)) union(t, v);
        }
      }

      const grupos = new Map();
      for (let t = 0; t < triCount; t++) {
        const raiz = find(t);
        let lista = grupos.get(raiz);
        if (!lista) {
          lista = [];
          grupos.set(raiz, lista);
        }
        lista.push(t);
      }
      return grupos;
    }

    // Converte [r,g,b] (0-255) pra "#rrggbb", usado na amostra visual de cor
    // de cada sub-unidade.
    // objectid do <item> de build de nível topo de onde veio o triângulo
    // (o que as unidades guardam em objectIds); cai no objectId do próprio
    // object quando o parser não registrou topObjectId.
    function topObjectIdDe(origin) {
      return origin.topObjectId !== undefined ? origin.topObjectId : origin.objectId;
    }

    function rgbParaHex(rgb) {
      function byte(n) {
        return n.toString(16).padStart(2, "0");
      }
      return "#" + byte(rgb[0]) + byte(rgb[1]) + byte(rgb[2]);
    }

    // Monta, a partir de grupos de cor já calculados (Map<raiz, number[]> de
    // índices de triângulo, ver agruparPorCorContigua), um pacote 3MF novo do
    // zero com um <object> por grupo (Task 10). Reindexa os vértices de cada
    // grupo pra um espaço local (mesma técnica de "soldar" vértices por
    // posição quantizada de ModelParser.buildAdjacencyAndExportIndex — aqui
    // reaproveitada função a função, sem duplicar a quantização) e delega a
    // montagem do XML pra ThreeMFWriter.montarModeloDoZero, que já sabe gerar
    // <resources>/<build>/colorgroup compartilhado pra múltiplos objects.
    // `triangulos` é o array pleno (mesmo formato de parseSTL/extractTriangles3MF)
    // de onde os índices de cada grupo foram tirados; `corPorTriangulo` é o
    // Uint8ClampedArray(triCount*3) com a cor de cada um desses triângulos
    // (mesmo índice). Retorna `{ modelXml, contentTypesXml, relsXml }` (ver
    // ThreeMFWriter.montarModeloDoZero) — quem chama decide como empacotar
    // isso num .3mf de verdade (ver zipar3MFDoZero).
    function exportarGruposDeCorComoObjects(gruposDeCor, triangulos, corPorTriangulo) {
      let proximoObjectId = 1;
      const objetos = [];

      gruposDeCor.forEach(function (indices) {
        const triangulosDoGrupo = indices.map(function (i) { return triangulos[i]; });
        const positions = flattenTriangulos(triangulosDoGrupo);
        const { exportVertices, cornerExportIndex } = ModelParser.buildAdjacencyAndExportIndex(
          positions,
          triangulosDoGrupo.length
        );

        const primeiro = indices[0] * 3;
        const cor = [corPorTriangulo[primeiro], corPorTriangulo[primeiro + 1], corPorTriangulo[primeiro + 2]];

        const triangulosDoObjeto = [];
        for (let t = 0; t < triangulosDoGrupo.length; t++) {
          triangulosDoObjeto.push({
            v1: cornerExportIndex[t * 3],
            v2: cornerExportIndex[t * 3 + 1],
            v3: cornerExportIndex[t * 3 + 2],
            color: cor
          });
        }

        objetos.push({ objectId: proximoObjectId++, vertices: exportVertices, triangulos: triangulosDoObjeto });
      });

      return ThreeMFWriter.montarModeloDoZero(objetos);
    }

    // Empacota o resultado de montarModeloDoZero/exportarGruposDeCorComoObjects
    // (`{ modelXml, contentTypesXml, relsXml }`) num .3mf de verdade (mesma
    // estrutura mínima de pacote OPC usada em colorir-3mf.js na exportação a
    // partir de STL: [Content_Types].xml + _rels/.rels + 3D/3dmodel.model).
    // Diferente de exportarUnidadePreservandoPacote (Task 7), aqui não existe
    // pacote original pra copiar bytes: os grupos de cor não são objects reais
    // do arquivo de entrada, então o .3mf de saída é sempre gerado do zero.
    function zipar3MFDoZero(partes, nomeArquivo) {
      const zipNovo = new JSZip();
      zipNovo.file("[Content_Types].xml", partes.contentTypesXml);
      zipNovo.file("_rels/.rels", partes.relsXml);
      zipNovo.file("3D/3dmodel.model", partes.modelXml);
      return zipNovo.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
        .then(function (blob) {
          return { nome: nomeArquivo, blob: blob };
        });
    }

    // Exporta um único grupo de cor como seu próprio .3mf (1 object), pro
    // botão de download individual de cada sub-card de cor.
    function exportarGrupoDeCorIndividual(nomeBase, grupo, triangulos, corPorTriangulo) {
      const mapaUnico = new Map([[0, grupo.indices]]);
      const partes = exportarGruposDeCorComoObjects(mapaUnico, triangulos, corPorTriangulo);
      const slug = grupo.rotulo.toLowerCase().replace(/\s+/g, "-");
      return zipar3MFDoZero(partes, nomeBase + "-" + slug + ".3mf");
    }

    // Exporta todos os grupos de cor de uma unidade como um único .3mf com N
    // objects (um por grupo) — o caso "baixar tudo junto pra inspecionar no
    // fatiador" descrito na Task 10.
    function exportarTodosGruposDeCorComoArquivo(nomeBase, grupos, triangulos, corPorTriangulo) {
      const mapa = new Map(grupos.map(function (grupo, i) { return [i, grupo.indices]; }));
      const partes = exportarGruposDeCorComoObjects(mapa, triangulos, corPorTriangulo);
      return zipar3MFDoZero(partes, nomeBase + "-cores.3mf");
    }

    // Extrai os triângulos de uma unidade (filtrando por objectIds via
    // origin.topObjectId, mesmo campo que mapearTriangulosParaChapas usa pra
    // casar triângulo -> chapa), lê a cor real de cada um
    // (ModelParser.lerCorPorTriangulo, reaproveitando Metadata/
    // project_settings.config se existir) e agrupa por região de cor
    // contígua (agruparPorCorContigua). Resolve com
    // `{ grupos, triangulos, corPorTriangulo }`: `grupos` é um array de
    // `{ rotulo, cor, bbox, triangulos, indices }` (um por grupo, ordenado por
    // tamanho decrescente — grupo com mais triângulos primeiro, só pra dar
    // uma ordem estável e previsível na UI); `triangulos`/`corPorTriangulo`
    // são os arrays completos da unidade (mesmo índice de `indices` de cada
    // grupo), guardados aqui pra permitir exportar os grupos depois
    // (exportarGruposDeCorComoObjects) sem recalcular tudo de novo.
    function separarUnidadePorCor(unidade) {
      const idsUnidade = unidade.objectIds.map(String);

      return ModelParser.extractTriangles3MF(state.zip, state.modelText, state.modelPath).then(function (resultado) {
        const triangulos = [];
        const origins = [];
        resultado.origins.forEach(function (origin, i) {
          const topId = origin && topObjectIdDe(origin);
          if (origin && idsUnidade.indexOf(String(topId)) !== -1) {
            triangulos.push(resultado.triangulos[i]);
            origins.push(origin);
          }
        });

        const triCount = triangulos.length;
        if (!triCount) return [];

        const modelDoc = new DOMParser().parseFromString(state.modelText, "application/xml");

        return lerProjectSettings(state.zip).then(function (projectSettingsConfig) {
          return ModelParser.lerCorPorTriangulo(state.zip, modelDoc, origins, projectSettingsConfig).then(function (corPorTriangulo) {
            const positions = flattenTriangulos(triangulos);
            const { adjacency } = ModelParser.buildAdjacencyAndExportIndex(positions, triCount);
            const grupos = agruparPorCorContigua(adjacency, corPorTriangulo, triCount);

            const listaGrupos = Array.from(grupos.values()).map(function (indices) {
              const triangulosDoGrupo = indices.map(function (i) { return triangulos[i]; });
              const primeiro = indices[0] * 3;
              const cor = [corPorTriangulo[primeiro], corPorTriangulo[primeiro + 1], corPorTriangulo[primeiro + 2]];
              return {
                cor: cor,
                bbox: ModelParser.computeBoundingBox(triangulosDoGrupo),
                triangulos: triangulosDoGrupo,
                indices: indices
              };
            });

            listaGrupos.sort(function (a, b) { return b.triangulos.length - a.triangulos.length; });
            listaGrupos.forEach(function (grupo, i) { grupo.rotulo = "Cor " + (i + 1); });
            return { grupos: listaGrupos, triangulos: triangulos, corPorTriangulo: corPorTriangulo };
          });
        });
      });
    }

    // Renderiza os grupos de cor (ver separarUnidadePorCor) como sub-cards
    // dentro do container da unidade, seguindo o mesmo padrão visual dos
    // cards de unidade (título + dimensões), acrescido de uma amostra de cor
    // e de um botão de download individual (1 object por grupo, ver
    // exportarGrupoDeCorIndividual). Quando há mais de um grupo, acrescenta
    // também um botão pra baixar todos os grupos juntos num único .3mf com N
    // objects (exportarTodosGruposDeCorComoArquivo) — útil pra inspecionar
    // todas as regiões de cor de uma vez no fatiador (ver brief da Task 10).
    // `resultado` é o objeto `{ grupos, triangulos, corPorTriangulo }`
    // devolvido por separarUnidadePorCor; `unidade` só é usada pra montar o
    // nome-base do arquivo baixado.
    function renderSubunidadesDeCor(container, resultado, unidade) {
      container.innerHTML = "";
      const grupos = resultado.grupos;
      if (!grupos.length) {
        const vazio = document.createElement("div");
        vazio.className = "split3mf-card-dims";
        vazio.textContent = "Nenhuma região de cor encontrada nessa unidade.";
        container.appendChild(vazio);
        return;
      }

      const nomeBase = state.file.name.replace(/\.3mf$/i, "") + "-" + unidade.rotulo.toLowerCase().replace(/\s+/g, "-");

      grupos.forEach(function (grupo) {
        const subcard = document.createElement("div");
        subcard.className = "split3mf-card split3mf-subcard";

        const titulo = document.createElement("div");
        titulo.className = "split3mf-card-titulo";

        titulo.appendChild(criarAmostraCor(grupo.cor));
        titulo.appendChild(document.createTextNode(grupo.rotulo));
        subcard.appendChild(titulo);

        const dims = formatarBBoxMm(grupo.bbox);
        if (dims) {
          const dimsEl = document.createElement("div");
          dimsEl.className = "split3mf-card-dims";
          dimsEl.textContent = dims;
          subcard.appendChild(dimsEl);
        }

        const baixarGrupoBtn = document.createElement("button");
        baixarGrupoBtn.type = "button";
        baixarGrupoBtn.className = "btn btn-secondary split3mf-card-baixar";
        baixarGrupoBtn.textContent = "Baixar";
        baixarGrupoBtn.addEventListener("click", function () {
          exportarGrupoDeCorIndividual(nomeBase, grupo, resultado.triangulos, resultado.corPorTriangulo)
            .then(function (arquivo) {
              ModelParser.baixarBlob(arquivo.blob, arquivo.nome);
            })
            .catch(function (err) {
              if (window.console && console.error) console.error("Split 3MF:", err);
              mostrarErro("Não foi possível gerar o arquivo desse grupo de cor.");
            });
        });
        subcard.appendChild(baixarGrupoBtn);

        container.appendChild(subcard);
      });

      if (grupos.length > 1) {
        const baixarTodosBtn = document.createElement("button");
        baixarTodosBtn.type = "button";
        baixarTodosBtn.className = "btn btn-secondary split3mf-baixar-cores";
        baixarTodosBtn.textContent = "Baixar todos os grupos (objects separados)";
        baixarTodosBtn.addEventListener("click", function () {
          exportarTodosGruposDeCorComoArquivo(nomeBase, grupos, resultado.triangulos, resultado.corPorTriangulo)
            .then(function (arquivo) {
              ModelParser.baixarBlob(arquivo.blob, arquivo.nome);
            })
            .catch(function (err) {
              if (window.console && console.error) console.error("Split 3MF:", err);
              mostrarErro("Não foi possível gerar o arquivo com todos os grupos de cor.");
            });
        });
        container.appendChild(baixarTodosBtn);
      }
    }

    // Remove, do <build> de xmlText, todo <item> cujo objectid não esteja em
    // objectIds (comparação por string — objectid no XML é sempre texto).
    // <resources>/<object> não são tocados: deixar objects sem item no build
    // é inofensivo, fatiadores ignoram objects não referenciados por nenhum
    // item. Mesmo cuidado de injetarCoresNoXml (threemf-writer.js) com a
    // declaração <?xml ...?>: alguns XMLSerializer não a re-emitem sozinhos.
    function filtrarBuildParaObjectIds(xmlText, objectIds) {
      const doc = new DOMParser().parseFromString(xmlText, "application/xml");
      const modelEl = doc.documentElement;
      const buildEl = ModelParser.directChild(modelEl, "build");
      if (!buildEl) return xmlText;

      const idsMantidos = objectIds.map(String);
      const itemEls = ModelParser.directChildren(buildEl, "item");
      itemEls.forEach(function (itemEl) {
        const objectId = itemEl.getAttribute("objectid");
        if (idsMantidos.indexOf(objectId) === -1) {
          buildEl.removeChild(itemEl);
        }
      });

      const serializado = new XMLSerializer().serializeToString(doc);
      return /^<\?xml/.test(serializado) ? serializado : '<?xml version="1.0" encoding="UTF-8"?>\n' + serializado;
    }

    // Reconstrói um pacote 3MF novo contendo só a unidade pedida: copia todo
    // arquivo do zip original (bytes intactos) exceto o 3dmodel.model (que é
    // reescrito com só os <item> da unidade) e o model_settings.config (que é
    // simplesmente omitido — não faz sentido pra um recorte de uma chapa só,
    // e nenhum fatiador exige esse arquivo pra abrir o pacote).
    function exportarUnidadePreservandoPacote(unidade) {
      const zipNovo = new JSZip();
      const modelXmlFiltrado = filtrarBuildParaObjectIds(state.modelText, unidade.objectIds);
      const copias = [];

      state.zip.forEach(function (relPath, file) {
        if (file.dir) return;
        if (relPath === state.modelPath) return;
        if (state.modelSettingsPath && relPath === state.modelSettingsPath) return;
        copias.push(
          file.async("uint8array").then(function (dados) {
            zipNovo.file(relPath, dados);
          })
        );
      });

      return Promise.all(copias).then(function () {
        zipNovo.file(state.modelPath, modelXmlFiltrado);
        return zipNovo.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      }).then(function (blob) {
        const nomeBase = state.file.name.replace(/\.3mf$/i, "");
        const slug = unidade.rotulo.toLowerCase().replace(/\s+/g, "-");
        return { nome: nomeBase + "-" + slug + ".3mf", blob: blob };
      });
    }

    // Exporta todas as unidades de uma vez, empacotadas num único .zip.
    // Sequencial (reduce/Promise-chain), mesmo estilo de gerarProjeto em
    // conversor-3mf.js, pra não disparar N reconstruções de zip em paralelo.
    function exportarTodasAsUnidades() {
      if (!state || !state.unidades.length) return Promise.resolve();
      const zipFinal = new JSZip();

      return state.unidades.reduce(function (promessa, unidade) {
        return promessa.then(function () {
          return exportarUnidadePreservandoPacote(unidade).then(function (resultado) {
            zipFinal.file(resultado.nome, resultado.blob);
          });
        });
      }, Promise.resolve()).then(function () {
        return zipFinal.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      }).then(function (blob) {
        const nomeBase = state.file.name.replace(/\.3mf$/i, "");
        ModelParser.baixarBlob(blob, nomeBase + "-split.zip");
      });
    }

    // -------------------------------------------------------------------------
    // Corte por plano (Task 14) — lógica pura, sem DOM/Three.js (testada em
    // test/split-3mf-corte.test.js). Uma "peça" é geometria nova construída
    // em memória (não vem mais do zip original):
    //   { id, rotulo, unidadeId, origemPecaId, vertices: [[x,y,z],...],
    //     triangulos: [{v1,v2,v3,color:[r,g,b]}, ...], bbox, volumeMm3 }
    // já no formato de object que ThreeMFWriter.montarModeloDoZero aceita.
    // `unidadeId` é a unidade (chapa/objeto) de onde a peça saiu, herdado por
    // todos os cortes sucessivos; `origemPecaId` é a peça que foi cortada pra
    // gerar esta (null na peça "inicial", montada direto de uma unidade).
    // -------------------------------------------------------------------------

    // Tolerância da solda de vértices das peças (grade de 1e-5 mm). O ponto
    // de corte de uma aresta compartilhada sai bit a bit igual nos dois
    // triângulos (interpolação canônica em mesh-clip.js interpolarNaAresta),
    // e a tampa reusa esses mesmos pontos; a solda junta vértices próximos
    // de verdade e descarta as lascas que colapsam (mesh-clip.js não
    // descarta lascas por área, só aqui, por colapso na solda), o que é
    // topologicamente seguro: parede e tampa colapsam do mesmo jeito.
    const FATOR_SOLDA = 1e5;

    // triangulos: [[ [x,y,z] x3 ], ...] (soup, mesmo formato de
    // extractTriangles3MF/MeshClip.clipMalha); cores: array paralelo de
    // [r,g,b] (ou undefined -> cinza default). Retorna { vertices, triangulos }
    // indexado; triângulos que degeneram na solda (dois cantos no mesmo
    // vértice) são descartados.
    function soldarTriangulos(triangulos, cores) {
      const indicePorChave = new Map();
      const vertices = [];
      const saida = [];

      function indiceDe(p) {
        const chave = Math.round(p[0] * FATOR_SOLDA) + "," + Math.round(p[1] * FATOR_SOLDA) + "," + Math.round(p[2] * FATOR_SOLDA);
        let idx = indicePorChave.get(chave);
        if (idx === undefined) {
          idx = vertices.length;
          vertices.push([p[0], p[1], p[2]]);
          indicePorChave.set(chave, idx);
        }
        return idx;
      }

      let descartou = false;
      for (let i = 0; i < triangulos.length; i++) {
        const tri = triangulos[i];
        const v1 = indiceDe(tri[0]);
        const v2 = indiceDe(tri[1]);
        const v3 = indiceDe(tri[2]);
        if (v1 === v2 || v2 === v3 || v1 === v3) {
          descartou = true;
          continue;
        }
        const cor = cores && cores[i];
        saida.push({ v1: v1, v2: v2, v3: v3, color: cor || ThreeMFWriter.DEFAULT_COLOR });
      }

      if (!descartou) return { vertices: vertices, triangulos: saida };

      // Caso raro (triângulo degenerado): compacta os vértices pra não
      // exportar vértice sem nenhum triângulo.
      const novoIndice = new Int32Array(vertices.length).fill(-1);
      const compactados = [];
      function remapear(v) {
        if (novoIndice[v] < 0) {
          novoIndice[v] = compactados.length;
          compactados.push(vertices[v]);
        }
        return novoIndice[v];
      }
      saida.forEach(function (t) {
        t.v1 = remapear(t.v1);
        t.v2 = remapear(t.v2);
        t.v3 = remapear(t.v3);
      });
      return { vertices: compactados, triangulos: saida };
    }

    // Volta de peça indexada pra soup + cores paralelas (entrada de
    // MeshClip.clipMalha / ModelParser.computeBoundingBox).
    function triangulosDaPeca(peca) {
      const triangulos = new Array(peca.triangulos.length);
      const cores = new Array(peca.triangulos.length);
      for (let i = 0; i < peca.triangulos.length; i++) {
        const t = peca.triangulos[i];
        triangulos[i] = [peca.vertices[t.v1], peca.vertices[t.v2], peca.vertices[t.v3]];
        cores[i] = t.color;
      }
      return { triangulos: triangulos, cores: cores };
    }

    // Geometria de uma peça (sem identidade): solda + bbox + volume, ambos
    // medidos sobre a geometria já soldada.
    function montarGeometriaDePeca(triangulos, cores) {
      const soldado = soldarTriangulos(triangulos, cores);
      const geometria = { vertices: soldado.vertices, triangulos: soldado.triangulos };
      const soup = triangulosDaPeca(geometria).triangulos;
      geometria.bbox = soup.length ? ModelParser.computeBoundingBox(soup) : null;
      geometria.volumeMm3 = ModelParser.computeMeshVolumeMm3(soup);
      return geometria;
    }

    // identidade: { id, rotulo, unidadeId, origemPecaId }.
    function criarPeca(identidade, triangulos, cores) {
      return Object.assign({}, identidade, montarGeometriaDePeca(triangulos, cores));
    }

    // Triângulos (soup) e cores de uma unidade, a partir do arquivo inteiro
    // já extraído (`arquivo` = { triangulos, origins } de extractTriangles3MF)
    // e da cor real de cada triângulo (`corPorTriangulo`, Uint8ClampedArray
    // de lerCorPorTriangulo, opcional). Mesmo casamento por
    // origin.topObjectId de separarUnidadePorCor. Cores iguais compartilham o
    // mesmo array [r,g,b] (evita 1 array por triângulo em malhas grandes).
    function extrairTriangulosDaUnidade(arquivo, unidade, corPorTriangulo) {
      const ids = new Set(unidade.objectIds.map(String));
      const corInterna = new Map();
      const triangulos = [];
      const cores = [];
      for (let t = 0; t < arquivo.triangulos.length; t++) {
        const origin = arquivo.origins[t];
        if (!origin || !ids.has(String(topObjectIdDe(origin)))) continue;
        triangulos.push(arquivo.triangulos[t]);
        if (corPorTriangulo) {
          const r = corPorTriangulo[t * 3], g = corPorTriangulo[t * 3 + 1], b = corPorTriangulo[t * 3 + 2];
          const chave = r + "," + g + "," + b;
          let cor = corInterna.get(chave);
          if (!cor) {
            cor = [r, g, b];
            corInterna.set(chave, cor);
          }
          cores.push(cor);
        } else {
          cores.push(undefined);
        }
      }
      return { triangulos: triangulos, cores: cores };
    }

    function erroPlanoNaoCorta() {
      const erro = new Error("O plano de corte não atravessa essa peça.");
      erro.codigo = "PLANO_NAO_CORTA";
      return erro;
    }

    // Corta uma peça por um plano. O bbox é reconstruído a partir dos
    // triângulos da própria peça (ModelParser.computeBoundingBox), então
    // posicaoPct é sempre relativa à peça sendo cortada, não ao arquivo.
    // opcoes: { earcutFn (obrigatório no browser, ver mesh-clip.js),
    // novaIdentidade(): { id, rotulo } (chamada só depois de confirmar que o
    // corte gerou dois lados não vazios, pra não "gastar" numeração à toa) }.
    // Retorna { negativo, positivo, plano } (negativo = lado de menor
    // coordenada no eixo, vem primeiro na numeração). Lança erro com
    // codigo "PLANO_NAO_CORTA" se o plano deixar um dos lados vazio.
    function cortarPeca(peca, eixo, posicaoPct, inclinacaoGraus, opcoes) {
      const MeshClip = window.Wisky3D.MeshClip;
      const soup = triangulosDaPeca(peca);
      const bbox = ModelParser.computeBoundingBox(soup.triangulos);
      const plano = MeshClip.definirPlanoDeCorte(eixo, posicaoPct, inclinacaoGraus, bbox);
      const resultado = MeshClip.clipMalha(soup.triangulos, soup.cores, plano, undefined, opcoes.earcutFn);

      const geomNegativo = montarGeometriaDePeca(resultado.ladoNegativo.triangulos, resultado.ladoNegativo.cores);
      const geomPositivo = montarGeometriaDePeca(resultado.ladoPositivo.triangulos, resultado.ladoPositivo.cores);
      if (!geomNegativo.triangulos.length || !geomPositivo.triangulos.length) throw erroPlanoNaoCorta();

      function comIdentidade(geometria) {
        const identidade = opcoes.novaIdentidade();
        return Object.assign({
          id: identidade.id,
          rotulo: identidade.rotulo,
          unidadeId: peca.unidadeId,
          origemPecaId: peca.id
        }, geometria);
      }

      const negativo = comIdentidade(geomNegativo);
      const positivo = comIdentidade(geomPositivo);
      return { negativo: negativo, positivo: positivo, plano: plano };
    }

    // Versão "lista" de cortarPeca: devolve uma nova lista em que a peça
    // `pecaId` foi substituída, na mesma posição, pelas duas peças do corte
    // (a lista de entrada não é alterada). Resolve { pecas, novas, plano }.
    function substituirPecaPorCorte(pecas, pecaId, eixo, posicaoPct, inclinacaoGraus, opcoes) {
      const indice = pecas.findIndex(function (p) { return p.id === pecaId; });
      if (indice < 0) throw new Error("Peça " + pecaId + " não encontrada.");
      const corte = cortarPeca(pecas[indice], eixo, posicaoPct, inclinacaoGraus, opcoes);
      const novas = [corte.negativo, corte.positivo];
      const lista = pecas.slice(0, indice).concat(novas, pecas.slice(indice + 1));
      return { pecas: lista, novas: novas, plano: corte.plano };
    }

    // Um <object> por peça (objectId 1..N, na ordem da lista), num único
    // modelo — serve tanto pro download de uma peça só ([peca]) quanto pro
    // "baixar todas as peças" num .3mf multi-object.
    function montarModeloDasPecas(pecas) {
      return ThreeMFWriter.montarModeloDoZero(pecas.map(function (peca, i) {
        return { objectId: i + 1, vertices: peca.vertices, triangulos: peca.triangulos };
      }));
    }

    function centroDoBBox(bbox) {
      return [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2, (bbox.minZ + bbox.maxZ) / 2];
    }

    // Cor de identificação de uma peça no viewer/card: continua a sequência
    // de corDaUnidade depois das unidades, pra não repetir a cor de nenhuma.
    function corDaPeca(peca, totalUnidades) {
      return corDaUnidade(totalUnidades + peca.id);
    }

    // Monta os dados da cena exibida no viewer (lógica pura; quem chama
    // transforma em BufferGeometry): unidades ainda não cortadas (com os
    // triângulos do arquivo, cor de corDaUnidade) + peças de state.pecas (cor
    // de corDaPeca). Triângulos fora de qualquer unidade aparecem em cinza e
    // não são selecionáveis. Um "alvo" é o que pode ser escolhido pra cortar:
    // "u:<unidade.id>" ou "p:<peca.id>".
    // `fatorAfastamento` (0 = sem afastar): cada peça é deslocada, só na
    // visualização, por (centro da peça - centro da unidade de origem) *
    // fator, deixando uma fresta visível entre as peças de um corte pra dar
    // pra conferir as tampas. Retorna { positions (Float32Array triCount*9),
    // baseColors (Uint8ClampedArray triCount*3), alvoPorTriangulo
    // (Int32Array, índice em `alvos` ou -1), alvos (chaves), bboxPorAlvo,
    // offsetPorAlvo (Map chave -> [dx,dy,dz]), triCount }.
    function montarCenaDeCorte(arquivo, unidades, pecas, fatorAfastamento) {
      const indicePorObjectId = new Map();
      unidades.forEach(function (unidade, i) {
        unidade.objectIds.forEach(function (id) {
          if (!indicePorObjectId.has(String(id))) indicePorObjectId.set(String(id), i);
        });
      });
      const unidadeCortada = unidades.map(function (unidade) {
        return pecas.some(function (p) { return p.unidadeId === unidade.id; });
      });

      const unidadePorTrianguloArquivo = new Int32Array(arquivo.triangulos.length);
      const bboxUnidade = unidades.map(function () { return null; });
      let triCount = 0;
      for (let t = 0; t < arquivo.triangulos.length; t++) {
        const origin = arquivo.origins[t];
        const indice = origin ? indicePorObjectId.get(String(topObjectIdDe(origin))) : undefined;
        unidadePorTrianguloArquivo[t] = indice !== undefined ? indice : -1;
        if (indice !== undefined) {
          const tri = arquivo.triangulos[t];
          let bb = bboxUnidade[indice];
          if (!bb) bb = bboxUnidade[indice] = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
          for (let c = 0; c < 3; c++) {
            const p = tri[c];
            if (p[0] < bb.minX) bb.minX = p[0];
            if (p[0] > bb.maxX) bb.maxX = p[0];
            if (p[1] < bb.minY) bb.minY = p[1];
            if (p[1] > bb.maxY) bb.maxY = p[1];
            if (p[2] < bb.minZ) bb.minZ = p[2];
            if (p[2] > bb.maxZ) bb.maxZ = p[2];
          }
        }
        if (indice === undefined || !unidadeCortada[indice]) triCount++;
      }
      pecas.forEach(function (peca) { triCount += peca.triangulos.length; });

      const alvos = [];
      const indiceDoAlvo = new Map();
      const bboxPorAlvo = new Map();
      const offsetPorAlvo = new Map();
      function registrarAlvo(chave, bbox, offset) {
        indiceDoAlvo.set(chave, alvos.length);
        alvos.push(chave);
        bboxPorAlvo.set(chave, bbox);
        offsetPorAlvo.set(chave, offset);
      }
      unidades.forEach(function (unidade, i) {
        if (!unidadeCortada[i] && bboxUnidade[i]) registrarAlvo("u:" + unidade.id, bboxUnidade[i], [0, 0, 0]);
      });
      const indiceUnidadePorId = new Map(unidades.map(function (u, i) { return [u.id, i]; }));
      pecas.forEach(function (peca) {
        let offset = [0, 0, 0];
        const bbU = bboxUnidade[indiceUnidadePorId.get(peca.unidadeId)];
        if (fatorAfastamento && bbU && peca.bbox) {
          const cU = centroDoBBox(bbU);
          const cP = centroDoBBox(peca.bbox);
          offset = [(cP[0] - cU[0]) * fatorAfastamento, (cP[1] - cU[1]) * fatorAfastamento, (cP[2] - cU[2]) * fatorAfastamento];
        }
        registrarAlvo("p:" + peca.id, peca.bbox, offset);
      });

      const positions = new Float32Array(triCount * 9);
      const baseColors = new Uint8ClampedArray(triCount * 3);
      const alvoPorTriangulo = new Int32Array(triCount);
      let saida = 0;
      function emitir(p0, p1, p2, offset, cor, indiceAlvo) {
        const b = saida * 9;
        positions[b] = p0[0] + offset[0]; positions[b + 1] = p0[1] + offset[1]; positions[b + 2] = p0[2] + offset[2];
        positions[b + 3] = p1[0] + offset[0]; positions[b + 4] = p1[1] + offset[1]; positions[b + 5] = p1[2] + offset[2];
        positions[b + 6] = p2[0] + offset[0]; positions[b + 7] = p2[1] + offset[1]; positions[b + 8] = p2[2] + offset[2];
        baseColors[saida * 3] = cor[0];
        baseColors[saida * 3 + 1] = cor[1];
        baseColors[saida * 3 + 2] = cor[2];
        alvoPorTriangulo[saida] = indiceAlvo;
        saida++;
      }

      const semOffset = [0, 0, 0];
      const coresUnidades = unidades.map(function (u, i) { return corDaUnidade(i); });
      const alvoPorIndiceUnidade = unidades.map(function (u) {
        const idx = indiceDoAlvo.get("u:" + u.id);
        return idx === undefined ? -1 : idx;
      });
      for (let t = 0; t < arquivo.triangulos.length; t++) {
        const indice = unidadePorTrianguloArquivo[t];
        if (indice >= 0 && unidadeCortada[indice]) continue;
        const tri = arquivo.triangulos[t];
        const cor = indice >= 0 ? coresUnidades[indice] : ThreeMFWriter.DEFAULT_COLOR;
        emitir(tri[0], tri[1], tri[2], semOffset, cor, indice >= 0 ? alvoPorIndiceUnidade[indice] : -1);
      }
      pecas.forEach(function (peca) {
        const chave = "p:" + peca.id;
        const offset = offsetPorAlvo.get(chave);
        const cor = corDaPeca(peca, unidades.length);
        const indiceAlvo = indiceDoAlvo.get(chave);
        peca.triangulos.forEach(function (t) {
          emitir(peca.vertices[t.v1], peca.vertices[t.v2], peca.vertices[t.v3], offset, cor, indiceAlvo);
        });
      });

      return {
        positions: positions,
        baseColors: baseColors,
        alvoPorTriangulo: alvoPorTriangulo,
        alvos: alvos,
        bboxPorAlvo: bboxPorAlvo,
        offsetPorAlvo: offsetPorAlvo,
        triCount: triCount
      };
    }

    // -------------------------------------------------------------------------
    // Visualização 3D (Task 11) + corte por plano (Task 14): o arquivo numa
    // BufferGeometry não-indexada (ver montarCenaDeCorte), cada triângulo com
    // a cor da unidade (chapa/objeto) ou da peça cortada a que pertence;
    // clique num triângulo escolhe essa unidade/peça como alvo do corte
    // (destaque no viewer, mesmo HIGHLIGHT_COLOR da seleção do Colorir 3MF, e
    // no card da lista). state.alvoCorte ("u:<id>"/"p:<id>" ou null) é o alvo
    // atual; state.unidadeSelecionadaIndice (índice em state.unidades, ou
    // null) continua refletindo a unidade selecionada, como na Task 11.
    // -------------------------------------------------------------------------

    // Promise<{ modulo, viewer, preview }>: importa three-viewer-basico.js e
    // cria o viewer (e o preview do plano de corte) uma única vez, reusados
    // entre arquivos. Se falhar, zera o cache pra que o próximo arquivo tente
    // de novo.
    let viewerPromise = null;
    function obterViewer() {
      if (!viewerPromise) {
        viewerPromise = import(VIEWER_MODULO).then(function (modulo) {
          return {
            modulo: modulo,
            viewer: modulo.criarViewerBasico(canvasEl, { onClique: handleCanvasClick }),
            preview: modulo.criarPreviewDePlano()
          };
        });
        viewerPromise.catch(function () {
          viewerPromise = null;
        });
      }
      return viewerPromise;
    }

    // earcut (entrada "earcut" do importmap de split-3mf.html) só é baixado no
    // primeiro corte e repassado a MeshClip.clipMalha (ver estratégia de
    // módulo em mesh-clip.js).
    let earcutPromise = null;
    function obterEarcut() {
      if (!earcutPromise) {
        earcutPromise = import("earcut").then(function (modulo) {
          return modulo.default || modulo;
        });
        earcutPromise.catch(function () {
          earcutPromise = null;
        });
      }
      return earcutPromise;
    }

    // Quanto as peças cortadas se afastam do centro da unidade de origem na
    // visualização (ver montarCenaDeCorte), com o checkbox marcado.
    const FATOR_AFASTAMENTO = 0.3;

    function atualizarCoresDaVisualizacao() {
      const vis = state && state.visualizacao;
      if (!vis) return;
      const indiceAlvo = state.alvoCorte ? vis.alvos.indexOf(state.alvoCorte) : -1;
      vis.modulo.aplicarCoresComDestaque(vis.geometry, vis.triCount, vis.baseColors, function (t) {
        return indiceAlvo >= 0 && vis.alvoPorTriangulo[t] === indiceAlvo;
      });
      vis.viewer.requestRender();
    }

    function lerParametrosDeCorte() {
      return {
        eixo: corteEixoEl.value,
        posicaoPct: Number(cortePosicaoEl.value),
        inclinacaoGraus: Number(corteInclinacaoEl.value)
      };
    }

    // Posiciona o plano azul sobre o alvo atual, com exatamente o plano que
    // aplicarCorte vai usar (MeshClip.definirPlanoDeCorte sobre o bbox do
    // alvo), deslocado pelo mesmo offset de afastamento da visualização.
    function atualizarPreviewDoPlano() {
      const vis = state && state.visualizacao;
      if (!vis) return;
      const bbox = state.alvoCorte ? vis.bboxPorAlvo.get(state.alvoCorte) : null;
      const MeshClip = window.Wisky3D.MeshClip;
      if (!bbox || !MeshClip) {
        vis.preview.esconder();
        vis.viewer.requestRender();
        return;
      }
      const p = lerParametrosDeCorte();
      const plano = MeshClip.definirPlanoDeCorte(p.eixo, p.posicaoPct, p.inclinacaoGraus, bbox);
      const offset = vis.offsetPorAlvo.get(state.alvoCorte) || [0, 0, 0];
      const diagonal = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ);
      vis.preview.atualizar(
        plano.normal,
        [plano.ponto[0] + offset[0], plano.ponto[1] + offset[1], plano.ponto[2] + offset[2]],
        Math.max(diagonal * 1.15, 1)
      );
      vis.viewer.requestRender();
    }

    // Opções do <select> de alvo: unidades ainda não cortadas + peças atuais.
    function renderOpcoesDeAlvo() {
      corteAlvoEl.innerHTML = "";
      const vazia = document.createElement("option");
      vazia.value = "";
      vazia.textContent = "Escolha uma peça...";
      corteAlvoEl.appendChild(vazia);
      if (!state) return;
      state.unidades.forEach(function (unidade) {
        if (unidadeFoiCortada(unidade)) return;
        const opcao = document.createElement("option");
        opcao.value = "u:" + unidade.id;
        opcao.textContent = unidade.rotulo;
        corteAlvoEl.appendChild(opcao);
      });
      state.pecas.forEach(function (peca) {
        const opcao = document.createElement("option");
        opcao.value = "p:" + peca.id;
        opcao.textContent = peca.rotulo;
        corteAlvoEl.appendChild(opcao);
      });
      corteAlvoEl.value = state.alvoCorte || "";
    }

    function unidadeFoiCortada(unidade) {
      return state.pecas.some(function (p) { return p.unidadeId === unidade.id; });
    }

    // Único ponto que muda o alvo do corte: sincroniza <select>, seleção de
    // unidade da Task 11, destaque dos cards, cores do viewer, preview do
    // plano e o botão "Cortar".
    function definirAlvoCorte(chave) {
      if (!state) return;
      state.alvoCorte = chave || null;
      corteAlvoEl.value = state.alvoCorte || "";

      let indiceUnidade = null;
      if (state.alvoCorte && state.alvoCorte.indexOf("u:") === 0) {
        const id = state.alvoCorte.slice(2);
        const i = state.unidades.findIndex(function (u) { return String(u.id) === id; });
        if (i >= 0) indiceUnidade = i;
      }
      state.unidadeSelecionadaIndice = indiceUnidade;
      (state.cards || []).forEach(function (card, i) {
        card.classList.toggle("is-selecionada", i === indiceUnidade);
      });
      (state.cardsPecas || []).forEach(function (card) {
        card.classList.toggle("is-selecionada", "p:" + card.dataset.pecaId === state.alvoCorte);
      });

      cortarBtn.disabled = !state.alvoCorte || state.cortando;
      atualizarCoresDaVisualizacao();
      atualizarPreviewDoPlano();
    }

    function selecionarUnidade(indice) {
      if (!state) return;
      definirAlvoCorte(indice === null ? null : "u:" + state.unidades[indice].id);
    }

    // Clique (não arraste) no canvas: escolhe como alvo a unidade/peça do
    // triângulo clicado; clicar de novo no alvo atual desfaz a escolha.
    // Triângulos fora de qualquer unidade (cinza) não selecionam nada.
    function handleCanvasClick(e) {
      const vis = state && state.visualizacao;
      if (!vis) return;
      const hits = vis.viewer.intersect(e);
      if (!hits.length) return;
      const indice = vis.alvoPorTriangulo[hits[0].faceIndex];
      if (indice < 0) return;
      const chave = vis.alvos[indice];
      definirAlvoCorte(chave === state.alvoCorte ? null : chave);
    }

    // (Re)monta a malha do viewer a partir de estado.arquivo + estado.pecas
    // (ver montarCenaDeCorte) e reanexa o preview do plano à nova mesh.
    function renderizarCena(estado, v) {
      const cena = montarCenaDeCorte(estado.arquivo, estado.unidades, estado.pecas, corteAfastarEl.checked ? FATOR_AFASTAMENTO : 0);
      if (!cena.triCount) {
        canvasWrapEl.hidden = true;
        estado.visualizacao = null;
        return;
      }
      canvasWrapEl.hidden = false;
      const faceNormals = v.modulo.computeFaceNormals(cena.positions, cena.triCount);
      const mesh = v.modulo.criarMeshTriangulos(cena.positions, faceNormals, cena.triCount);
      estado.visualizacao = {
        viewer: v.viewer,
        modulo: v.modulo,
        preview: v.preview,
        geometry: mesh.geometry,
        triCount: cena.triCount,
        baseColors: cena.baseColors,
        alvoPorTriangulo: cena.alvoPorTriangulo,
        alvos: cena.alvos,
        bboxPorAlvo: cena.bboxPorAlvo,
        offsetPorAlvo: cena.offsetPorAlvo
      };
      v.viewer.setMesh(mesh);
      v.preview.anexarA(mesh);
      v.viewer.resize();
      v.viewer.frameToGeometry();
      if (estado.alvoCorte && cena.alvos.indexOf(estado.alvoCorte) < 0) estado.alvoCorte = null;
      definirAlvoCorte(estado.alvoCorte);

      const grande = cena.triCount >= v.modulo.AVISO_TRIANGULOS_GRANDE;
      avisoGrandeEl.hidden = !grande;
      if (grande) {
        avisoGrandeTextoEl.textContent = "Modelo com " + cena.triCount.toLocaleString("pt-BR") + " triângulos, a visualização 3D pode ficar um pouco mais lenta.";
      }
    }

    // Reconstrói a visualização do state atual, se o viewer já existir (uma
    // falha no viewer não impede cortar nem baixar as peças).
    function reconstruirVisualizacao() {
      const estado = state;
      if (!estado || !estado.arquivo || !estado.visualizacao) return;
      obterViewer().then(function (v) {
        if (state === estado) renderizarCena(estado, v);
      }).catch(function (err) {
        if (window.console && console.error) console.error("Split 3MF (visualização 3D):", err);
      });
    }

    // Lê todos os triângulos do pacote (mesmo extractTriangles3MF usado em
    // separarUnidadePorCor, sem filtro), guarda em estado.arquivo (base dos
    // cortes) e exibe no viewer. `estado` é o state do arquivo que disparou a
    // montagem: se outro arquivo for aberto no meio-tempo, o resultado antigo
    // é descartado.
    function montarVisualizacao(estado) {
      return obterArquivo(estado).then(function (arquivo) {
        if (state !== estado) return;
        if (!arquivo.triangulos.length) {
          canvasWrapEl.hidden = true;
          return;
        }
        return obterViewer().then(function (v) {
          if (state !== estado) return;
          renderizarCena(estado, v);
        });
      });
    }

    function obterArquivo(estado) {
      if (!estado.arquivoPromise) {
        estado.arquivoPromise = ModelParser.extractTriangles3MF(estado.zip, estado.modelText, estado.modelPath).then(function (resultado) {
          estado.arquivo = { triangulos: resultado.triangulos, origins: resultado.origins };
          return estado.arquivo;
        });
        estado.arquivoPromise.catch(function () {
          estado.arquivoPromise = null;
        });
      }
      return estado.arquivoPromise;
    }

    // Metadata/project_settings.config (JSON) do pacote, ou null.
    function lerProjectSettings(zip) {
      const configEntry = ModelParser.localizarArquivoUnico(zip, "project_settings.config");
      if (!configEntry) return Promise.resolve(null);
      return configEntry.async("text").then(function (texto) {
        try {
          return JSON.parse(texto);
        } catch (e) {
          return null;
        }
      });
    }

    // Cor real de cada triângulo do arquivo inteiro (mesma leitura de
    // separarUnidadePorCor), calculada uma vez só, no primeiro corte: as
    // peças cortadas preservam a pintura original na exportação.
    function obterCoresDoArquivo(estado) {
      if (!estado.coresPromise) {
        estado.coresPromise = obterArquivo(estado).then(function (arquivo) {
          const modelDoc = new DOMParser().parseFromString(estado.modelText, "application/xml");
          return lerProjectSettings(estado.zip).then(function (projectSettingsConfig) {
            return ModelParser.lerCorPorTriangulo(estado.zip, modelDoc, arquivo.origins, projectSettingsConfig);
          });
        });
        estado.coresPromise.catch(function () {
          estado.coresPromise = null;
        });
      }
      return estado.coresPromise;
    }

    function novaIdentidadeDePeca() {
      const id = state.proximoPecaId++;
      const numero = state.proximoNumeroPeca++;
      return { id: id, rotulo: "Peça " + numero };
    }

    // Corta a peça `pecaId` de state.pecas (a peça precisa já estar na lista;
    // ver cortarAlvoAtual pra unidades ainda não cortadas), substituindo-a
    // pelas duas peças do corte e atualizando lista e viewer. Promise que
    // resolve com as duas novas peças.
    function aplicarCorte(pecaId, eixo, posicaoPct, inclinacaoGraus) {
      const estado = state;
      return obterEarcut().then(function (earcutFn) {
        if (state !== estado) return null;
        const resultado = substituirPecaPorCorte(estado.pecas, pecaId, eixo, posicaoPct, inclinacaoGraus, {
          earcutFn: earcutFn,
          novaIdentidade: novaIdentidadeDePeca
        });
        estado.pecas = resultado.pecas;
        estado.alvoCorte = null;
        renderOpcoesDeAlvo();
        renderListaPecas();
        reconstruirVisualizacao();
        definirAlvoCorte(null);
        return resultado.novas;
      });
    }

    // Botão "Cortar": se o alvo é uma unidade ainda não cortada, primeiro a
    // converte em peça (geometria do arquivo + cores reais) e a coloca em
    // state.pecas; se o corte falhar, essa peça provisória é retirada de
    // novo, deixando o estado como estava.
    function cortarAlvoAtual() {
      const estado = state;
      if (!estado || !estado.alvoCorte || estado.cortando) return;
      const alvo = estado.alvoCorte;
      const p = lerParametrosDeCorte();
      let pecaProvisoriaId = null;

      estado.cortando = true;
      cortarBtn.disabled = true;
      cortarBtn.textContent = "Cortando...";
      mostrarErro("");

      // Um respiro antes do trabalho síncrono pesado (clipMalha), pra o
      // "Cortando..." chegar a ser pintado.
      new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
        if (alvo.indexOf("u:") === 0) {
          const unidade = estado.unidades.find(function (u) { return "u:" + u.id === alvo; });
          return Promise.all([obterArquivo(estado), obterCoresDoArquivo(estado)]).then(function (r) {
            const extraido = extrairTriangulosDaUnidade(r[0], unidade, r[1]);
            const peca = criarPeca({
              id: estado.proximoPecaId++,
              rotulo: unidade.rotulo,
              unidadeId: unidade.id,
              origemPecaId: null
            }, extraido.triangulos, extraido.cores);
            pecaProvisoriaId = peca.id;
            estado.pecas = estado.pecas.concat([peca]);
            return peca.id;
          });
        }
        return Number(alvo.slice(2));
      }).then(function (pecaId) {
        if (state !== estado) return;
        return aplicarCorte(pecaId, p.eixo, p.posicaoPct, p.inclinacaoGraus);
      }).catch(function (err) {
        if (pecaProvisoriaId !== null) {
          estado.pecas = estado.pecas.filter(function (peca) { return peca.id !== pecaProvisoriaId; });
        }
        if (state !== estado) return;
        if (err && err.codigo === "PLANO_NAO_CORTA") {
          mostrarErro("O plano de corte não atravessa essa peça. Ajuste a posição ou a inclinação.");
        } else {
          if (window.console && console.error) console.error("Split 3MF (corte):", err);
          mostrarErro("Não foi possível cortar essa peça.");
        }
      }).then(function () {
        estado.cortando = false;
        cortarBtn.textContent = "Cortar";
        if (state === estado) cortarBtn.disabled = !estado.alvoCorte;
      });
    }

    function descartarCortes() {
      if (!state) return;
      state.pecas = [];
      state.alvoCorte = null;
      renderOpcoesDeAlvo();
      renderListaPecas();
      reconstruirVisualizacao();
      definirAlvoCorte(null);
    }

    function nomeBaseDoArquivo() {
      return state.file.name.replace(/\.3mf$/i, "");
    }

    function slugDe(rotulo) {
      return rotulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
    }

    function exportarPeca(peca) {
      return zipar3MFDoZero(montarModeloDasPecas([peca]), nomeBaseDoArquivo() + "-" + slugDe(peca.rotulo) + ".3mf");
    }

    function exportarTodasAsPecas() {
      return zipar3MFDoZero(montarModeloDasPecas(state.pecas), nomeBaseDoArquivo() + "-pecas.3mf");
    }

    function formatarVolume(volumeMm3) {
      return "Volume ≈ " + (volumeMm3 / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " cm³";
    }

    // Lista de peças resultantes: mesmo card de unidade (amostra da cor da
    // peça no viewer + rótulo + dimensões), com volume, "Baixar" e "Cortar
    // novamente" (que só escolhe a peça como alvo e rola até os controles).
    function renderListaPecas() {
      pecasListaEl.innerHTML = "";
      state.cardsPecas = [];
      pecasEl.hidden = !state.pecas.length;
      descartarCortesBtn.hidden = !state.pecas.length;

      state.pecas.forEach(function (peca) {
        const card = document.createElement("div");
        card.className = "split3mf-card";
        card.dataset.pecaId = String(peca.id);

        const titulo = document.createElement("div");
        titulo.className = "split3mf-card-titulo";
        titulo.appendChild(criarAmostraCor(corDaPeca(peca, state.unidades.length)));
        titulo.appendChild(document.createTextNode(peca.rotulo));
        card.appendChild(titulo);

        const dimsEl = document.createElement("div");
        dimsEl.className = "split3mf-card-dims";
        dimsEl.textContent = formatarBBoxMm(peca.bbox) + " · " + formatarVolume(peca.volumeMm3);
        card.appendChild(dimsEl);

        const acoes = document.createElement("div");
        acoes.className = "split3mf-card-acoes";

        const baixarBtn = document.createElement("button");
        baixarBtn.type = "button";
        baixarBtn.className = "btn btn-secondary split3mf-card-baixar";
        baixarBtn.textContent = "Baixar";
        baixarBtn.addEventListener("click", function () {
          exportarPeca(peca).then(function (arquivo) {
            ModelParser.baixarBlob(arquivo.blob, arquivo.nome);
          }).catch(function (err) {
            if (window.console && console.error) console.error("Split 3MF:", err);
            mostrarErro("Não foi possível gerar o arquivo dessa peça.");
          });
        });
        acoes.appendChild(baixarBtn);

        const cortarDeNovoBtn = document.createElement("button");
        cortarDeNovoBtn.type = "button";
        cortarDeNovoBtn.className = "btn btn-secondary split3mf-card-cortar";
        cortarDeNovoBtn.textContent = "Cortar novamente";
        cortarDeNovoBtn.addEventListener("click", function () {
          definirAlvoCorte("p:" + peca.id);
          if (corteEl.scrollIntoView) corteEl.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        acoes.appendChild(cortarDeNovoBtn);

        card.appendChild(acoes);
        pecasListaEl.appendChild(card);
        state.cardsPecas.push(card);
      });
    }

    function processarArquivo(file) {
      if (!file) return;
      if (!/\.3mf$/i.test(file.name)) {
        mostrarErro("Formato não suportado. Envie um arquivo .3mf.");
        return;
      }
      if (!ModelParser || !ThreeMFWriter) {
        mostrarErro("Não foi possível carregar o leitor de modelos 3D.");
        return;
      }
      if (typeof JSZip === "undefined") {
        mostrarErro("Não foi possível carregar o leitor de arquivos 3MF.");
        return;
      }

      mostrarErro("");
      mostrarCarregando(true);
      painel.hidden = true;

      JSZip.loadAsync(file)
        .then(function (zip) {
          const modelFile = ModelParser.localizarModeloRaiz(zip);
          if (!modelFile) throw new Error("3dmodel.model não encontrado no pacote 3MF");
          const modelPath = modelFile.name;
          const modelSettingsEntry = ModelParser.localizarArquivoUnico(zip, "model_settings.config");
          const modelSettingsPromise = modelSettingsEntry ? modelSettingsEntry.async("text") : Promise.resolve(null);

          return modelFile.async("text").then(function (modelText) {
            return modelSettingsPromise.then(function (modelSettingsText) {
              return detectarUnidadesDeSplit(zip, modelText, modelSettingsText).then(function (resultado) {
                // O viewer (e o preview do plano) é reusado entre arquivos:
                // esconde o plano do arquivo anterior até a nova cena subir.
                if (state && state.visualizacao) state.visualizacao.preview.esconder();
                state = {
                  file: file,
                  zip: zip,
                  modelPath: modelPath,
                  modelText: modelText,
                  modelSettingsPath: modelSettingsEntry ? modelSettingsEntry.name : null,
                  modelSettingsText: modelSettingsText,
                  modo: resultado.modo,
                  unidades: resultado.unidades,
                  unidadeSelecionadaIndice: null,
                  visualizacao: null,
                  // Corte por plano (Task 14): arquivo = triângulos do
                  // pacote inteiro (preenchido por obterArquivo), pecas =
                  // peças geradas por corte (ver bloco "Corte por plano").
                  arquivo: null,
                  arquivoPromise: null,
                  coresPromise: null,
                  pecas: [],
                  proximoPecaId: 1,
                  proximoNumeroPeca: 1,
                  alvoCorte: null,
                  cortando: false,
                  cardsPecas: []
                };
                state.cards = renderListaUnidades(state.unidades);
                renderOpcoesDeAlvo();
                renderListaPecas();
                definirAlvoCorte(null);
                painel.hidden = false;

                // Fora da cadeia principal de propósito: a lista e os
                // downloads já estão prontos aqui, e uma falha na
                // visualização 3D não deve virar erro de leitura do arquivo.
                const estadoAtual = state;
                canvasWrapEl.hidden = false;
                avisoGrandeEl.hidden = true;
                montarVisualizacao(estadoAtual).catch(function (err) {
                  if (window.console && console.error) console.error("Split 3MF (visualização 3D):", err);
                  if (state === estadoAtual) canvasWrapEl.hidden = true;
                });
              });
            });
          });
        })
        .catch(function (err) {
          if (window.console && console.error) console.error("Split 3MF:", err);
          const detalhe = err && err.message ? " (" + err.message + ")" : "";
          mostrarErro("Não foi possível ler esse arquivo. Confirme que é um .3mf válido." + detalhe);
        })
        .then(function () {
          mostrarCarregando(false);
        });
    }

    // Exposto em window.Wisky3D só pra permitir teste unitário de
    // filtrarBuildParaObjectIds (test/split-3mf-build-filter.test.js),
    // agruparPorCorContigua (test/split-3mf-color-groups.test.js) e
    // exportarGruposDeCorComoObjects (test/split-3mf-color-export.test.js) e
    // da lógica pura do corte por plano (test/split-3mf-corte.test.js) — o
    // restante do módulo não roda fora de uma página com #split3mf no DOM.
    window.Wisky3D = window.Wisky3D || {};
    window.Wisky3D.Split3MF = {
      filtrarBuildParaObjectIds: filtrarBuildParaObjectIds,
      agruparPorCorContigua: agruparPorCorContigua,
      exportarGruposDeCorComoObjects: exportarGruposDeCorComoObjects,
      soldarTriangulos: soldarTriangulos,
      triangulosDaPeca: triangulosDaPeca,
      criarPeca: criarPeca,
      extrairTriangulosDaUnidade: extrairTriangulosDaUnidade,
      cortarPeca: cortarPeca,
      substituirPecaPorCorte: substituirPecaPorCorte,
      montarModeloDasPecas: montarModeloDasPecas,
      montarCenaDeCorte: montarCenaDeCorte
    };

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

    recentralizarBtn.addEventListener("click", () => {
      const vis = state && state.visualizacao;
      if (vis) vis.viewer.recentralizarVista();
    });
    avisoGrandeFecharBtn.addEventListener("click", () => { avisoGrandeEl.hidden = true; });

    corteAlvoEl.addEventListener("change", () => { definirAlvoCorte(corteAlvoEl.value); });
    corteEixoEl.addEventListener("change", atualizarPreviewDoPlano);
    cortePosicaoEl.addEventListener("input", () => {
      cortePosicaoValorEl.textContent = cortePosicaoEl.value + "%";
      atualizarPreviewDoPlano();
    });
    corteInclinacaoEl.addEventListener("input", () => {
      corteInclinacaoValorEl.textContent = corteInclinacaoEl.value + "°";
      atualizarPreviewDoPlano();
    });
    corteAfastarEl.addEventListener("change", reconstruirVisualizacao);
    cortarBtn.addEventListener("click", cortarAlvoAtual);
    descartarCortesBtn.addEventListener("click", descartarCortes);
    baixarPecasBtn.addEventListener("click", () => {
      if (!state || !state.pecas.length) return;
      exportarTodasAsPecas().then(function (arquivo) {
        ModelParser.baixarBlob(arquivo.blob, arquivo.nome);
      }).catch(function (err) {
        if (window.console && console.error) console.error("Split 3MF:", err);
        mostrarErro("Não foi possível gerar o arquivo com todas as peças.");
      });
    });

    if (baixarTudoBtn) {
      baixarTudoBtn.addEventListener("click", () => {
        exportarTodasAsUnidades().catch(function (err) {
          if (window.console && console.error) console.error("Split 3MF:", err);
          mostrarErro("Não foi possível gerar o arquivo .zip com todas as unidades.");
        });
      });
    }
  }
})();
