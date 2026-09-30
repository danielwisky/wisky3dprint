// ---------------------------------------------------------------------------
// BLOCO: Split 3MF. Separa um arquivo 3MF com várias chapas/objetos em
// arquivos individuais. Nesta etapa, o upload já detecta as unidades
// separáveis (chapas, se o pacote tiver Metadata/model_settings.config com
// mais de uma chapa; senão, um objeto de build de nível topo por unidade) e
// lista suas dimensões — a geração dos arquivos separados de fato (download)
// vem em tasks seguintes.
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

    // Popula #split3mf-lista com um card por unidade detectada (rótulo +
    // dimensões + botão de download individual + botão "Separar por cor").
    function renderListaUnidades(unidades) {
      listaEl.innerHTML = "";
      unidades.forEach(function (unidade) {
        const card = document.createElement("div");
        card.className = "split3mf-card";
        card.dataset.unidadeId = String(unidade.id);

        const titulo = document.createElement("div");
        titulo.className = "split3mf-card-titulo";
        titulo.textContent = unidade.rotulo;
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
      });
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
          const topId = origin && (origin.topObjectId !== undefined ? origin.topObjectId : origin.objectId);
          if (origin && idsUnidade.indexOf(String(topId)) !== -1) {
            triangulos.push(resultado.triangulos[i]);
            origins.push(origin);
          }
        });

        const triCount = triangulos.length;
        if (!triCount) return [];

        const configEntry = ModelParser.localizarArquivoUnico(state.zip, "project_settings.config");
        const configPromise = configEntry
          ? configEntry.async("text").then(function (texto) {
              try {
                return JSON.parse(texto);
              } catch (e) {
                return null;
              }
            })
          : Promise.resolve(null);

        const modelDoc = new DOMParser().parseFromString(state.modelText, "application/xml");

        return configPromise.then(function (projectSettingsConfig) {
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

        // Sem folha de CSS dedicada ao Split 3MF ainda (nenhuma classe
        // split3mf-* tem regras em assets/css/ até esta task), então o
        // tamanho/formato do quadrado de cor é inline aqui mesmo — senão o
        // <span> fica sem dimensão e a amostra não aparece.
        const amostra = document.createElement("span");
        amostra.className = "split3mf-cor-amostra";
        amostra.style.background = rgbParaHex(grupo.cor);
        amostra.style.display = "inline-block";
        amostra.style.width = "14px";
        amostra.style.height = "14px";
        amostra.style.borderRadius = "3px";
        amostra.style.marginRight = "6px";
        amostra.style.verticalAlign = "middle";
        amostra.style.border = "1px solid rgba(0,0,0,0.15)";
        titulo.appendChild(amostra);
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
                state = {
                  file: file,
                  zip: zip,
                  modelPath: modelPath,
                  modelText: modelText,
                  modelSettingsPath: modelSettingsEntry ? modelSettingsEntry.name : null,
                  modelSettingsText: modelSettingsText,
                  modo: resultado.modo,
                  unidades: resultado.unidades
                };
                renderListaUnidades(state.unidades);
                painel.hidden = false;
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
    // exportarGruposDeCorComoObjects (test/split-3mf-color-export.test.js) —
    // o restante do módulo não roda fora de uma página com #split3mf no DOM.
    window.Wisky3D = window.Wisky3D || {};
    window.Wisky3D.Split3MF = {
      filtrarBuildParaObjectIds: filtrarBuildParaObjectIds,
      agruparPorCorContigua: agruparPorCorContigua,
      exportarGruposDeCorComoObjects: exportarGruposDeCorComoObjects
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
