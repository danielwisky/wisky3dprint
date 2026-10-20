(function () {
// ---------------------------------------------------------------------------
// BLOCO: Conversor 3MF. Troca o perfil de máquina de um projeto 3MF já
// fatiado (Bambu Studio/Orca Slicer) pelo de outra impressora, mantendo
// todos os ajustes de processo escolhidos pelo usuário (suporte, preenchimento,
// paredes, velocidades, filamento etc.) e sobrescrevendo só os campos que
// descrevem o hardware da impressora de destino. Perfis vêm de
// assets/data/printer-profiles.json.
// ---------------------------------------------------------------------------

  var root = document.getElementById("conv3mf");
  if (!root) return;

  var ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  var ToolUtils = window.Wisky3D && window.Wisky3D.ToolUtils;

  var dropzone = document.getElementById("conv3mf-dropzone");
  var upload = document.getElementById("conv3mf-upload");
  var loadingEl = document.getElementById("conv3mf-loading");
  var erroEl = document.getElementById("conv3mf-erro");
  var painel = document.getElementById("conv3mf-painel");
  var deNomeEl = document.getElementById("conv3mf-de-nome");
  var deSubEl = document.getElementById("conv3mf-de-sub");
  var dePaletaEl = document.getElementById("conv3mf-de-paleta");
  var destinosEl = document.getElementById("conv3mf-destinos");
  var destinosContagemEl = document.getElementById("conv3mf-destinos-contagem");
  var semResultadoEl = document.getElementById("conv3mf-sem-resultado");
  var buscaEl = document.getElementById("conv3mf-busca");
  var avisoEl = document.getElementById("conv3mf-aviso");
  var selecionadoEl = document.getElementById("conv3mf-selecionado");
  var gerarBtn = document.getElementById("conv3mf-gerar");
  var outEl = document.getElementById("conv3mf-out");

  if (!ModelParser || !ToolUtils) {
    erroEl.textContent = "Não foi possível carregar o conversor. Recarregue a página e tente novamente.";
    erroEl.hidden = false;
    return;
  }

  var cargas = ToolUtils.criarSequenciador();

  // Guarda os dados do último arquivo processado pra poder re-renderizar o
  // grid de destinos quando o usuário digita na busca, sem reler o 3MF.
  var destinosData = null; // { perfis, chaveDetectada, bbox }

  // Prefixos de campos que descrevem o hardware da impressora de destino
  // (mesa, extrusores, gcode de máquina, AMS), únicos sobrescritos pelo
  // perfil de destino. Todo o resto do projeto original do usuário é mantido.
  var PREFIXOS_CAMPOS_DESTINO = [
    "printer_", "machine_", "extruder_", "bed_", "printable_", "ams_"
  ];

  // Campos avulsos (sem prefixo comum) que também descrevem o hardware da
  // impressora de destino: bico, mesa, gcodes de máquina e compatibilidade.
  var CAMPOS_DESTINO = [
    "nozzle_diameter", "nozzle_type", "nozzle_height", "nozzle_volume",
    "nozzle_volume_type", "nozzle_hrc", "required_nozzle_HRC", "nozzle_flush_dataset",
    "thumbnails", "thumbnails_format", "host_type", "gcode_flavor", "silent_mode",
    "print_compatible_printers", "upward_compatible_machine",
    "compatible_machine_expression_group", "default_filament_profile",
    "default_print_profile", "scan_first_layer", "color_bed_exclude_area",
    "curr_bed_type", "default_bed_type", "best_object_pos",
    "head_wrap_detect_zone", "wrapping_exclude_area", "wrapping_detection_gcode",
    "before_layer_change_gcode", "layer_change_gcode", "change_filament_gcode",
    "time_lapse_gcode", "version"
  ];

  // Cada fatiador lê a versão do projeto em <metadata name="Application">
  // no 3dmodel.model e avisa que o software está desatualizado quando ela é
  // maior que a dele. Gravamos o mesmo valor que o fatiador da marca de
  // destino grava ao exportar ({v} = versaoFatiador). O mesmo valor vai
  // para o campo "version" do project_settings.config e para o
  // X-BBL-Client-Version do slice_info.config.
  var APLICACAO_POR_MARCA = {
    "Bambu Lab": "BambuStudio-{v}",
    "Flashforge": "BambuStudio-{v}",
    "WonderMaker": "OrcaSlicer-{v}",
    "Anycubic": "BambuStudio-{v}",
    "Creality": "Creality_Print V{v} Release",
    "Elegoo": "ElegooSlicer-{v}",
    "Snapmaker": "Snapmaker_Orca-{v}",
    "Qidi": "QIDIStudio-{v}"
  };

  // O "version" dos perfis Flashforge é o do pacote de perfis (01.10.x), não
  // o do Flash Studio, que compara com a versão do OrcaSlicer em que se
  // baseia (2.3.x).
  var VERSAO_FATIADOR_POR_MARCA = {
    "Flashforge": "2.3.0"
  };

  function versaoFatiador(perfil) {
    return VERSAO_FATIADOR_POR_MARCA[perfil.marca] || perfil.base.version;
  }

  // Mesma opção com nome diferente em cada família de fatiador: Bambu Studio
  // e QIDI Studio gravam o primeiro, os derivados do OrcaSlicer o segundo.
  // O valor do perfil de destino diz qual família ele usa; sem a tradução o
  // fatiador de destino avisa que substituiu o valor ao abrir o projeto.
  var VALORES_EQUIVALENTES = {
    ensure_vertical_shell_thickness: [["enabled", "ensure_all"]]
  };

  function traduzirValoresEquivalentes(config, perfilDestino) {
    Object.keys(VALORES_EQUIVALENTES).forEach(function (campo) {
      VALORES_EQUIVALENTES[campo].forEach(function (par) {
        var i = par.indexOf(config[campo]);
        if (i !== -1 && perfilDestino.base[campo] === par[1 - i]) config[campo] = par[1 - i];
      });
    });
  }

  function ehCampoDestino(campo) {
    if (CAMPOS_DESTINO.indexOf(campo) !== -1) return true;
    return PREFIXOS_CAMPOS_DESTINO.some(function (prefixo) {
      return campo.indexOf(prefixo) === 0;
    });
  }

  var perfisPromise = null;
  var estado = null; // { file, zip, projectConfig, projectConfigPath, modelText, modelPath, sliceInfoText, sliceInfoPath, destinoKeys }
  // Cada geração regrava project_settings.config no mesmo zip compartilhado;
  // duas gerações simultâneas misturariam a config de uma impressora no
  // arquivo da outra.
  var gerando = false;
  var DIACRITICOS_REGEX = /[̀-ͯ]/g;

  function carregarPerfis() {
    if (!perfisPromise) {
      perfisPromise = fetch(root.dataset.profilesUrl).then(function (r) {
        if (!r.ok) throw new Error("falha ao carregar perfis");
        return r.json();
      });
    }
    return perfisPromise;
  }

  function mostrarErro(msg) {
    erroEl.textContent = msg;
    erroEl.hidden = !msg;
  }

  function mostrarCarregando(ativo) {
    loadingEl.hidden = !ativo;
  }

  function nomeBaseImpressora(nome) {
    // "Bambu Lab A1 — bico 0.4" -> "Bambu Lab A1"
    return nome.split(" — ")[0].trim();
  }

  function parsePrintableArea(printableArea) {
    var pontos = [];
    (printableArea || []).forEach(function (trecho) {
      trecho.split(",").forEach(function (par) {
        var xy = par.split("x");
        if (xy.length === 2) {
          var x = parseFloat(xy[0]);
          var y = parseFloat(xy[1]);
          if (!isNaN(x) && !isNaN(y)) pontos.push([x, y]);
        }
      });
    });
    if (!pontos.length) return null;
    var xs = pontos.map(function (p) { return p[0]; });
    var ys = pontos.map(function (p) { return p[1]; });
    return {
      largura: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      profundidade: Math.max.apply(null, ys) - Math.min.apply(null, ys)
    };
  }

  function primeiroValor(campo) {
    if (Array.isArray(campo)) return campo[0];
    return campo;
  }

  function detectarPerfilOrigem(config, perfis) {
    var alvo = (config.printer_model || config.printer_settings_id || "").toLowerCase();
    if (!alvo) return null;
    var chaves = Object.keys(perfis);
    for (var i = 0; i < chaves.length; i++) {
      var base = nomeBaseImpressora(perfis[chaves[i]].nome).toLowerCase();
      if (alvo.indexOf(base) === 0 || base.indexOf(alvo) === 0) return chaves[i];
    }
    return null;
  }

  function renderPaleta(el, cores) {
    el.innerHTML = "";
    (cores || []).forEach(function (cor) {
      var span = document.createElement("span");
      span.className = "conv3mf-swatch";
      span.style.background = cor;
      span.title = cor;
      el.appendChild(span);
    });
  }

  function renderOrigem(config, perfis, bbox, chapas) {
    var chaveDetectada = detectarPerfilOrigem(config, perfis);
    var nomeDetectado = chaveDetectada ? perfis[chaveDetectada].nome : (config.printer_model || config.printer_settings_id || "Impressora não identificada");
    deNomeEl.textContent = nomeDetectado;

    var bico = primeiroValor(config.nozzle_diameter);
    var tempBico = primeiroValor(config.nozzle_temperature);
    var partes = [];
    if (bico) partes.push("Bico " + bico + "mm");
    if (tempBico) partes.push(tempBico + "°C");
    if (chapas) {
      // Várias chapas independentes: o bbox combinado não representa nenhuma
      // mesa real, então mostramos a contagem e o tamanho da maior chapa.
      var maior = chapas.reduce(function (a, b) {
        var areaA = (a.bbox.maxX - a.bbox.minX) * (a.bbox.maxY - a.bbox.minY);
        var areaB = (b.bbox.maxX - b.bbox.minX) * (b.bbox.maxY - b.bbox.minY);
        return areaB > areaA ? b : a;
      });
      partes.push(chapas.length + " chapas");
      partes.push("maior chapa " + (maior.bbox.maxX - maior.bbox.minX).toFixed(0) + " × " + (maior.bbox.maxY - maior.bbox.minY).toFixed(0) + " × " + (maior.bbox.maxZ - maior.bbox.minZ).toFixed(0) + "mm");
    } else if (bbox) {
      var largura = (bbox.maxX - bbox.minX).toFixed(0);
      var profundidade = (bbox.maxY - bbox.minY).toFixed(0);
      var altura = (bbox.maxZ - bbox.minZ).toFixed(0);
      partes.push(largura + " × " + profundidade + " × " + altura + "mm");
    }
    deSubEl.textContent = partes.join(" · ");

    renderPaleta(dePaletaEl, config.filament_colour);
    return chaveDetectada;
  }

  function normalizarBusca(texto) {
    return (texto || "")
      .toLowerCase()
      .normalize("NFD").replace(DIACRITICOS_REGEX, "");
  }

  function toggleDestino(chave) {
    if (!estado) return;
    var idx = estado.destinoKeys.indexOf(chave);
    if (idx === -1) estado.destinoKeys.push(chave);
    else estado.destinoKeys.splice(idx, 1);

    var btn = destinosEl.querySelector('[data-key="' + chave + '"]');
    var selecionado = estado.destinoKeys.indexOf(chave) !== -1;
    if (btn) {
      btn.classList.toggle("is-selecionado", selecionado);
      btn.setAttribute("aria-selected", selecionado ? "true" : "false");
    }
    atualizarSelecaoUI();
  }

  function atualizarSelecaoUI() {
    var chaves = estado.destinoKeys;
    var n = chaves.length;
    gerarBtn.disabled = gerando || n === 0;
    gerarBtn.textContent = n > 1 ? "Gerar " + n + " projetos convertidos (.zip)" : "Gerar projeto convertido";

    if (n === 0) {
      selecionadoEl.hidden = true;
    } else {
      selecionadoEl.hidden = false;
      var nomes = chaves.map(function (chave) {
        return nomeBaseImpressora(destinosData.perfis[chave].nome);
      });
      selecionadoEl.textContent = n === 1
        ? "Destino selecionado: " + nomes[0]
        : n + " destinos selecionados: " + nomes.join(", ");
    }

    atualizarAvisoMultiplo();
  }

  function atualizarAvisoMultiplo() {
    var bbox = destinosData && destinosData.bbox;
    var chapas = destinosData && destinosData.chapas;
    var foraDaMesa = [];

    estado.destinoKeys.forEach(function (chave) {
      var perfil = destinosData.perfis[chave];
      var area = parsePrintableArea(perfil.base.printable_area);
      var altura = parseFloat(perfil.base.printable_height);
      if (!area || (!bbox && !chapas)) return;
      var cabe = chapas
        ? chapas.every(function (chapa) { return cabeNaMesa(chapa.bbox, area, altura); })
        : cabeNaMesa(bbox, area, altura);
      if (!cabe) foraDaMesa.push(nomeBaseImpressora(perfil.nome));
    });

    if (!foraDaMesa.length) {
      avisoEl.hidden = true;
      return;
    }
    avisoEl.hidden = false;
    avisoEl.textContent = "O modelo pode não caber na mesa de: " + foraDaMesa.join(", ") + ". O(s) projeto(s) será(ão) gerado(s) do mesmo jeito. Reposicione as peças no fatiador de destino se precisar.";
  }

  function renderDestinos(perfis, chaveDetectada, bbox, chapas, filtro) {
    destinosEl.innerHTML = "";
    var termo = normalizarBusca(filtro);

    var chaves = Object.keys(perfis).filter(function (chave) {
      if (!termo) return true;
      var perfil = perfis[chave];
      var alvo = normalizarBusca(perfil.marca + " " + perfil.nome);
      return alvo.indexOf(termo) !== -1;
    });

    chaves.sort(function (a, b) {
      var pa = perfis[a], pb = perfis[b];
      return (pa.marca + pa.nome).localeCompare(pb.marca + pb.nome);
    });

    destinosContagemEl.textContent = chaves.length + (chaves.length === 1 ? " impressora" : " impressoras");
    semResultadoEl.hidden = chaves.length > 0;

    var marcaAtual = null;
    chaves.forEach(function (chave) {
      var perfil = perfis[chave];
      if (perfil.marca !== marcaAtual) {
        marcaAtual = perfil.marca;
        var grupo = document.createElement("div");
        grupo.className = "conv3mf-grupo";
        grupo.setAttribute("role", "presentation");
        grupo.textContent = marcaAtual;
        destinosEl.appendChild(grupo);
      }

      var jaSelecionado = !!(estado && estado.destinoKeys.indexOf(chave) !== -1);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "conv3mf-destino";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", jaSelecionado ? "true" : "false");
      btn.dataset.key = chave;
      if (chave === chaveDetectada) btn.classList.add("is-atual");
      if (jaSelecionado) btn.classList.add("is-selecionado");

      var nome = document.createElement("span");
      nome.className = "conv3mf-destino-nome";
      nome.textContent = nomeBaseImpressora(perfil.nome);
      var marca = document.createElement("span");
      marca.className = "conv3mf-destino-marca";
      marca.textContent = perfil.marca;

      btn.appendChild(nome);
      btn.appendChild(marca);
      btn.addEventListener("click", function () {
        toggleDestino(chave);
      });

      destinosEl.appendChild(btn);
    });
  }

  function cabeNaMesa(bbox, area, altura) {
    var largura = bbox.maxX - bbox.minX;
    var profundidade = bbox.maxY - bbox.minY;
    var alturaModelo = bbox.maxZ - bbox.minZ;
    return largura <= area.largura && profundidade <= area.profundidade && (!altura || alturaModelo <= altura);
  }

  function montarNovoConfig(configOriginal, perfilDestino) {
    var novo = {};
    Object.keys(configOriginal).forEach(function (k) {
      novo[k] = configOriginal[k];
    });
    Object.keys(perfilDestino.base).forEach(function (k) {
      if (ehCampoDestino(k)) novo[k] = perfilDestino.base[k];
    });
    if (versaoFatiador(perfilDestino)) novo.version = versaoFatiador(perfilDestino);
    traduzirValoresEquivalentes(novo, perfilDestino);
    var torres = ModelParser.reposicionarTorres(configOriginal, configOriginal.printable_area, perfilDestino.base.printable_area);
    if (torres) {
      novo.wipe_tower_x = torres.wipe_tower_x;
      novo.wipe_tower_y = torres.wipe_tower_y;
    }
    return novo;
  }

  function montarNovoModelo(modelText, printableAreaOrigem, perfilDestino) {
    var novo = ModelParser.reposicionarPorMesa(modelText, printableAreaOrigem, perfilDestino.base.printable_area) || modelText;
    var formato = APLICACAO_POR_MARCA[perfilDestino.marca];
    if (!formato || !versaoFatiador(perfilDestino)) return novo;
    var aplicacao = formato.replace("{v}", versaoFatiador(perfilDestino));
    // OrcaSlicer e Elegoo Slicer priorizam a versão de <metadata
    // name="OrcaSlicer"> sobre a de Application; a do projeto original
    // dispararia o mesmo aviso.
    novo = novo.replace(/\s*<metadata\s+name="OrcaSlicer"\s*>[^<]*<\/metadata>/g, "");
    var tag = /(<metadata\s+name="Application"\s*>)[^<]*(<\/metadata>)/;
    if (tag.test(novo)) return novo.replace(tag, "$1" + aplicacao + "$2");
    return novo.replace(/(<model\b[^>]*>)/, '$1\n <metadata name="Application">' + aplicacao + "</metadata>");
  }

  function montarNovoSliceInfo(sliceInfoText, perfilDestino) {
    var versao = versaoFatiador(perfilDestino);
    if (!versao) return sliceInfoText;
    return sliceInfoText.replace(/(<header_item\s+key="X-BBL-Client-Version"\s+value=")[^"]*(")/, "$1" + versao + "$2");
  }

  function nomeArquivoDestino(nomeOriginal, perfilDestino) {
    var base = nomeOriginal.replace(/\.3mf$/i, "");
    var slug = nomeBaseImpressora(perfilDestino.nome)
      .toLowerCase()
      .normalize("NFD").replace(DIACRITICOS_REGEX, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return base + "_" + slug + ".3mf";
  }

  var baixarBlob = ModelParser.baixarBlob;

  function nomeArquivoZip(nomeOriginal) {
    return nomeOriginal.replace(/\.3mf$/i, "") + "-convertidos.zip";
  }

  function gerarProjetoUnico(projeto, perfilDestino, nivelCompressao) {
    var novoConfig = montarNovoConfig(projeto.projectConfig, perfilDestino);
    projeto.zip.file(projeto.projectConfigPath, JSON.stringify(novoConfig, null, 4));
    if (projeto.modelText) projeto.zip.file(projeto.modelPath, montarNovoModelo(projeto.modelText, projeto.projectConfig.printable_area, perfilDestino));
    if (projeto.sliceInfoText) projeto.zip.file(projeto.sliceInfoPath, montarNovoSliceInfo(projeto.sliceInfoText, perfilDestino));
    // Sem compression:"DEFLATE" o JSZip descompacta o conteúdo original e
    // regrava sem compactar, inflando um 3MF de dezenas de MB pra centenas.
    // O nível é reduzido quando há vários destinos: a malha (que não muda
    // entre eles) seria recompactada do zero a cada um, e nível baixo é
    // bem mais rápido com perda pequena de compactação.
    return projeto.zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: nivelCompressao } });
  }

  function gerarProjeto() {
    if (gerando || !estado || !estado.destinoKeys.length) return;
    var projeto = estado;
    var chaves = projeto.destinoKeys.slice();
    gerando = true;
    gerarBtn.disabled = true;

    carregarPerfis().then(function (perfis) {
      if (chaves.length === 1) {
        var perfilDestino = perfis[chaves[0]];
        outEl.textContent = "Gerando arquivo...";
        return gerarProjetoUnico(projeto, perfilDestino, 6).then(function (blob) {
          baixarBlob(blob, nomeArquivoDestino(projeto.file.name, perfilDestino));
          outEl.textContent = "Projeto convertido para " + nomeBaseImpressora(perfilDestino.nome) + " baixado.";
        });
      }

      // Com vários destinos, a malha (idêntica em todos) seria recompactada
      // do zero em cada um: nível baixo mantém a geração rápida às custas de
      // um .3mf um pouco maior.
      var zipFinal = new JSZip();
      return chaves.reduce(function (promessa, chave, indice) {
        return promessa.then(function () {
          var perfil = perfis[chave];
          outEl.textContent = "Gerando projeto " + (indice + 1) + " de " + chaves.length + " (" + nomeBaseImpressora(perfil.nome) + ")...";
          return gerarProjetoUnico(projeto, perfil, 1).then(function (blob) {
            zipFinal.file(nomeArquivoDestino(projeto.file.name, perfil), blob);
          });
        });
      }, Promise.resolve()).then(function () {
        outEl.textContent = "Compactando " + chaves.length + " projetos em um .zip...";
        return zipFinal.generateAsync({ type: "blob" });
      }).then(function (blob) {
        baixarBlob(blob, nomeArquivoZip(projeto.file.name));
        outEl.textContent = chaves.length + " projetos convertidos baixados em um .zip.";
      });
    }).catch(function () {
      outEl.textContent = "Não foi possível gerar o(s) projeto(s) convertido(s).";
    }).then(function () {
      gerando = false;
      if (estado === projeto) gerarBtn.disabled = projeto.destinoKeys.length === 0;
    });
  }

  function processarArquivo(file) {
    if (!file) return;
    if (!/\.3mf$/i.test(file.name)) {
      mostrarErro("Formato não suportado. Envie um arquivo .3mf.");
      return;
    }

    var id = cargas.proximo();
    mostrarErro("");
    mostrarCarregando(true);
    painel.hidden = true;
    estado = null;

    var pacote = null;
    Promise.all([ToolUtils.lerPacote3MF(file), carregarPerfis()])
      .then(function (resultados) {
        pacote = resultados[0];
        var perfis = resultados[1];
        if (!pacote.configText) throw new Error("project_settings.config não encontrado");

        var config = JSON.parse(pacote.configText);
        var geometriaPromise = pacote.modelText
          ? ModelParser.parse3MFPackage(pacote.zip, pacote.modelText)
          : Promise.resolve(null);

        return geometriaPromise.then(function (res) {
          if (!cargas.ehAtual(id)) return;
          var bbox = res ? res.bbox : null;
          var chapas = res ? ModelParser.calcularChapas(res.itens, ModelParser.parsePlateAssignments(pacote.modelSettingsText)) : null;

          estado = { file: file, zip: pacote.zip, projectConfig: config, projectConfigPath: pacote.configPath, modelText: pacote.modelText, modelPath: pacote.modelPath, sliceInfoText: pacote.sliceInfoText, sliceInfoPath: pacote.sliceInfoPath, destinoKeys: [] };
          var chaveDetectada = renderOrigem(config, perfis, bbox, chapas);
          destinosData = { perfis: perfis, chaveDetectada: chaveDetectada, bbox: bbox, chapas: chapas };
          buscaEl.value = "";
          renderDestinos(perfis, chaveDetectada, bbox, chapas, "");
          gerarBtn.disabled = true;
          gerarBtn.textContent = "Gerar projeto convertido";
          outEl.textContent = "";
          avisoEl.hidden = true;
          selecionadoEl.hidden = true;
          painel.hidden = false;
        });
      })
      .catch(function (err) {
        if (!cargas.ehAtual(id)) return;
        // eslint-disable-next-line no-console
        if (window.console && console.error) console.error("Conversor 3MF:", err);
        var detalhe = err && err.message ? " (" + err.message + ")" : "";
        mostrarErro("Não foi possível ler esse arquivo 3MF. Confirme que é um projeto exportado do Bambu Studio ou Orca Slicer." + detalhe);
      })
      .then(function () {
        if (cargas.ehAtual(id)) mostrarCarregando(false);
      });
  }

  ToolUtils.ligarDropzone(dropzone, upload, processarArquivo);

  gerarBtn.addEventListener("click", gerarProjeto);

  buscaEl.addEventListener("input", function () {
    if (!destinosData) return;
    renderDestinos(destinosData.perfis, destinosData.chaveDetectada, destinosData.bbox, destinosData.chapas, buscaEl.value);
  });
})();
