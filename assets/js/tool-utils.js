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
  function ligarDropzone(dropzone, input, aoEscolher) {
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      aoEscolher(file);
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
      aoEscolher(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  // Cada carregamento novo invalida os anteriores: se o usuário solta um
  // segundo arquivo antes do primeiro terminar, o resultado atrasado do
  // primeiro é descartado em vez de sobrescrever o do segundo.
  function criarSequenciador() {
    var atual = 0;
    return {
      proximo: function () { return ++atual; },
      ehAtual: function (id) { return id === atual; }
    };
  }

  // Abre um .3mf e lê como texto os arquivos que as ferramentas usam. Qualquer
  // um deles pode faltar (null); cada ferramenta decide o que é obrigatório.
  function lerPacote3MF(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("não foi possível carregar o leitor de 3MF, verifique sua conexão"));
    }
    var ModelParser = window.Wisky3D.ModelParser;

    function texto(entry) {
      return entry ? entry.async("text") : Promise.resolve(null);
    }

    return JSZip.loadAsync(file).then(function (zip) {
      var modelFile = ModelParser.localizarModeloRaiz(zip);
      var configFile = ModelParser.localizarArquivoUnico(zip, "project_settings.config");
      var modelSettingsFile = ModelParser.localizarArquivoUnico(zip, "model_settings.config");

      return Promise.all([texto(modelFile), texto(configFile), texto(modelSettingsFile)]).then(function (r) {
        return {
          zip: zip,
          modelPath: modelFile ? modelFile.name : null,
          modelText: r[0],
          configPath: configFile ? configFile.name : null,
          configText: r[1],
          modelSettingsText: r[2]
        };
      });
    });
  }

  window.Wisky3D.ToolUtils = {
    ligarDropzone: ligarDropzone,
    criarSequenciador: criarSequenciador,
    lerPacote3MF: lerPacote3MF
  };
})();
