(function () {
// ---------------------------------------------------------------------------
// BLOCO: Conversor 3MF — troca o perfil de máquina de um projeto 3MF já
// fatiado (Bambu Studio/Orca Slicer) pelo de outra impressora, mantendo
// todos os ajustes de processo escolhidos pelo usuário (suporte, preenchimento,
// paredes, velocidades, filamento etc.) e sobrescrevendo só os campos que
// descrevem o hardware da impressora de destino. Perfis vêm de
// assets/data/printer-profiles.json.
// ---------------------------------------------------------------------------

  var root = document.getElementById("conv3mf");
  if (!root) return;

  var ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;

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

  // Guarda os dados do último arquivo processado pra poder re-renderizar o
  // grid de destinos quando o usuário digita na busca, sem reler o 3MF.
  var destinosData = null; // { perfis, chaveDetectada, bbox }

  // Prefixos de campos que descrevem o hardware da impressora de destino
  // (mesa, extrusores, gcode de máquina, AMS) — únicos sobrescritos pelo
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
    "time_lapse_gcode"
  ];

  function ehCampoDestino(campo) {
    if (CAMPOS_DESTINO.indexOf(campo) !== -1) return true;
    return PREFIXOS_CAMPOS_DESTINO.some(function (prefixo) {
      return campo.indexOf(prefixo) === 0;
    });
  }

  var perfisPromise = null;
  var estado = null; // { file, zip, projectConfig, projectConfigPath, destinoKeys }
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

  // Um 3MF pode conter várias chapas independentes (plates), cada uma com seu
  // próprio arranjo de peças. Sem isso, o bbox combinado de todas as chapas
  // dava um "tamanho" maior que qualquer mesa real e gerava avisos de encaixe
  // falsos. Lê Metadata/model_settings.config e devolve, por chapa, a lista de
  // object_id das peças que pertencem a ela (ou null se o arquivo não tem
  // metadados de chapa, caso de projetos com uma chapa só).
  function parsePlateAssignments(modelSettingsText) {
    if (!modelSettingsText || typeof DOMParser === "undefined") return null;
    try {
      var doc = new DOMParser().parseFromString(modelSettingsText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return null;
      var plateEls = doc.getElementsByTagName("plate");
      if (!plateEls.length) return null;

      var chapas = [];
      for (var i = 0; i < plateEls.length; i++) {
        var instancias = plateEls[i].getElementsByTagName("model_instance");
        var ids = [];
        for (var j = 0; j < instancias.length; j++) {
          var metas = instancias[j].getElementsByTagName("metadata");
          for (var k = 0; k < metas.length; k++) {
            if (metas[k].getAttribute("key") === "object_id") {
              ids.push(metas[k].getAttribute("value"));
            }
          }
        }
        if (ids.length) chapas.push(ids);
      }
      return chapas.length > 1 ? chapas : null;
    } catch (e) {
      return null;
    }
  }

  function mesclarBBox(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ)
    };
  }

  // Junta o bbox dos itens (retornados por ModelParser.parse3MFPackage) de
  // acordo com a lista de object_id de cada chapa, gerando um bbox por chapa
  // em vez de um bbox único pra todo o arquivo.
  function calcularChapas(itens, plateAssignments) {
    if (!plateAssignments || !itens) return null;
    var chapas = plateAssignments.map(function (ids, indice) {
      var bbox = null;
      itens.forEach(function (item) {
        if (ids.indexOf(item.objectId) !== -1) bbox = mesclarBBox(bbox, item.bbox);
      });
      return { indice: indice + 1, bbox: bbox };
    }).filter(function (chapa) { return chapa.bbox; });
    return chapas.length > 1 ? chapas : null;
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
    gerarBtn.disabled = n === 0;
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
    return novo;
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

  function baixarBlob(blob, nomeArquivo) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function nomeArquivoZip(nomeOriginal) {
    return nomeOriginal.replace(/\.3mf$/i, "") + "-convertidos.zip";
  }

  function gerarProjetoUnico(perfilDestino) {
    var novoConfig = montarNovoConfig(estado.projectConfig, perfilDestino);
    estado.zip.file(estado.projectConfigPath, JSON.stringify(novoConfig, null, 4));
    // Sem compression:"DEFLATE" o JSZip descompacta o conteúdo original e
    // regrava sem compactar, inflando um 3MF de dezenas de MB pra centenas.
    return estado.zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function gerarProjeto() {
    if (!estado || !estado.destinoKeys.length) return;
    var chaves = estado.destinoKeys.slice();

    carregarPerfis().then(function (perfis) {
      if (chaves.length === 1) {
        var perfilDestino = perfis[chaves[0]];
        outEl.textContent = "Gerando arquivo...";
        return gerarProjetoUnico(perfilDestino).then(function (blob) {
          baixarBlob(blob, nomeArquivoDestino(estado.file.name, perfilDestino));
          outEl.textContent = "Projeto convertido para " + nomeBaseImpressora(perfilDestino.nome) + " baixado.";
        });
      }

      var zipFinal = new JSZip();
      return chaves.reduce(function (promessa, chave, indice) {
        return promessa.then(function () {
          var perfil = perfis[chave];
          outEl.textContent = "Gerando projeto " + (indice + 1) + " de " + chaves.length + " (" + nomeBaseImpressora(perfil.nome) + ")...";
          return gerarProjetoUnico(perfil).then(function (blob) {
            zipFinal.file(nomeArquivoDestino(estado.file.name, perfil), blob);
          });
        });
      }, Promise.resolve()).then(function () {
        outEl.textContent = "Compactando " + chaves.length + " projetos em um .zip...";
        return zipFinal.generateAsync({ type: "blob" });
      }).then(function (blob) {
        baixarBlob(blob, nomeArquivoZip(estado.file.name));
        outEl.textContent = chaves.length + " projetos convertidos baixados em um .zip.";
      });
    }).catch(function () {
      outEl.textContent = "Não foi possível gerar o(s) projeto(s) convertido(s).";
    });
  }

  function processarArquivo(file) {
    if (!file) return;
    if (!/\.3mf$/i.test(file.name)) {
      mostrarErro("Formato não suportado. Envie um arquivo .3mf.");
      return;
    }
    if (typeof JSZip === "undefined") {
      mostrarErro("Não foi possível carregar o leitor de 3MF. Verifique sua conexão e tente novamente.");
      return;
    }

    mostrarErro("");
    mostrarCarregando(true);
    painel.hidden = true;
    estado = null;

    var zipRef = null;
    Promise.all([JSZip.loadAsync(file), carregarPerfis()])
      .then(function (resultados) {
        var zip = resultados[0];
        var perfis = resultados[1];
        zipRef = zip;

        var configFiles = zip.file(/project_settings\.config$/i);
        if (!configFiles.length) throw new Error("project_settings.config não encontrado");

        var modelFiles = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
        if (!modelFiles.length) modelFiles = zip.file(/3dmodel\.model$/i);

        var modelSettingsFiles = zip.file(/model_settings\.config$/i);

        return Promise.all([
          configFiles[0].async("text"),
          configFiles[0].name,
          modelFiles.length ? modelFiles[0].async("text") : Promise.resolve(null),
          modelSettingsFiles.length ? modelSettingsFiles[0].async("text") : Promise.resolve(null)
        ]).then(function (r) {
          return { perfis: perfis, configText: r[0], configPath: r[1], modelText: r[2], modelSettingsText: r[3] };
        });
      })
      .then(function (r) {
        var config = JSON.parse(r.configText);
        var geometriaPromise = (r.modelText && ModelParser)
          ? ModelParser.parse3MFPackage(zipRef, r.modelText)
          : Promise.resolve(null);

        return geometriaPromise.then(function (res) {
          var bbox = res ? res.bbox : null;
          var chapas = res ? calcularChapas(res.itens, parsePlateAssignments(r.modelSettingsText)) : null;

          estado = { file: file, zip: zipRef, projectConfig: config, projectConfigPath: r.configPath, destinoKeys: [] };
          var chaveDetectada = renderOrigem(config, r.perfis, bbox, chapas);
          destinosData = { perfis: r.perfis, chaveDetectada: chaveDetectada, bbox: bbox, chapas: chapas };
          buscaEl.value = "";
          renderDestinos(r.perfis, chaveDetectada, bbox, chapas, "");
          gerarBtn.disabled = true;
          gerarBtn.textContent = "Gerar projeto convertido";
          outEl.textContent = "";
          avisoEl.hidden = true;
          selecionadoEl.hidden = true;
          painel.hidden = false;
        });
      })
      .catch(function (err) {
        // eslint-disable-next-line no-console
        if (window.console && console.error) console.error("Conversor 3MF:", err);
        var detalhe = err && err.message ? " (" + err.message + ")" : "";
        mostrarErro("Não foi possível ler esse arquivo 3MF. Confirme que é um projeto exportado do Bambu Studio ou Orca Slicer." + detalhe);
      })
      .then(function () {
        mostrarCarregando(false);
      });
  }

  upload.addEventListener("change", function () {
    processarArquivo(upload.files && upload.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach(function (evt) {
    dropzone.addEventListener(evt, function () {
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    processarArquivo(file);
  });

  gerarBtn.addEventListener("click", gerarProjeto);

  buscaEl.addEventListener("input", function () {
    if (!destinosData) return;
    renderDestinos(destinosData.perfis, destinosData.chaveDetectada, destinosData.bbox, destinosData.chapas, buscaEl.value);
  });
})();
