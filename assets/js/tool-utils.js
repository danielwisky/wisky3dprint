(function () {
// ---------------------------------------------------------------------------
// BLOCO: utilitários compartilhados pelas ferramentas (Orçamento, Conversor
// 3MF e Colorir 3MF): upload por input/arrastar, leitura de pacote 3MF e
// descarte de carregamentos atrasados.
// ---------------------------------------------------------------------------

  window.Wisky3D = window.Wisky3D || {};

  // Liga o <input type="file"> e a área de arrastar a um único callback. O
  // input é limpo a cada escolha: sem isso, escolher de novo o mesmo arquivo
  // (ex.: depois de um erro) não dispara "change".
  function bindDropzone(dropzone, input, onSelect) {
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      onSelect(file);
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
      onSelect(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  // Cada carregamento novo invalida os anteriores: se o usuário solta um
  // segundo arquivo antes do primeiro terminar, o resultado atrasado do
  // primeiro é descartado em vez de sobrescrever o do segundo.
  function createSequencer() {
    var current = 0;
    return {
      next: function () { return ++current; },
      isCurrent: function (id) { return id === current; }
    };
  }

  // Abre um .3mf e lê como texto os arquivos que as ferramentas usam. Qualquer
  // um deles pode faltar (null); cada ferramenta decide o que é obrigatório.
  function read3MFPackage(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("não foi possível carregar o leitor de 3MF, verifique sua conexão"));
    }
    var ModelParser = window.Wisky3D.ModelParser;

    function readText(entry) {
      return entry ? entry.async("text") : Promise.resolve(null);
    }

    return JSZip.loadAsync(file).then(function (zip) {
      var modelFile = ModelParser.findRootModel(zip);
      var configFile = ModelParser.findUniqueFile(zip, "project_settings.config");
      var modelSettingsFile = ModelParser.findUniqueFile(zip, "model_settings.config");
      var sliceInfoFile = ModelParser.findUniqueFile(zip, "slice_info.config");

      return Promise.all([readText(modelFile), readText(configFile), readText(modelSettingsFile), readText(sliceInfoFile)]).then(function (r) {
        return {
          zip: zip,
          modelPath: modelFile ? modelFile.name : null,
          modelText: r[0],
          configPath: configFile ? configFile.name : null,
          configText: r[1],
          modelSettingsPath: modelSettingsFile ? modelSettingsFile.name : null,
          modelSettingsText: r[2],
          sliceInfoPath: sliceInfoFile ? sliceInfoFile.name : null,
          sliceInfoText: r[3]
        };
      });
    });
  }

  // Acima disso o navegador corre risco de travar a aba: cada triângulo custa
  // uns 290 bytes no Colorir (3,7 milhões ocupam ~1 GB). Vale para o
  // Orçamento e o Colorir.
  var MAX_TRIANGLES = 6000000;

  window.Wisky3D.ToolUtils = {
    MAX_TRIANGLES: MAX_TRIANGLES,
    bindDropzone: bindDropzone,
    createSequencer: createSequencer,
    read3MFPackage: read3MFPackage
  };
})();
