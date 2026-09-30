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
    // dimensões + botão de download individual).
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

        const baixarBtn = document.createElement("button");
        baixarBtn.type = "button";
        baixarBtn.className = "btn btn-secondary split3mf-card-baixar";
        baixarBtn.textContent = "Baixar";
        baixarBtn.addEventListener("click", function () {
          exportarUnidadePreservandoPacote(unidade).then(function (resultado) {
            ModelParser.baixarBlob(resultado.blob, resultado.nome);
          });
        });
        card.appendChild(baixarBtn);

        listaEl.appendChild(card);
      });
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
      if (!state || !state.unidades.length) return;
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
    // filtrarBuildParaObjectIds (test/split-3mf-build-filter.test.js) — o
    // restante do módulo não roda fora de uma página com #split3mf no DOM.
    window.Wisky3D = window.Wisky3D || {};
    window.Wisky3D.Split3MF = {
      filtrarBuildParaObjectIds: filtrarBuildParaObjectIds
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
        exportarTodasAsUnidades();
      });
    }
  }
})();
