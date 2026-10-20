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

  // Demais opções de impressora do Bambu Studio e do OrcaSlicer
  // (Preset::printer_options() no Preset.cpp de cada um: retração, z-hop,
  // wipe, ventoinhas, troca de filamento, input shaping...), as que o próprio
  // fatiador troca quando o usuário muda de impressora no projeto. Ficam de
  // fora as já cobertas pelos prefixos e pela lista acima, e "inherits", que
  // também é opção de processo.
  var OPCOES_IMPRESSORA_FATIADORES = [
    "adaptive_bed_mesh_margin", "auxiliary_fan", "bbl_use_printhost",
    "belt_frame_tilt_angle", "belt_frame_tilt_decouple", "belt_printer",
    "belt_printer_infinite_y", "belt_slice_rotation",
    "belt_slice_rotation_angle", "belt_support_floor_offset",
    "build_plate_tilt_x", "build_plate_tilt_y", "change_extrusion_role_gcode",
    "cooling_filter_enabled", "cooling_tube_length",
    "cooling_tube_retraction", "default_ams_type",
    "default_nozzle_volume_type", "deretract_speed_extruder_change",
    "deretraction_speed", "disable_m73", "emit_machine_limits_to_gcode",
    "enable_belt_purge_tower", "enable_filament_ramming",
    "enable_long_retraction_when_cut", "enable_power_loss_recovery",
    "enable_pre_heating", "extra_loading_move", "fan_direction",
    "fan_kickstart", "fan_speedup_overhangs", "fan_speedup_time",
    "farthest_point_timelapse", "file_start_gcode",
    "flashforge_serial_number", "gcode_remap_x", "gcode_remap_y",
    "gcode_remap_z", "gcode_skip_config_block", "grab_length",
    "group_algo_with_time", "high_current_on_filament_swap",
    "hotend_cooling_rate", "hotend_heating_rate", "imex_carriage_margin",
    "imex_firmware_managed_zones", "imex_gantry_count",
    "imex_mode_active_tools", "imex_mode_gcodes", "imex_mode_names",
    "imex_nozzle_clearance_x", "imex_nozzle_clearance_y", "imex_tool_layout",
    "imex_tools_per_gantry", "imex_viz_theme", "input_shaping_damp_x",
    "input_shaping_damp_y", "input_shaping_emit", "input_shaping_freq_x",
    "input_shaping_freq_y", "input_shaping_type", "is_imex",
    "long_retractions_when_cut", "manual_filament_change",
    "master_extruder_id", "max_layer_height", "max_resonance_avoidance_speed",
    "min_layer_height", "min_resonance_avoidance_speed",
    "parallel_printheads_bed_exclude_areas", "parallel_printheads_count",
    "parking_pos_retraction", "part_cooling_fan_min_pwm",
    "pellet_modded_printer", "physical_extruder_map", "preferred_orientation",
    "print_host", "print_host_webui", "print_in_clockwise",
    "printhost_apikey", "printhost_authorization_type", "printhost_cafile",
    "printhost_password", "printhost_port", "printhost_ssl_ignore_revoke",
    "printhost_user", "printing_by_object_gcode", "purge_in_prime_tower",
    "resonance_avoidance", "retract_after_wipe", "retract_before_wipe",
    "retract_length_toolchange", "retract_lift_above", "retract_lift_below",
    "retract_lift_enforce", "retract_restart_extra",
    "retract_restart_extra_toolchange", "retract_when_changing_layer",
    "retraction_distances_when_cut", "retraction_length",
    "retraction_minimum_travel", "retraction_speed",
    "single_extruder_multi_material", "support_air_filtration",
    "support_chamber_temp_control", "support_cooling_filter",
    "support_fast_purge_mode", "support_multi_bed_types",
    "support_object_skip_flush", "support_parallel_printheads",
    "template_custom_gcode", "thumbnail_size", "time_cost",
    "tool_change_on_wipe_tower", "travel_slope", "use_3mf",
    "use_firmware_retraction", "use_relative_e_distances",
    "wait_for_temp_on_wipe_tower", "wipe", "wipe_distance", "wipe_tower_type",
    "wrapping_detection_layers", "z_hop", "z_hop_types", "z_offset"
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

  // Mesma opção com valores diferentes em cada família de fatiador. Cada
  // mapa leva um valor de qualquer família ao equivalente na família dele; o
  // valor do perfil de destino diz qual família ele usa. Sem a tradução o
  // fatiador de destino troca o valor desconhecido pelo padrão dele, que pode
  // ser o oposto do escolhido (Bambu "disabled" virava "ensure_all" no Orca).
  var VALORES_POR_FAMILIA = {
    ensure_vertical_shell_thickness: [
      // Bambu Studio, QIDI Studio
      { none: "disabled", ensure_critical_only: "partial", ensure_moderate: "partial", ensure_all: "enabled" },
      // derivados do OrcaSlicer
      { disabled: "none", partial: "ensure_moderate", enabled: "ensure_all" }
    ]
  };

  function traduzirValoresPorFamilia(config, perfilDestino) {
    Object.keys(VALORES_POR_FAMILIA).forEach(function (campo) {
      VALORES_POR_FAMILIA[campo].forEach(function (mapa) {
        var valoresDaFamilia = Object.keys(mapa).map(function (k) { return mapa[k]; });
        if (valoresDaFamilia.indexOf(perfilDestino.base[campo]) === -1) return;
        if (Object.prototype.hasOwnProperty.call(mapa, config[campo])) config[campo] = mapa[config[campo]];
      });
    });
  }

  // G-code de filamento é configuração de filamento (mantida do projeto),
  // mas escrito para a máquina: o da Bambu liga a ventoinha auxiliar dela
  // (M106 P3), o dos Creality K controla a temperatura do bico. Vem do perfil
  // de destino, repetido para cada filamento do projeto (o perfil tem só a
  // quantidade de filamentos dele).
  var GCODE_FILAMENTO_DESTINO = ["filament_start_gcode", "filament_end_gcode"];

  function aplicarGcodeDeFilamento(novo, configOriginal, perfilDestino) {
    var qtdFilamentos = Array.isArray(configOriginal.filament_colour) ? configOriginal.filament_colour.length : 1;
    GCODE_FILAMENTO_DESTINO.forEach(function (campo) {
      if (!Object.prototype.hasOwnProperty.call(perfilDestino.base, campo)) return;
      var doDestino = perfilDestino.base[campo];
      if (!Array.isArray(doDestino)) {
        novo[campo] = doDestino;
        return;
      }
      var qtd = Array.isArray(configOriginal[campo]) ? configOriginal[campo].length : qtdFilamentos;
      var valor = doDestino.length ? doDestino[0] : "";
      novo[campo] = [];
      for (var i = 0; i < qtd; i++) novo[campo].push(valor);
    });
  }

  function ehCampoDestino(campo) {
    if (CAMPOS_DESTINO.indexOf(campo) !== -1 || OPCOES_IMPRESSORA_FATIADORES.indexOf(campo) !== -1) return true;
    return PREFIXOS_CAMPOS_DESTINO.some(function (prefixo) {
      return campo.indexOf(prefixo) === 0;
    });
  }

  var perfisPromise = null;
  var estado = null; // { file, zip, projectConfig, projectConfigPath, modelText, modelPath, sliceInfoText, sliceInfoPath, fatiado, geometria, destinoKeys }
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

  // Casa primeiro o printer_model (único por perfil) e o printer_settings_id
  // exatos. Na falta deles, fica com o perfil de nome mais longo que seja
  // prefixo do modelo: "Bambu Lab A1 mini" não pode cair em "Bambu Lab A1".
  // As Qidi gravam o modelo sem a marca ("Q1 Pro"), por isso o casamento
  // exato vem antes do nome.
  function detectarPerfilOrigem(config, perfis) {
    var modelo = String(config.printer_model || "").toLowerCase();
    var settingsId = String(config.printer_settings_id || "").toLowerCase();
    var alvo = modelo || settingsId;
    if (!alvo) return null;
    var chaves = Object.keys(perfis);
    var campos = [["printer_model", modelo], ["printer_settings_id", settingsId]];
    for (var c = 0; c < campos.length; c++) {
      if (!campos[c][1]) continue;
      for (var i = 0; i < chaves.length; i++) {
        if (String(perfis[chaves[i]].base[campos[c][0]] || "").toLowerCase() === campos[c][1]) return chaves[i];
      }
    }
    var melhor = null;
    var tamanhoMelhor = 0;
    chaves.forEach(function (chave) {
      var base = nomeBaseImpressora(perfis[chave].nome).toLowerCase();
      if (base.length > tamanhoMelhor && alvo.indexOf(base) === 0) {
        melhor = chave;
        tamanhoMelhor = base.length;
      }
    });
    return melhor;
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
      btn.setAttribute("aria-pressed", selecionado ? "true" : "false");
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
        grupo.textContent = marcaAtual;
        destinosEl.appendChild(grupo);
      }

      var jaSelecionado = !!(estado && estado.destinoKeys.indexOf(chave) !== -1);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "conv3mf-destino";
      btn.setAttribute("aria-pressed", jaSelecionado ? "true" : "false");
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

  // `geometria` ({ itens, mesas }, ver processarArquivo) permite pôr a torre
  // de purga num lugar livre de cada mesa (ver posicionarTorres).
  function montarNovoConfig(configOriginal, perfilDestino, geometria) {
    var novo = {};
    // Campos de hardware que o perfil de destino não tem são de outra
    // impressora (AMS de uma Bambu numa Ender-3, segundo bico de uma H2D...).
    Object.keys(configOriginal).forEach(function (k) {
      if (ehCampoDestino(k) && !Object.prototype.hasOwnProperty.call(perfilDestino.base, k)) return;
      novo[k] = configOriginal[k];
    });
    Object.keys(perfilDestino.base).forEach(function (k) {
      if (ehCampoDestino(k)) novo[k] = perfilDestino.base[k];
    });
    if (versaoFatiador(perfilDestino)) novo.version = versaoFatiador(perfilDestino);
    traduzirValoresPorFamilia(novo, perfilDestino);
    aplicarGcodeDeFilamento(novo, configOriginal, perfilDestino);
    var torres = null;
    if (geometria && geometria.itens) {
      var qtdMesas = [].concat(configOriginal.wipe_tower_x == null ? [] : configOriginal.wipe_tower_x).length;
      var pegadas = ModelParser.pegadasPorMesa(geometria.itens, geometria.mesas, configOriginal.printable_area, novo.printable_area, qtdMesas);
      torres = ModelParser.posicionarTorres(configOriginal, novo, perfilDestino.base, pegadas);
    }
    if (!torres) torres = ModelParser.reposicionarTorres(configOriginal, configOriginal.printable_area, perfilDestino.base.printable_area);
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

  function montarNovoSliceInfo(sliceInfoText, perfilDestino, fatiado) {
    // Num projeto fatiado, os <plate> descrevem o fatiamento da origem
    // (tempo, peso, modelo da impressora): ver removerGcodeFatiado.
    var novo = fatiado ? sliceInfoText.replace(/\s*<plate\b[^>]*>[\s\S]*?<\/plate>/g, "") : sliceInfoText;
    var versao = versaoFatiador(perfilDestino);
    if (!versao) return novo;
    return novo.replace(/(<header_item\s+key="X-BBL-Client-Version"\s+value=")[^"]*(")/, "$1" + versao + "$2");
  }

  function nomeArquivoDestino(nomeOriginal, perfilDestino) {
    var base = nomeOriginal.replace(/(\.gcode)?\.3mf$/i, "");
    var slug = nomeBaseImpressora(perfilDestino.nome)
      .toLowerCase()
      .normalize("NFD").replace(DIACRITICOS_REGEX, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return base + "_" + slug + ".3mf";
  }

  var baixarBlob = ModelParser.baixarBlob;

  // Um .gcode.3mf (projeto já fatiado) traz o G-code de cada mesa, feito
  // para a impressora de origem. O projeto convertido sai como um projeto sem
  // fatiar: sem os plate_N.gcode, sem a referência gcode_file das mesas e sem
  // a relação que aponta para eles; o fatiador de destino gera o próprio.
  // Devolve (em promessa) se o projeto estava fatiado.
  function removerGcodeFatiado(pacote) {
    var zip = pacote.zip;
    var gcodes = zip.file(/(^|\/)plate_\d+\.gcode(\.md5)?$/i);
    if (!gcodes.length) return Promise.resolve(false);
    gcodes.forEach(function (arquivo) {
      zip.remove(arquivo.name);
    });
    if (pacote.modelSettingsText && pacote.modelSettingsPath) {
      var settings = pacote.modelSettingsText.replace(/[ \t]*<metadata\s+key="gcode_file"\s+value="[^"]*"\s*\/>\r?\n?/g, "");
      if (settings !== pacote.modelSettingsText) zip.file(pacote.modelSettingsPath, settings);
    }
    var rels = ModelParser.localizarArquivoUnico(zip, "model_settings.config.rels");
    if (!rels) return Promise.resolve(true);
    return rels.async("text").then(function (texto) {
      var semGcode = texto.replace(/\s*<Relationship\b[^>]*\bTarget="[^"]*\.gcode"[^>]*\/>/g, "");
      if (!/<Relationship\b/.test(semGcode)) zip.remove(rels.name);
      else if (semGcode !== texto) zip.file(rels.name, semGcode);
      return true;
    }, function () {
      // A relação só aponta para o G-code: ilegível, não impede a conversão.
      return true;
    });
  }

  function nomeArquivoZip(nomeOriginal) {
    return nomeOriginal.replace(/(\.gcode)?\.3mf$/i, "") + "-convertidos.zip";
  }

  function gerarProjetoUnico(projeto, perfilDestino, nivelCompressao) {
    var novoConfig = montarNovoConfig(projeto.projectConfig, perfilDestino, projeto.geometria);
    projeto.zip.file(projeto.projectConfigPath, JSON.stringify(novoConfig, null, 4));
    if (projeto.modelText) projeto.zip.file(projeto.modelPath, montarNovoModelo(projeto.modelText, projeto.projectConfig.printable_area, perfilDestino));
    if (projeto.sliceInfoText) projeto.zip.file(projeto.sliceInfoPath, montarNovoSliceInfo(projeto.sliceInfoText, perfilDestino, projeto.fatiado));
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
      // Se outro arquivo foi carregado no meio, a seleção dele montou o botão
      // ainda com gerando = true e o deixou desabilitado.
      if (estado) gerarBtn.disabled = estado.destinoKeys.length === 0;
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
          ? ModelParser.parse3MFPackage(pacote.zip, pacote.modelText, pacote.modelSettingsText)
          : Promise.resolve(null);

        return Promise.all([geometriaPromise, removerGcodeFatiado(pacote)]).then(function (r) {
          var res = r[0];
          var fatiado = r[1];
          if (!cargas.ehAtual(id)) return;
          var bbox = res ? res.bbox : null;
          var mesas = ModelParser.parsePlateAssignments(pacote.modelSettingsText);
          var chapas = res ? ModelParser.calcularChapas(res.itens, mesas) : null;

          estado = { file: file, zip: pacote.zip, projectConfig: config, projectConfigPath: pacote.configPath, modelText: pacote.modelText, modelPath: pacote.modelPath, sliceInfoText: pacote.sliceInfoText, sliceInfoPath: pacote.sliceInfoPath, fatiado: fatiado, geometria: res ? { itens: res.itens, mesas: mesas } : null, destinoKeys: [] };
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
