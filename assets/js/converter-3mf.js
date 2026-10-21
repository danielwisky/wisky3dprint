(function () {
// ---------------------------------------------------------------------------
// BLOCO: Conversor 3MF. Troca o perfil de máquina de um projeto 3MF já
// fatiado (Bambu Studio/Orca Slicer) pelo de outra impressora, mantendo
// todos os ajustes de processo escolhidos pelo usuário (suporte, preenchimento,
// paredes, velocidades, filamento etc.) e sobrescrevendo só os campos que
// descrevem o hardware da impressora de destino. Perfis vêm de
// assets/data/printer-profiles.json.
// ---------------------------------------------------------------------------

  var root = document.getElementById("convert3mf");
  if (!root) return;

  var ModelParser = window.Wisky3D && window.Wisky3D.ModelParser;
  var ToolUtils = window.Wisky3D && window.Wisky3D.ToolUtils;

  var dropzone = document.getElementById("convert3mf-dropzone");
  var upload = document.getElementById("convert3mf-upload");
  var loadingEl = document.getElementById("convert3mf-loading");
  var errorEl = document.getElementById("convert3mf-error");
  var panel = document.getElementById("convert3mf-panel");
  var sourceNameEl = document.getElementById("convert3mf-source-name");
  var sourceSubEl = document.getElementById("convert3mf-source-sub");
  var sourcePaletteEl = document.getElementById("convert3mf-source-palette");
  var targetsEl = document.getElementById("convert3mf-targets");
  var targetsCountEl = document.getElementById("convert3mf-targets-count");
  var noResultEl = document.getElementById("convert3mf-no-result");
  var searchEl = document.getElementById("convert3mf-search");
  var warningEl = document.getElementById("convert3mf-warning");
  var selectedEl = document.getElementById("convert3mf-selected");
  var generateBtn = document.getElementById("convert3mf-generate");
  var outEl = document.getElementById("convert3mf-out");

  if (!ModelParser || !ToolUtils) {
    errorEl.textContent = "Não foi possível carregar o conversor. Recarregue a página e tente novamente.";
    errorEl.hidden = false;
    return;
  }

  var loads = ToolUtils.createSequencer();

  // Guarda os dados do último arquivo processado pra poder re-renderizar o
  // grid de destinos quando o usuário digita na busca, sem reler o 3MF.
  var targetsData = null; // { profiles, detectedKey, bbox, plateBoxes }

  // Prefixos de campos que descrevem o hardware da impressora de destino
  // (mesa, extrusores, gcode de máquina, AMS), únicos sobrescritos pelo
  // perfil de destino. Todo o resto do projeto original do usuário é mantido.
  var TARGET_FIELD_PREFIXES = [
    "printer_", "machine_", "extruder_", "bed_", "printable_", "ams_"
  ];

  // Campos avulsos (sem prefixo comum) que também descrevem o hardware da
  // impressora de destino: bico, mesa, gcodes de máquina e compatibilidade.
  var TARGET_FIELDS = [
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
  var SLICER_PRINTER_OPTIONS = [
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

  // Opções de processo que dependem das cabeças da impressora: numa de
  // várias cabeças (Flashforge Creator 5), ooze_prevention e o pré-aquecimento
  // esquentam a próxima cabeça antes da troca; com os valores de uma
  // impressora de um bico só ela fica fria e não extruda a outra cor.
  // exclude_object depende do firmware.
  var TOOLHEAD_CHANGE_OPTIONS = [
    "ooze_prevention", "standby_temperature_delta", "preheat_time", "preheat_steps",
    "enable_tower_interface_features", "exclude_object"
  ];

  // Cada fatiador lê a versão do projeto em <metadata name="Application">
  // no 3dmodel.model e avisa que o software está desatualizado quando ela é
  // maior que a dele. Gravamos o mesmo valor que o fatiador da marca de
  // destino grava ao exportar ({v} = slicerVersion). O mesmo valor vai
  // para o campo "version" do project_settings.config e para o
  // X-BBL-Client-Version do slice_info.config.
  var APPLICATION_BY_BRAND = {
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
  var SLICER_VERSION_BY_BRAND = {
    "Flashforge": "2.3.0"
  };

  function slicerVersion(profile) {
    return SLICER_VERSION_BY_BRAND[profile.marca] || profile.base.version;
  }

  // Mesma opção com valores diferentes em cada família de fatiador. Cada
  // mapa leva um valor de qualquer família ao equivalente na família dele; o
  // valor do perfil de destino diz qual família ele usa. Sem a tradução o
  // fatiador de destino troca o valor desconhecido pelo padrão dele, que pode
  // ser o oposto do escolhido (Bambu "disabled" virava "ensure_all" no Orca).
  var VALUES_BY_FAMILY = {
    ensure_vertical_shell_thickness: [
      // Bambu Studio, QIDI Studio
      { none: "disabled", ensure_critical_only: "partial", ensure_moderate: "partial", ensure_all: "enabled" },
      // derivados do OrcaSlicer
      { disabled: "none", partial: "ensure_moderate", enabled: "ensure_all" }
    ]
  };

  function translateValuesByFamily(config, targetProfile) {
    Object.keys(VALUES_BY_FAMILY).forEach(function (field) {
      VALUES_BY_FAMILY[field].forEach(function (map) {
        var familyValues = Object.keys(map).map(function (k) { return map[k]; });
        if (familyValues.indexOf(targetProfile.base[field]) === -1) return;
        if (Object.prototype.hasOwnProperty.call(map, config[field])) config[field] = map[config[field]];
      });
    });
  }

  // Opções de filamento (um valor por filamento) que dependem da máquina:
  // o G-code de filamento da Bambu liga a ventoinha auxiliar dela (M106 P3),
  // o dos Creality K controla a temperatura do bico, a dureza de bico
  // exigida (required_nozzle_HRC) é a dos bicos do destino e as demais
  // descrevem a troca de cabeça ou de filamento da máquina. Vêm do perfil de
  // destino, repetidas para cada filamento do projeto (o perfil tem só a
  // quantidade de filamentos dele).
  var TARGET_FILAMENT_FIELDS = [
    "filament_start_gcode", "filament_end_gcode", "required_nozzle_HRC",
    "idle_temperature", "filament_toolchange_delay", "filament_multitool_ramming",
    "filament_multitool_ramming_flow", "filament_multitool_ramming_volume",
    "filament_change_length"
  ];

  function applyFilamentFields(result, originalConfig, targetProfile) {
    var hasColours = Array.isArray(originalConfig.filament_colour);
    TARGET_FILAMENT_FIELDS.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(targetProfile.base, field)) return;
      var targetValue = targetProfile.base[field];
      if (!Array.isArray(targetValue)) {
        result[field] = targetValue;
        return;
      }
      var count = hasColours ? originalConfig.filament_colour.length : (Array.isArray(originalConfig[field]) ? originalConfig[field].length : 1);
      var value = targetValue.length ? targetValue[0] : "";
      result[field] = [];
      for (var i = 0; i < count; i++) result[field].push(value);
    });
  }

  function isTargetField(field) {
    if (TARGET_FIELDS.indexOf(field) !== -1 || SLICER_PRINTER_OPTIONS.indexOf(field) !== -1 || TOOLHEAD_CHANGE_OPTIONS.indexOf(field) !== -1) return true;
    return TARGET_FIELD_PREFIXES.some(function (prefix) {
      return field.indexOf(prefix) === 0;
    });
  }

  var profilesPromise = null;
  var state = null; // { file, zip, projectConfig, projectConfigPath, modelText, modelPath, sliceInfoText, sliceInfoPath, sliced, geometry, targetKeys }
  // Cada geração regrava project_settings.config no mesmo zip compartilhado;
  // duas gerações simultâneas misturariam a config de uma impressora no
  // arquivo da outra.
  var generating = false;
  var DIACRITICS_REGEX = /[̀-ͯ]/g;

  function loadProfiles() {
    if (!profilesPromise) {
      profilesPromise = fetch(root.dataset.profilesUrl).then(function (r) {
        if (!r.ok) throw new Error("falha ao carregar perfis");
        return r.json();
      });
    }
    return profilesPromise;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  function showLoading(active) {
    loadingEl.hidden = !active;
  }

  function printerBaseName(name) {
    // "Bambu Lab A1 — bico 0.4" -> "Bambu Lab A1"
    return name.split(" — ")[0].trim();
  }

  function parsePrintableArea(printableArea) {
    var points = [];
    (printableArea || []).forEach(function (segment) {
      segment.split(",").forEach(function (pair) {
        var xy = pair.split("x");
        if (xy.length === 2) {
          var x = parseFloat(xy[0]);
          var y = parseFloat(xy[1]);
          if (!isNaN(x) && !isNaN(y)) points.push([x, y]);
        }
      });
    });
    if (!points.length) return null;
    var xs = points.map(function (p) { return p[0]; });
    var ys = points.map(function (p) { return p[1]; });
    return {
      width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      depth: Math.max.apply(null, ys) - Math.min.apply(null, ys)
    };
  }

  function firstValue(field) {
    if (Array.isArray(field)) return field[0];
    return field;
  }

  // Casa primeiro o printer_model (único por perfil) e o printer_settings_id
  // exatos. Na falta deles, fica com o perfil de nome mais longo que seja
  // prefixo do modelo: "Bambu Lab A1 mini" não pode cair em "Bambu Lab A1".
  // As Qidi gravam o modelo sem a marca ("Q1 Pro"), por isso o casamento
  // exato vem antes do nome.
  function detectSourceProfile(config, profiles) {
    var model = String(config.printer_model || "").toLowerCase();
    var settingsId = String(config.printer_settings_id || "").toLowerCase();
    var target = model || settingsId;
    if (!target) return null;
    var keys = Object.keys(profiles);
    var fields = [["printer_model", model], ["printer_settings_id", settingsId]];
    for (var c = 0; c < fields.length; c++) {
      if (!fields[c][1]) continue;
      for (var i = 0; i < keys.length; i++) {
        if (String(profiles[keys[i]].base[fields[c][0]] || "").toLowerCase() === fields[c][1]) return keys[i];
      }
    }
    var best = null;
    var bestLength = 0;
    keys.forEach(function (key) {
      var base = printerBaseName(profiles[key].nome).toLowerCase();
      if (base.length > bestLength && target.indexOf(base) === 0) {
        best = key;
        bestLength = base.length;
      }
    });
    return best;
  }

  function renderPalette(el, colours) {
    el.innerHTML = "";
    (colours || []).forEach(function (colour) {
      var span = document.createElement("span");
      span.className = "convert3mf-swatch";
      span.style.background = colour;
      span.title = colour;
      el.appendChild(span);
    });
  }

  function renderSource(config, profiles, bbox, plateBoxes) {
    var detectedKey = detectSourceProfile(config, profiles);
    var detectedName = detectedKey ? profiles[detectedKey].nome : (config.printer_model || config.printer_settings_id || "Impressora não identificada");
    sourceNameEl.textContent = detectedName;

    var nozzle = firstValue(config.nozzle_diameter);
    var nozzleTemp = firstValue(config.nozzle_temperature);
    var parts = [];
    if (nozzle) parts.push("Bico " + nozzle + "mm");
    if (nozzleTemp) parts.push(nozzleTemp + "°C");
    if (plateBoxes) {
      // Várias chapas independentes: o bbox combinado não representa nenhuma
      // mesa real, então mostramos a contagem e o tamanho da maior chapa.
      var largest = plateBoxes.reduce(function (a, b) {
        var areaA = (a.bbox.maxX - a.bbox.minX) * (a.bbox.maxY - a.bbox.minY);
        var areaB = (b.bbox.maxX - b.bbox.minX) * (b.bbox.maxY - b.bbox.minY);
        return areaB > areaA ? b : a;
      });
      parts.push(plateBoxes.length + " chapas");
      parts.push("maior chapa " + (largest.bbox.maxX - largest.bbox.minX).toFixed(0) + " × " + (largest.bbox.maxY - largest.bbox.minY).toFixed(0) + " × " + (largest.bbox.maxZ - largest.bbox.minZ).toFixed(0) + "mm");
    } else if (bbox) {
      var width = (bbox.maxX - bbox.minX).toFixed(0);
      var depth = (bbox.maxY - bbox.minY).toFixed(0);
      var height = (bbox.maxZ - bbox.minZ).toFixed(0);
      parts.push(width + " × " + depth + " × " + height + "mm");
    }
    sourceSubEl.textContent = parts.join(" · ");

    renderPalette(sourcePaletteEl, config.filament_colour);
    return detectedKey;
  }

  function normalizeSearch(text) {
    return (text || "")
      .toLowerCase()
      .normalize("NFD").replace(DIACRITICS_REGEX, "");
  }

  function toggleTarget(key) {
    if (!state) return;
    var idx = state.targetKeys.indexOf(key);
    if (idx === -1) state.targetKeys.push(key);
    else state.targetKeys.splice(idx, 1);

    var btn = targetsEl.querySelector('[data-key="' + key + '"]');
    var selected = state.targetKeys.indexOf(key) !== -1;
    if (btn) {
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    var keys = state.targetKeys;
    var n = keys.length;
    generateBtn.disabled = generating || n === 0;
    generateBtn.textContent = n > 1 ? "Gerar " + n + " projetos convertidos (.zip)" : "Gerar projeto convertido";

    if (n === 0) {
      selectedEl.hidden = true;
    } else {
      selectedEl.hidden = false;
      var names = keys.map(function (key) {
        return printerBaseName(targetsData.profiles[key].nome);
      });
      selectedEl.textContent = n === 1
        ? "Destino selecionado: " + names[0]
        : n + " destinos selecionados: " + names.join(", ");
    }

    updateMultiWarning();
  }

  function updateMultiWarning() {
    var bbox = targetsData && targetsData.bbox;
    var plateBoxes = targetsData && targetsData.plateBoxes;
    var notFitting = [];

    state.targetKeys.forEach(function (key) {
      var profile = targetsData.profiles[key];
      var area = parsePrintableArea(profile.base.printable_area);
      var height = parseFloat(profile.base.printable_height);
      if (!area || (!bbox && !plateBoxes)) return;
      var fits = plateBoxes
        ? plateBoxes.every(function (plateBox) { return fitsOnPlate(plateBox.bbox, area, height); })
        : fitsOnPlate(bbox, area, height);
      if (!fits) notFitting.push(printerBaseName(profile.nome));
    });

    if (!notFitting.length) {
      warningEl.hidden = true;
      return;
    }
    warningEl.hidden = false;
    warningEl.textContent = "O modelo pode não caber na mesa de: " + notFitting.join(", ") + ". O(s) projeto(s) será(ão) gerado(s) do mesmo jeito. Reposicione as peças no fatiador de destino se precisar.";
  }

  function renderTargets(profiles, detectedKey, bbox, plateBoxes, filter) {
    targetsEl.innerHTML = "";
    var term = normalizeSearch(filter);

    var keys = Object.keys(profiles).filter(function (key) {
      if (!term) return true;
      var profile = profiles[key];
      var target = normalizeSearch(profile.marca + " " + profile.nome);
      return target.indexOf(term) !== -1;
    });

    keys.sort(function (a, b) {
      var pa = profiles[a], pb = profiles[b];
      return (pa.marca + pa.nome).localeCompare(pb.marca + pb.nome);
    });

    targetsCountEl.textContent = keys.length + (keys.length === 1 ? " impressora" : " impressoras");
    noResultEl.hidden = keys.length > 0;

    var currentBrand = null;
    keys.forEach(function (key) {
      var profile = profiles[key];
      if (profile.marca !== currentBrand) {
        currentBrand = profile.marca;
        var group = document.createElement("div");
        group.className = "convert3mf-group";
        group.textContent = currentBrand;
        targetsEl.appendChild(group);
      }

      var alreadySelected = !!(state && state.targetKeys.indexOf(key) !== -1);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "convert3mf-target";
      btn.setAttribute("aria-pressed", alreadySelected ? "true" : "false");
      btn.dataset.key = key;
      if (key === detectedKey) btn.classList.add("is-current");
      if (alreadySelected) btn.classList.add("is-selected");

      var name = document.createElement("span");
      name.className = "convert3mf-target-name";
      name.textContent = printerBaseName(profile.nome);
      var brand = document.createElement("span");
      brand.className = "convert3mf-target-brand";
      brand.textContent = profile.marca;

      btn.appendChild(name);
      btn.appendChild(brand);
      btn.addEventListener("click", function () {
        toggleTarget(key);
      });

      targetsEl.appendChild(btn);
    });
  }

  function fitsOnPlate(bbox, area, height) {
    var width = bbox.maxX - bbox.minX;
    var depth = bbox.maxY - bbox.minY;
    var modelHeight = bbox.maxZ - bbox.minZ;
    return width <= area.width && depth <= area.depth && (!height || modelHeight <= height);
  }

  // `geometry` ({ items, plates }, ver processFile) permite pôr a torre
  // de purga num lugar livre de cada mesa (ver placeTowers).
  function buildNewConfig(originalConfig, targetProfile, geometry) {
    var adjusted = ModelParser.adjustFlushPerNozzle(ModelParser.adjustNozzleVariants(originalConfig, targetProfile.base), targetProfile.base);
    var result = {};
    // Campos de hardware que o perfil de destino não tem são de outra
    // impressora (AMS de uma Bambu numa Ender-3, segundo bico de uma H2D...).
    Object.keys(adjusted).forEach(function (k) {
      if (isTargetField(k) && !Object.prototype.hasOwnProperty.call(targetProfile.base, k)) return;
      result[k] = adjusted[k];
    });
    Object.keys(targetProfile.base).forEach(function (k) {
      if (isTargetField(k)) result[k] = targetProfile.base[k];
    });
    if (slicerVersion(targetProfile)) result.version = slicerVersion(targetProfile);
    translateValuesByFamily(result, targetProfile);
    applyFilamentFields(result, originalConfig, targetProfile);
    var towers = null;
    if (geometry && geometry.items) {
      var plateCount = [].concat(originalConfig.wipe_tower_x == null ? [] : originalConfig.wipe_tower_x).length;
      var footprints = ModelParser.footprintsByPlate(geometry.items, geometry.plates, originalConfig.printable_area, result.printable_area, plateCount);
      towers = ModelParser.placeTowers(originalConfig, result, targetProfile.base, footprints);
    }
    if (!towers) towers = ModelParser.repositionTowers(originalConfig, originalConfig.printable_area, targetProfile.base.printable_area);
    if (towers) {
      result.wipe_tower_x = towers.wipe_tower_x;
      result.wipe_tower_y = towers.wipe_tower_y;
    }
    return result;
  }

  function buildNewModel(modelText, sourcePrintableArea, targetProfile) {
    var result = ModelParser.repositionByPlate(modelText, sourcePrintableArea, targetProfile.base.printable_area) || modelText;
    var format = APPLICATION_BY_BRAND[targetProfile.marca];
    if (!format || !slicerVersion(targetProfile)) return result;
    var application = format.replace("{v}", slicerVersion(targetProfile));
    // OrcaSlicer e Elegoo Slicer priorizam a versão de <metadata
    // name="OrcaSlicer"> sobre a de Application; a do projeto original
    // dispararia o mesmo aviso.
    result = result.replace(/\s*<metadata\s+name="OrcaSlicer"\s*>[^<]*<\/metadata>/g, "");
    var tag = /(<metadata\s+name="Application"\s*>)[^<]*(<\/metadata>)/;
    if (tag.test(result)) return result.replace(tag, "$1" + application + "$2");
    return result.replace(/(<model\b[^>]*>)/, '$1\n <metadata name="Application">' + application + "</metadata>");
  }

  function buildNewSliceInfo(sliceInfoText, targetProfile, sliced) {
    // Num projeto fatiado, os <plate> descrevem o fatiamento da origem
    // (tempo, peso, modelo da impressora): ver removeSlicedGcode.
    var result = sliced ? sliceInfoText.replace(/\s*<plate\b[^>]*>[\s\S]*?<\/plate>/g, "") : sliceInfoText;
    var version = slicerVersion(targetProfile);
    if (!version) return result;
    return result.replace(/(<header_item\s+key="X-BBL-Client-Version"\s+value=")[^"]*(")/, "$1" + version + "$2");
  }

  function targetFileName(originalName, targetProfile) {
    var base = originalName.replace(/(\.gcode)?\.3mf$/i, "");
    var slug = printerBaseName(targetProfile.nome)
      .toLowerCase()
      .normalize("NFD").replace(DIACRITICS_REGEX, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return base + "_" + slug + ".3mf";
  }

  var downloadBlob = ModelParser.downloadBlob;

  // Um .gcode.3mf (projeto já fatiado) traz o G-code de cada mesa, feito
  // para a impressora de origem. O projeto convertido sai como um projeto sem
  // fatiar: sem os plate_N.gcode, sem a referência gcode_file das mesas e sem
  // a relação que aponta para eles; o fatiador de destino gera o próprio.
  // Devolve (em promessa) se o projeto estava fatiado.
  function removeSlicedGcode(pkg) {
    var zip = pkg.zip;
    var gcodes = zip.file(/(^|\/)plate_\d+\.gcode(\.md5)?$/i);
    if (!gcodes.length) return Promise.resolve(false);
    gcodes.forEach(function (entry) {
      zip.remove(entry.name);
    });
    if (pkg.modelSettingsText && pkg.modelSettingsPath) {
      var settings = pkg.modelSettingsText.replace(/[ \t]*<metadata\s+key="gcode_file"\s+value="[^"]*"\s*\/>\r?\n?/g, "");
      if (settings !== pkg.modelSettingsText) zip.file(pkg.modelSettingsPath, settings);
    }
    var rels = ModelParser.findUniqueFile(zip, "model_settings.config.rels");
    if (!rels) return Promise.resolve(true);
    return rels.async("text").then(function (text) {
      var withoutGcode = text.replace(/\s*<Relationship\b[^>]*\bTarget="[^"]*\.gcode"[^>]*\/>/g, "");
      if (!/<Relationship\b/.test(withoutGcode)) zip.remove(rels.name);
      else if (withoutGcode !== text) zip.file(rels.name, withoutGcode);
      return true;
    }, function () {
      // A relação só aponta para o G-code: ilegível, não impede a conversão.
      return true;
    });
  }

  function zipFileName(originalName) {
    return originalName.replace(/(\.gcode)?\.3mf$/i, "") + "-convertidos.zip";
  }

  function generateSingleProject(project, targetProfile, compressionLevel) {
    var newConfig = buildNewConfig(project.projectConfig, targetProfile, project.geometry);
    project.zip.file(project.projectConfigPath, JSON.stringify(newConfig, null, 4));
    if (project.modelText) project.zip.file(project.modelPath, buildNewModel(project.modelText, project.projectConfig.printable_area, targetProfile));
    if (project.sliceInfoText) project.zip.file(project.sliceInfoPath, buildNewSliceInfo(project.sliceInfoText, targetProfile, project.sliced));
    // Sem compression:"DEFLATE" o JSZip descompacta o conteúdo original e
    // regrava sem compactar, inflando um 3MF de dezenas de MB pra centenas.
    // O nível é reduzido quando há vários destinos: a malha (que não muda
    // entre eles) seria recompactada do zero a cada um, e nível baixo é
    // bem mais rápido com perda pequena de compactação.
    return project.zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: compressionLevel } });
  }

  function generateProject() {
    if (generating || !state || !state.targetKeys.length) return;
    var project = state;
    var keys = project.targetKeys.slice();
    generating = true;
    generateBtn.disabled = true;

    loadProfiles().then(function (profiles) {
      if (keys.length === 1) {
        var targetProfile = profiles[keys[0]];
        outEl.textContent = "Gerando arquivo...";
        return generateSingleProject(project, targetProfile, 6).then(function (blob) {
          downloadBlob(blob, targetFileName(project.file.name, targetProfile));
          outEl.textContent = "Projeto convertido para " + printerBaseName(targetProfile.nome) + " baixado.";
        });
      }

      // Com vários destinos, a malha (idêntica em todos) seria recompactada
      // do zero em cada um: nível baixo mantém a geração rápida às custas de
      // um .3mf um pouco maior.
      var finalZip = new JSZip();
      return keys.reduce(function (promise, key, index) {
        return promise.then(function () {
          var profile = profiles[key];
          outEl.textContent = "Gerando projeto " + (index + 1) + " de " + keys.length + " (" + printerBaseName(profile.nome) + ")...";
          return generateSingleProject(project, profile, 1).then(function (blob) {
            finalZip.file(targetFileName(project.file.name, profile), blob);
          });
        });
      }, Promise.resolve()).then(function () {
        outEl.textContent = "Compactando " + keys.length + " projetos em um .zip...";
        return finalZip.generateAsync({ type: "blob" });
      }).then(function (blob) {
        downloadBlob(blob, zipFileName(project.file.name));
        outEl.textContent = keys.length + " projetos convertidos baixados em um .zip.";
      });
    }).catch(function () {
      outEl.textContent = "Não foi possível gerar o(s) projeto(s) convertido(s).";
    }).then(function () {
      generating = false;
      // Se outro arquivo foi carregado no meio, a seleção dele montou o botão
      // ainda com generating = true e o deixou desabilitado.
      if (state) generateBtn.disabled = state.targetKeys.length === 0;
    });
  }

  function processFile(file) {
    if (!file) return;
    if (!/\.3mf$/i.test(file.name)) {
      showError("Formato não suportado. Envie um arquivo .3mf.");
      return;
    }

    var id = loads.next();
    showError("");
    showLoading(true);
    panel.hidden = true;
    state = null;

    var pkg = null;
    Promise.all([ToolUtils.read3MFPackage(file), loadProfiles()])
      .then(function (results) {
        pkg = results[0];
        var profiles = results[1];
        if (!pkg.configText) throw new Error("project_settings.config não encontrado");

        var config = JSON.parse(pkg.configText);
        var geometryPromise = pkg.modelText
          ? ModelParser.parse3MFPackage(pkg.zip, pkg.modelText, pkg.modelSettingsText)
          : Promise.resolve(null);

        return Promise.all([geometryPromise, removeSlicedGcode(pkg)]).then(function (r) {
          var res = r[0];
          var sliced = r[1];
          if (!loads.isCurrent(id)) return;
          var bbox = res ? res.bbox : null;
          var plateBoxes = res ? ModelParser.calculatePlates(res.items, ModelParser.parsePlateAssignments(pkg.modelSettingsText)) : null;
          var plates = ModelParser.parsePlateAssignments(pkg.modelSettingsText, true);

          state = { file: file, zip: pkg.zip, projectConfig: config, projectConfigPath: pkg.configPath, modelText: pkg.modelText, modelPath: pkg.modelPath, sliceInfoText: pkg.sliceInfoText, sliceInfoPath: pkg.sliceInfoPath, sliced: sliced, geometry: res ? { items: res.items, plates: plates } : null, targetKeys: [] };
          var detectedKey = renderSource(config, profiles, bbox, plateBoxes);
          targetsData = { profiles: profiles, detectedKey: detectedKey, bbox: bbox, plateBoxes: plateBoxes };
          searchEl.value = "";
          renderTargets(profiles, detectedKey, bbox, plateBoxes, "");
          generateBtn.disabled = true;
          generateBtn.textContent = "Gerar projeto convertido";
          outEl.textContent = "";
          warningEl.hidden = true;
          selectedEl.hidden = true;
          panel.hidden = false;
        });
      })
      .catch(function (err) {
        if (!loads.isCurrent(id)) return;
        if (window.console && console.error) console.error("Conversor 3MF:", err);
        var detail = err && err.message ? " (" + err.message + ")" : "";
        showError("Não foi possível ler esse arquivo 3MF. Confirme que é um projeto exportado do Bambu Studio ou Orca Slicer." + detail);
      })
      .then(function () {
        if (loads.isCurrent(id)) showLoading(false);
      });
  }

  ToolUtils.bindDropzone(dropzone, upload, processFile);

  generateBtn.addEventListener("click", generateProject);

  searchEl.addEventListener("input", function () {
    if (!targetsData) return;
    renderTargets(targetsData.profiles, targetsData.detectedKey, targetsData.bbox, targetsData.plateBoxes, searchEl.value);
  });
})();
