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
    // dimensões). Sem botão de download ainda — isso é a Task 7.
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

        listaEl.appendChild(card);
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
        // TODO: geração do zip com todas as unidades (task futura).
      });
    }
  }
})();
