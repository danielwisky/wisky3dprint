window.Wisky3D = window.Wisky3D || {};

(function () {
// ---------------------------------------------------------------------------
// BLOCO: Escrita/exportação de 3MF (cores por triângulo, project_settings.config
// e model_settings.config do Bambu Studio/OrcaSlicer, montagem de pacote do
// zero). Extraído de colorir-3mf.js pra ser reaproveitado por outras
// ferramentas que também precisam gerar/editar .3mf coloridos, sem duplicar
// essa lógica. Assume que model-parser.js já foi carregado antes (mesma
// ordem de <script> das páginas que usam este módulo), pra usar
// ModelParser.directChild/directChildren/findObjectElement.
// ---------------------------------------------------------------------------

  var ModelParser = window.Wisky3D.ModelParser;

  var NS_MATERIAL = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";

  // Cor default (cinza) usada pela ferramenta de colorir pra área ainda não
  // pintada. Exportada como ThreeMFWriter.DEFAULT_COLOR (fonte única) porque
  // injetarCoresNoXml usa esse valor pra decidir se um triângulo foi "pintado
  // de verdade" (recebe paint_color) ou ficou com a cor default do objeto
  // (não recebe, herda o extrusor/filamento padrão) — colorir-3mf.js reusa a
  // mesma constante em vez de declarar seu próprio literal.
  var DEFAULT_COLOR = [176, 176, 190];

  function toHexByte(n) {
    return n.toString(16).padStart(2, "0");
  }

  function rgbToHex3mf(c) {
    return "#" + toHexByte(c[0]) + toHexByte(c[1]) + toHexByte(c[2]) + "ff";
  }

  function rgbParaHexBambu(c) {
    return ("#" + toHexByte(c[0]) + toHexByte(c[1]) + toHexByte(c[2])).toUpperCase();
  }

  // Bambu Studio/OrcaSlicer ignoram o pid/p1 padrão do 3MF (extensão de
  // materiais) em pacotes que reconhecem como projeto nativo, e só pintam a
  // partir do atributo proprietário "paint_color" (mesma serialização do
  // slic3rpe:mmu_segmentation do PrusaSlicer). Para um triângulo inteiro e não
  // dividido, o valor é: 2 bits de "não dividido" (00) + o estado (índice do
  // slot de filamento, 1-based; valores 0-2 cabem em 2 bits, valores >=3 usam
  // um "escape" 11 seguido de nibbles de extensão, cada 0xF valendo +15 até o
  // nibble final somar o resto), tudo em uma string hex com os nibbles em
  // ordem invertida (o último caractere é o primeiro nibble do fluxo).
  function filamentIndexParaPaintColor(indice1Based) {
    var nibbles = [];
    if (indice1Based < 3) {
      nibbles.push(indice1Based << 2);
    } else {
      nibbles.push(3 << 2);
      var resto = indice1Based - 3;
      while (resto >= 15) {
        nibbles.push(15);
        resto -= 15;
      }
      nibbles.push(resto);
    }
    return nibbles
      .slice()
      .reverse()
      .map(function (n) { return n.toString(16).toUpperCase(); })
      .join("");
  }

  // Fábrica de indexador de cores: devolve uma função que atribui a cada cor
  // distinta (r,g,b) um índice sequencial na ordem de primeira aparição,
  // usada tanto para montar o <m:colorgroup> ao remendar um .3mf existente
  // quanto ao gerar um pacote novo do zero a partir de um STL.
  function criarIndexadorDeCores() {
    var colorToIndex = new Map();
    var cores = [];
    return {
      cores: cores,
      indiceDaCor: function (r, g, b) {
        var chave = r + "," + g + "," + b;
        var idx = colorToIndex.get(chave);
        if (idx === undefined) {
          idx = cores.length;
          cores.push([r, g, b]);
          colorToIndex.set(chave, idx);
        }
        return idx;
      }
    };
  }

  // Busca de filhos por nome local (ignora prefixo de namespace, ex.:
  // "m:colorgroup"), necessário porque o prefixo da extensão de materiais
  // pode variar (ou nem existir) entre pacotes. Vive em model-parser.js
  // (ModelParser.filhosDiretosPorNomeLocal) pra ser reaproveitada também por
  // lerCorPorTriangulo, em vez de duplicada aqui.
  var filhosDiretosPorNomeLocal = ModelParser.filhosDiretosPorNomeLocal;

  // Inverso de filamentIndexParaPaintColor (ver comentário acima): decodifica
  // o hex de "paint_color" de volta pro índice de filamento 1-based. Os
  // nibbles no hex vêm em ordem invertida (último caractere é o primeiro
  // nibble do fluxo), então primeiro desfaz essa inversão. O 1º nibble
  // (depois de desinvertido) carrega o estado nos 2 bits mais altos: valores
  // 0/1/2 são o próprio índice (encoding sem escape, triângulo não dividido);
  // valor 3 é o escape "índice >= 3", e o índice final é 3 + soma de todos os
  // nibbles seguintes (cada um valendo até 15, exatamente o inverso do
  // "resto -= 15" da codificação).
  //
  // Limitação conhecida: isso decodifica exatamente a codificação própria
  // de filamentIndexParaPaintColor (round-trip fechado desta ferramenta).
  // No formato real do TriangleSelector do Bambu Studio/OrcaSlicer, um
  // triângulo pintado com pincel na fronteira entre cores pode ficar
  // subdividido, e são os 2 bits BAIXOS do 1º nibble (não os altos) que
  // sinalizam subdivisão, seguidos pelos filhos na árvore. Este decoder não
  // percorre essa árvore: um paint_color subdividido de um arquivo externo
  // é lido como um índice de filamento plausível, mas errado (cor de
  // preview/exportação imprecisa nessa fronteira, não corrupção de dados).
  // Corrigir direito exige um arquivo real com pincelamento do Bambu/Orca
  // pra validar contra — não disponível neste ambiente; ver ledger da SDD
  // (achado I2 da revisão final do branch).
  function paintColorParaFilamentIndex(hex) {
    var nibbles = hex
      .split("")
      .map(function (c) { return parseInt(c, 16); })
      .reverse();
    var estado = nibbles[0] >> 2;
    if (estado < 3) return estado;
    var resto = 0;
    for (var i = 1; i < nibbles.length; i++) resto += nibbles[i];
    return 3 + resto;
  }

  // Edita, no texto XML de um dos arquivos .model do pacote original, só os
  // <triangle> das regiões pintadas (adiciona pid/p1 e um <m:colorgroup> novo
  // com id que não colida com nenhum recurso já existente nesse arquivo, e,
  // quando o pacote tem slots de filamento configurados, também paint_color,
  // sem o qual Bambu Studio/OrcaSlicer não mostram a cor). Tudo mais no XML
  // (metadados, outros objects, extensões desconhecidas) permanece intacto.
  function injetarCoresNoXml(xmlText, porObjeto, slotPorCor) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    var modelEl = doc.documentElement;

    if (!modelEl.getAttribute("xmlns:m")) {
      modelEl.setAttribute("xmlns:m", NS_MATERIAL);
    }

    var resourcesEl = ModelParser.directChild(modelEl, "resources");
    if (!resourcesEl) return xmlText;

    var idsUsados = new Set();
    (function coletarIds(el) {
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 1) {
          var id = n.getAttribute && n.getAttribute("id");
          if (id) idsUsados.add(id);
          coletarIds(n);
        }
      }
    })(resourcesEl);

    var colorGroupId = 900001;
    while (idsUsados.has(String(colorGroupId))) colorGroupId++;

    var indexador = criarIndexadorDeCores();
    var cores = indexador.cores;
    var indiceDaCor = indexador.indiceDaCor;

    porObjeto.forEach(function (lista, objectId) {
      var objectEl = ModelParser.findObjectElement(doc, objectId);
      if (!objectEl) return;
      var meshEl = ModelParser.directChild(objectEl, "mesh");
      if (!meshEl) return;
      var trianglesEl = ModelParser.directChild(meshEl, "triangles");
      if (!trianglesEl) return;
      var triEls = ModelParser.directChildren(trianglesEl, "triangle");
      lista.forEach(function (item) {
        var triEl = triEls[item.localIndex];
        if (!triEl) return;
        var pIndex = indiceDaCor(item.r, item.g, item.b);
        triEl.setAttribute("pid", String(colorGroupId));
        triEl.setAttribute("p1", String(pIndex));
        // Sempre limpa o paint_color que já existia no triângulo (pintura
        // feita antes, direto no Bambu Studio) para a exportação refletir só
        // o que foi pintado nesta ferramenta, sem misturar as duas pinturas.
        triEl.removeAttribute("paint_color");
        var foiPintado = item.r !== DEFAULT_COLOR[0] || item.g !== DEFAULT_COLOR[1] || item.b !== DEFAULT_COLOR[2];
        if (slotPorCor && foiPintado) {
          var slot = slotPorCor.get(item.r + "," + item.g + "," + item.b);
          if (slot) triEl.setAttribute("paint_color", filamentIndexParaPaintColor(slot));
        }
      });
    });

    if (cores.length) {
      var colorGroupEl = doc.createElementNS(NS_MATERIAL, "m:colorgroup");
      colorGroupEl.setAttribute("id", String(colorGroupId));
      cores.forEach(function (c) {
        var colorEl = doc.createElementNS(NS_MATERIAL, "m:color");
        colorEl.setAttribute("color", rgbToHex3mf(c));
        colorGroupEl.appendChild(colorEl);
      });
      resourcesEl.insertBefore(colorGroupEl, resourcesEl.firstChild);
    }

    // Limpa colorgroups órfãos: qualquer <m:colorgroup> que já existia no
    // arquivo (do pacote original ou de uma exportação anterior desta mesma
    // ferramenta) e cujo id não é mais referenciado por nenhum pid no
    // documento. Sem isso, cada export acumula um novo colorgroup morto no
    // <resources>. Preserva colorgroups ainda referenciados por outra coisa
    // (ex.: pid de object para cor padrão do objeto inteiro).
    var pidsEmUso = new Set();
    (function coletarPids(el) {
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 1) {
          var pid = n.getAttribute && n.getAttribute("pid");
          if (pid) pidsEmUso.add(pid);
          coletarPids(n);
        }
      }
    })(modelEl);
    filhosDiretosPorNomeLocal(resourcesEl, "colorgroup").forEach(function (cg) {
      var id = cg.getAttribute("id");
      if (id && !pidsEmUso.has(id)) resourcesEl.removeChild(cg);
    });

    // Serializar o Document inteiro (em vez de só o elemento raiz) já inclui
    // a declaração <?xml ...?> em navegadores baseados em Chromium. Repeti-la
    // aqui geraria uma segunda declaração e um XML inválido.
    var serializado = new XMLSerializer().serializeToString(doc);
    return /^<\?xml/.test(serializado) ? serializado : '<?xml version="1.0" encoding="UTF-8"?>\n' + serializado;
  }

  // Reconstrói Metadata/project_settings.config para ter exatamente um slot de
  // filamento por cor da paleta (slot 1 = cinza default, os demais = cores
  // pintadas), em vez de aproximar a pintura aos slots de AMS que já
  // existiam no projeto. Todo ajuste de configuração que não seja a própria
  // cor (perfil de temperatura, tipo de material, id do preset etc.) é clonado
  // do slot 0 original, que no fluxo do Bambu Studio já é o "Bambu PLA Basic".
  // Assim os novos slots herdam o mesmo preset/perfil de impressora do
  // projeto, sem a ferramenta precisar adivinhar qual variante do PLA Basic
  // usar.
  function reconstruirProjectSettings(cfgOriginal, paleta) {
    var nAntigo = Array.isArray(cfgOriginal.filament_colour) ? cfgOriginal.filament_colour.length : 0;
    if (!nAntigo) return null;

    var cfg = JSON.parse(JSON.stringify(cfgOriginal));
    var n = paleta.length;

    Object.keys(cfg).forEach(function (chave) {
      var valor = cfg[chave];
      if (Array.isArray(valor) && valor.length === nAntigo) {
        cfg[chave] = new Array(n).fill(valor[0]);
      }
    });

    cfg.filament_colour = paleta.map(rgbParaHexBambu);
    cfg.filament_multi_colour = cfg.filament_colour.slice();
    cfg.filament_colour_type = new Array(n).fill("1");
    cfg.filament_self_index = paleta.map(function (_, i) { return String(i + 1); });
    cfg.filament_map = new Array(n).fill("1");

    return cfg;
  }

  // Ajusta, no texto do Metadata/model_settings.config, as listas
  // filament_maps/filament_volume_maps (uma entrada por slot de filamento)
  // para o novo número de slots, e força o extrusor/filamento padrão de cada
  // object para o slot 1 (o cinza). O slot original podia apontar para um
  // índice que deixou de existir (ou que agora é outra cor) depois da
  // reconstrução da paleta.
  function ajustarFilamentMapsNoModelSettings(xmlText, n) {
    var mapaFilamentos = new Array(n).fill("1").join(" ");
    var mapaVolumes = new Array(n).fill("0").join(" ");
    return xmlText
      .replace(/(<metadata\s+key="filament_maps"\s+value=")[^"]*(")/g, "$1" + mapaFilamentos + "$2")
      .replace(/(<metadata\s+key="filament_volume_maps"\s+value=")[^"]*(")/g, "$1" + mapaVolumes + "$2")
      .replace(/(<metadata\s+key="extruder"\s+value=")[^"]*(")/g, "$11$2");
  }

  // Monta um pacote 3MF novo do zero (sem pacote original pra preservar,
  // caminho usado quando a origem foi um .stl), com um ou mais <object>. Um
  // único <m:colorgroup id="1"> compartilhado entre todos os objects (com
  // todas as cores distintas de todos eles), um <object> por item de
  // `objetos` com sua própria malha, e um <item> por object no <build>.
  // `objetos`: [{ objectId, vertices: [[x,y,z],...],
  // triangulos: [{v1, v2, v3, color: [r,g,b]}, ...] }, ...].
  // contentTypesXml/relsXml não dependem de quantos objects existem.
  function montarModeloDoZero(objetos) {
    var indexador = criarIndexadorDeCores();
    var cores = indexador.cores;
    var indiceDaCor = indexador.indiceDaCor;

    var objectsXml = objetos.map(function (obj) {
      var linhasVertices = obj.vertices.map(function (v) {
        return '<vertex x="' + v[0] + '" y="' + v[1] + '" z="' + v[2] + '"/>';
      });
      var linhasTriangulos = obj.triangulos.map(function (t) {
        var pIndex = indiceDaCor(t.color[0], t.color[1], t.color[2]);
        return '<triangle v1="' + t.v1 + '" v2="' + t.v2 + '" v3="' + t.v3 + '" pid="1" p1="' + pIndex + '"/>';
      });
      return (
        '    <object id="' + obj.objectId + '" type="model">\n' +
        "      <mesh>\n" +
        "        <vertices>\n" +
        linhasVertices.map(function (l) { return "          " + l + "\n"; }).join("") +
        "        </vertices>\n" +
        "        <triangles>\n" +
        linhasTriangulos.map(function (l) { return "          " + l + "\n"; }).join("") +
        "        </triangles>\n" +
        "      </mesh>\n" +
        "    </object>\n"
      );
    }).join("");

    var itemsXml = objetos.map(function (obj) {
      return '    <item objectid="' + obj.objectId + '"/>\n';
    }).join("");

    var linhasCores = cores.map(function (c) { return '<m:color color="' + rgbToHex3mf(c) + '"/>'; });

    var modelXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n' +
      "  <resources>\n" +
      '    <m:colorgroup id="1">\n' +
      linhasCores.map(function (l) { return "      " + l + "\n"; }).join("") +
      "    </m:colorgroup>\n" +
      objectsXml +
      "  </resources>\n" +
      "  <build>\n" +
      itemsXml +
      "  </build>\n" +
      "</model>\n";

    var contentTypesXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
      "</Types>\n";

    var relsXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
      "</Relationships>\n";

    return { modelXml: modelXml, contentTypesXml: contentTypesXml, relsXml: relsXml };
  }

  window.Wisky3D.ThreeMFWriter = {
    DEFAULT_COLOR: DEFAULT_COLOR,
    toHexByte: toHexByte,
    rgbToHex3mf: rgbToHex3mf,
    rgbParaHexBambu: rgbParaHexBambu,
    filamentIndexParaPaintColor: filamentIndexParaPaintColor,
    paintColorParaFilamentIndex: paintColorParaFilamentIndex,
    criarIndexadorDeCores: criarIndexadorDeCores,
    injetarCoresNoXml: injetarCoresNoXml,
    reconstruirProjectSettings: reconstruirProjectSettings,
    ajustarFilamentMapsNoModelSettings: ajustarFilamentMapsNoModelSettings,
    montarModeloDoZero: montarModeloDoZero
  };
})();
