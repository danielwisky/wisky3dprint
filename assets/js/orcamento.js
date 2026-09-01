// ---------------------------------------------------------------------------
// BLOCO: Parsing de modelos 3D (STL/3MF): volume, bounding box e densidade
// ---------------------------------------------------------------------------

  function signedVolumeOfTriangle(p1, p2, p3) {
    return (
      p1[0] * (p2[1] * p3[2] - p3[1] * p2[2]) -
      p1[1] * (p2[0] * p3[2] - p3[0] * p2[2]) +
      p1[2] * (p2[0] * p3[1] - p3[0] * p2[1])
    ) / 6.0;
  }

  function computeMeshVolumeMm3(triangulos) {
    var total = 0;
    for (var i = 0; i < triangulos.length; i++) {
      var t = triangulos[i];
      total += signedVolumeOfTriangle(t[0], t[1], t[2]);
    }
    return Math.abs(total);
  }

  function computeBoundingBox(triangulos) {
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < triangulos.length; i++) {
      for (var v = 0; v < 3; v++) {
        var p = triangulos[i][v];
        for (var eixo = 0; eixo < 3; eixo++) {
          if (p[eixo] < min[eixo]) min[eixo] = p[eixo];
          if (p[eixo] > max[eixo]) max[eixo] = p[eixo];
        }
      }
    }
    return {
      minX: min[0], minY: min[1], minZ: min[2],
      maxX: max[0], maxY: max[1], maxZ: max[2]
    };
  }

  function detectBinarySTL(buffer) {
    if (buffer.byteLength < 84) return false;
    var dv = new DataView(buffer);
    var triCount = dv.getUint32(80, true);
    var expectedSize = 84 + triCount * 50;
    return buffer.byteLength === expectedSize;
  }

  function parseBinarySTL(buffer) {
    var dv = new DataView(buffer);
    var triCount = dv.getUint32(80, true);
    var triangulos = [];
    var offset = 84;
    for (var i = 0; i < triCount; i++) {
      offset += 12; // normal
      var v1 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      var v2 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      var v3 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      offset += 2; // attribute byte count
      triangulos.push([v1, v2, v3]);
    }
    return triangulos;
  }

  function parseAsciiSTL(text) {
    var triangulos = [];
    var re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    var m, verts = [];
    while ((m = re.exec(text)) !== null) {
      verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      if (verts.length === 3) { triangulos.push(verts); verts = []; }
    }
    return triangulos;
  }

  function parseSTL(buffer) {
    if (detectBinarySTL(buffer)) return parseBinarySTL(buffer);
    return parseAsciiSTL(new TextDecoder("utf-8").decode(buffer));
  }

  var TRANSFORM_IDENTIDADE = { M: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };

  function parseTransformAttr(str) {
    if (!str) return TRANSFORM_IDENTIDADE;
    var n = str.trim().split(/\s+/).map(Number);
    if (n.length < 12 || n.some(isNaN)) return TRANSFORM_IDENTIDADE;
    return {
      M: [[n[0], n[3], n[6]], [n[1], n[4], n[7]], [n[2], n[5], n[8]]],
      t: [n[9], n[10], n[11]]
    };
  }

  function matMul3(A, B) {
    var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return R;
  }

  function matVec3(A, v) {
    return [
      A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
      A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
      A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
    ];
  }

  // Compõe transform pai + filho: aplica o filho primeiro (espaço local do
  // componente), depois o pai (acumulado até aqui) — é como o 3MF encadeia
  // transforms de <item> e <component> aninhados.
  function composeTransform(parent, child) {
    var M = matMul3(parent.M, child.M);
    var pmt = matVec3(parent.M, child.t);
    return { M: M, t: [pmt[0] + parent.t[0], pmt[1] + parent.t[1], pmt[2] + parent.t[2]] };
  }

  function applyTransform(p, tr) {
    var v = matVec3(tr.M, p);
    return [v[0] + tr.t[0], v[1] + tr.t[1], v[2] + tr.t[2]];
  }

  function parseXmlDoc(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("xml inválido");
    return doc;
  }

  function directChild(el, tag) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) return n;
    }
    return null;
  }

  function directChildren(el, tag) {
    var out = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) out.push(n);
    }
    return out;
  }

  function findObjectElement(doc, objectId) {
    var objects = doc.getElementsByTagName("object");
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].getAttribute("id") === String(objectId)) return objects[i];
    }
    return null;
  }

  function bboxVazio() {
    return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  }

  function mergeBBox(a, b) {
    return {
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ)
    };
  }

  function estenderBBox(bbox, p) {
    if (p[0] < bbox.minX) bbox.minX = p[0];
    if (p[1] < bbox.minY) bbox.minY = p[1];
    if (p[2] < bbox.minZ) bbox.minZ = p[2];
    if (p[0] > bbox.maxX) bbox.maxX = p[0];
    if (p[1] > bbox.maxY) bbox.maxY = p[1];
    if (p[2] > bbox.maxZ) bbox.maxZ = p[2];
    return bbox;
  }

  // Resolve um <object> do 3MF (mesh direta e/ou <components> apontando pra
  // outros objects, no mesmo arquivo ou em arquivos externos via p:path —
  // padrão usado por fatiadores como Bambu Studio/Orca em modelos multi-peça).
  // O volume de cada mesh-folha é somado em módulo (abs) individualmente,
  // pra não zerar o total quando um componente vem espelhado (transform com
  // determinante negativo, comum em peças simétricas). Não retém os
  // triângulos resolvidos em memória — só contagem/volume/bbox — porque
  // modelos reais multi-peça (ex: miniaturas Bambu Studio) podem passar de
  // 3-4 milhões de triângulos e manter tudo em arrays de arrays estouraria
  // memória no navegador sem necessidade (só usamos os agregados).
  function resolveObjectGeometry(zip, docCache, doc, objectId, accumTransform) {
    var objectEl = findObjectElement(doc, objectId);
    if (!objectEl) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, bbox: bboxVazio() });

    var meshEl = directChild(objectEl, "mesh");
    var triangleCount = 0;
    var volumeMm3 = 0;
    var bbox = bboxVazio();

    if (meshEl) {
      var verticesEl = directChild(meshEl, "vertices");
      var trianglesEl = directChild(meshEl, "triangles");
      var vertexEls = verticesEl ? directChildren(verticesEl, "vertex") : [];
      var vertices = vertexEls.map(function (v) {
        var p = applyTransform([
          parseFloat(v.getAttribute("x")),
          parseFloat(v.getAttribute("y")),
          parseFloat(v.getAttribute("z"))
        ], accumTransform);
        estenderBBox(bbox, p);
        return p;
      });
      var triEls = trianglesEl ? directChildren(trianglesEl, "triangle") : [];
      var leafTriangles = [];
      triEls.forEach(function (t) {
        var i1 = parseInt(t.getAttribute("v1"), 10);
        var i2 = parseInt(t.getAttribute("v2"), 10);
        var i3 = parseInt(t.getAttribute("v3"), 10);
        if (vertices[i1] && vertices[i2] && vertices[i3]) {
          leafTriangles.push([vertices[i1], vertices[i2], vertices[i3]]);
        }
      });
      if (leafTriangles.length) {
        volumeMm3 += computeMeshVolumeMm3(leafTriangles);
        triangleCount += leafTriangles.length;
      }
    }

    var componentsEl = directChild(objectEl, "components");
    if (!componentsEl) return Promise.resolve({ triangleCount: triangleCount, volumeMm3: volumeMm3, bbox: bbox });

    var promises = directChildren(componentsEl, "component").map(function (comp) {
      var childObjectId = comp.getAttribute("objectid");
      var childTransform = parseTransformAttr(comp.getAttribute("transform"));
      var combined = composeTransform(accumTransform, childTransform);
      var path = comp.getAttribute("p:path");

      if (path) {
        var normalizedPath = path.replace(/^\//, "");
        var docPromise = docCache[normalizedPath];
        if (!docPromise) {
          var zipEntry = zip.file(normalizedPath);
          if (!zipEntry) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, bbox: bboxVazio() });
          docPromise = zipEntry.async("text").then(parseXmlDoc);
          docCache[normalizedPath] = docPromise;
        }
        return docPromise.then(function (extDoc) {
          return resolveObjectGeometry(zip, docCache, extDoc, childObjectId, combined);
        });
      }
      return resolveObjectGeometry(zip, docCache, doc, childObjectId, combined);
    });

    return Promise.all(promises).then(function (results) {
      results.forEach(function (r) {
        triangleCount += r.triangleCount;
        volumeMm3 += r.volumeMm3;
        bbox = mergeBBox(bbox, r.bbox);
      });
      return { triangleCount: triangleCount, volumeMm3: volumeMm3, bbox: bbox };
    });
  }

  function parse3MFPackage(zip, rootXmlText) {
    var doc = parseXmlDoc(rootXmlText);
    var docCache = {};
    var buildEl = doc.getElementsByTagName("build")[0];
    var itemEls = buildEl ? directChildren(buildEl, "item") : [];

    // Sem <build>/<item> (raro): trata cada <object> de nível topo como se
    // fosse um item, sem transform.
    var items = itemEls.length ? itemEls : Array.prototype.map.call(
      doc.getElementsByTagName("object"),
      function (o) {
        return { getAttribute: function (name) { return name === "objectid" ? o.getAttribute("id") : null; } };
      }
    );

    var promises = items.map(function (item) {
      var objectId = item.getAttribute("objectid");
      var transform = parseTransformAttr(item.getAttribute("transform"));
      return resolveObjectGeometry(zip, docCache, doc, objectId, transform);
    });

    return Promise.all(promises).then(function (results) {
      var triangleCount = 0;
      var volumeMm3 = 0;
      var bbox = bboxVazio();
      results.forEach(function (r) {
        triangleCount += r.triangleCount;
        volumeMm3 += r.volumeMm3;
        bbox = mergeBBox(bbox, r.bbox);
      });
      return { triangleCount: triangleCount, volumeMm3: volumeMm3, bbox: bbox };
    });
  }

  function parse3MFDensidade(configText) {
    var densidadeMatch = configText.match(/"filament_density"\s*:\s*\[\s*"([\d.]+)"/);
    var diametroMatch = configText.match(/"filament_diameter"\s*:\s*\[\s*"([\d.]+)"/);
    if (!densidadeMatch) return null;
    return {
      densidade: parseFloat(densidadeMatch[1]),
      diametro: diametroMatch ? parseFloat(diametroMatch[1]) : null
    };
  }

// ---------------------------------------------------------------------------
// BLOCO: Calculadora de orçamento: itens, custos, upload de modelo, PDF/CSV
// ---------------------------------------------------------------------------

  (function () {
    var form = document.getElementById("orcamento-calc");
    if (!form) return;

    var nome = document.getElementById("orcamento-calc-nome");
    var quantidade = document.getElementById("orcamento-calc-quantidade");
    var peso = document.getElementById("orcamento-calc-peso");
    var horas = document.getElementById("orcamento-calc-horas");
    var minutos = document.getElementById("orcamento-calc-minutos");
    var filamento = document.getElementById("orcamento-calc-filamento");
    var maoDeObra = document.getElementById("orcamento-calc-mao-de-obra");
    var margemInput = document.getElementById("orcamento-calc-margem");
    var perdaInput = document.getElementById("orcamento-calc-perda");
    var out = document.getElementById("orcamento-calc-result");
    var breakdown = document.getElementById("orcamento-calc-breakdown");
    var addBtn = document.getElementById("orcamento-calc-add");
    var itensBox = document.getElementById("orcamento-calc-itens");
    var itensList = document.getElementById("orcamento-calc-itens-list");
    var itensTotalOut = document.getElementById("orcamento-calc-itens-total");
    var descontoValorInput = document.getElementById("orcamento-calc-desconto-valor");
    var descontoTipoInput = document.getElementById("orcamento-calc-desconto-tipo");
    var descontoTextoInput = document.getElementById("orcamento-calc-desconto-texto");
    var descontoBreakdown = document.getElementById("orcamento-calc-desconto-breakdown");
    var itensSubtotalOut = document.getElementById("orcamento-calc-itens-subtotal");
    var descontoLabel = document.getElementById("orcamento-calc-desconto-label");
    var descontoOut = document.getElementById("orcamento-calc-desconto-out");
    var pdfBtn = document.getElementById("orcamento-calc-pdf");
    var csvBtn = document.getElementById("orcamento-calc-csv");
    var clearBtn = document.getElementById("orcamento-calc-clear");
    var printBox = document.getElementById("orcamento-calc-print");
    var printBody = document.getElementById("orcamento-calc-print-body");
    var printDescontoBreakdown = document.getElementById("orcamento-calc-print-desconto-breakdown");
    var printSubtotalOut = document.getElementById("orcamento-calc-print-subtotal");
    var printDescontoLabel = document.getElementById("orcamento-calc-print-desconto-label");
    var printDescontoOut = document.getElementById("orcamento-calc-print-desconto");
    var printTotalOut = document.getElementById("orcamento-calc-print-total");
    var printLogo = document.getElementById("orcamento-calc-print-logo");
    var printBrand = document.getElementById("orcamento-calc-print-brand");
    var logoHideInput = document.getElementById("orcamento-calc-logo-hide");
    var logoUploadInput = document.getElementById("orcamento-calc-logo-upload");
    var logoResetBtn = document.getElementById("orcamento-calc-logo-reset");
    var modeloUpload = document.getElementById("orcamento-calc-modelo-upload");
    var modeloPreview = document.getElementById("orcamento-calc-modelo-preview");
    var modeloNomeOut = document.getElementById("orcamento-calc-modelo-nome");
    var modeloDimsOut = document.getElementById("orcamento-calc-modelo-dims");
    var modeloVolumeOut = document.getElementById("orcamento-calc-modelo-volume");
    var modeloDensidadeOut = document.getElementById("orcamento-calc-modelo-densidade");
    var modeloErro = document.getElementById("orcamento-calc-modelo-erro");
    var materialSelect = document.getElementById("orcamento-calc-material");
    var densidadeWrap = document.getElementById("orcamento-calc-densidade-wrap");
    var densidadeInput = document.getElementById("orcamento-calc-densidade");
    var infillInput = document.getElementById("orcamento-calc-infill");
    var alturaCamadaInput = document.getElementById("orcamento-calc-altura-camada");
    var velocidadeInput = document.getElementById("orcamento-calc-velocidade");
    var tempoHint = document.getElementById("orcamento-calc-tempo-hint");
    var modeloModal = document.getElementById("orcamento-calc-modelo-modal");
    var modeloAbrirBtn = document.getElementById("orcamento-calc-modelo-abrir");
    var modeloFecharBtn = document.getElementById("orcamento-calc-modelo-fechar");
    var modeloEditarBtn = document.getElementById("orcamento-calc-modelo-editar");
    var modeloRemoverBtn = document.getElementById("orcamento-calc-modelo-remover");
    var modeloBadge = document.getElementById("orcamento-calc-modelo-badge");
    var modeloBadgeNome = document.getElementById("orcamento-calc-modelo-badge-nome");
    var pesoAutoTag = document.getElementById("orcamento-calc-peso-auto-tag");
    var tempoAutoTag = document.getElementById("orcamento-calc-tempo-auto-tag");
    var modeloDropzone = document.getElementById("orcamento-calc-dropzone");
    var modeloLoading = document.getElementById("orcamento-calc-modelo-loading");
    var modeloDropzoneTexto = document.getElementById("orcamento-calc-dropzone-texto");
    var d = form.dataset;
    var fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    var rows = {
      filamento: document.getElementById("orcamento-calc-b-filamento"),
      energia: document.getElementById("orcamento-calc-b-energia"),
      desgaste: document.getElementById("orcamento-calc-b-desgaste"),
      subtotal: document.getElementById("orcamento-calc-b-subtotal"),
      perda: document.getElementById("orcamento-calc-b-perda"),
      perdaLabel: document.getElementById("orcamento-calc-b-perda-label"),
      margem: document.getElementById("orcamento-calc-b-margem"),
      margemLabel: document.getElementById("orcamento-calc-b-margem-label"),
      maoDeObra: document.getElementById("orcamento-calc-b-mao-de-obra")
    };

    var itens = [];
    var current = null;

    // A perda/retrabalho é aplicada sobre o subtotal (filamento + energia +
    // desgaste): equivale a reimprimir essa fração das peças do item.
    function computeItem() {
      var g = parseFloat(String(peso.value).replace(",", "."));
      var h = (parseFloat(horas.value) || 0) + (parseFloat(minutos.value) || 0) / 60;
      var filamentoKg = parseFloat(String(filamento.value).replace(",", "."));
      var maoDeObraVal = parseFloat(String(maoDeObra.value).replace(",", ".")) || 0;
      var margemPct = parseFloat(String(margemInput.value).replace(",", "."));
      if (!isFinite(margemPct)) margemPct = parseFloat(d.margemPct) || 0;
      var perdaPct = parseFloat(String(perdaInput.value).replace(",", "."));
      if (!isFinite(perdaPct)) perdaPct = parseFloat(d.perdaPct) || 0;
      var qtd = parseInt(quantidade.value, 10);
      if (!isFinite(qtd) || qtd < 1) qtd = 1;

      if (!isFinite(g) || g <= 0 || h <= 0 || !isFinite(filamentoKg) || filamentoKg <= 0 || maoDeObraVal < 0 || margemPct < 0 || perdaPct < 0) {
        return null;
      }

      var custoFilamento = (g / 1000) * filamentoKg;
      var energia = (parseFloat(d.potenciaW) * h / 1000) * parseFloat(d.tarifaKwh);
      var desgaste = parseFloat(d.desgaste);
      var subtotal = custoFilamento + energia + desgaste;
      var perda = subtotal * (perdaPct / 100);
      var subtotalComPerda = subtotal + perda;
      var margem = subtotalComPerda * (margemPct / 100);
      var unitTotal = subtotalComPerda + margem + maoDeObraVal;

      return {
        nome: (nome.value || "").trim(),
        qtd: qtd,
        pesoG: g,
        tempoH: h,
        custoFilamento: custoFilamento,
        energia: energia,
        desgaste: desgaste,
        subtotal: subtotal,
        perda: perda,
        perdaPct: perdaPct,
        margem: margem,
        margemPct: margemPct,
        maoDeObra: maoDeObraVal,
        unitTotal: unitTotal,
        itemTotal: unitTotal * qtd
      };
    }

    function calc() {
      var item = computeItem();
      current = item;

      if (!item) {
        out.textContent = "Preencha os campos";
        out.classList.remove("has-value");
        breakdown.hidden = true;
        addBtn.disabled = true;
        return;
      }

      rows.filamento.textContent = fmt.format(item.custoFilamento);
      rows.energia.textContent = fmt.format(item.energia);
      rows.desgaste.textContent = fmt.format(item.desgaste);
      rows.subtotal.textContent = fmt.format(item.subtotal);
      rows.perdaLabel.textContent = "Perda (" + item.perdaPct + "%)";
      rows.perda.textContent = fmt.format(item.perda);
      rows.margemLabel.textContent = "Margem (" + item.margemPct + "%)";
      rows.margem.textContent = fmt.format(item.margem);
      rows.maoDeObra.textContent = fmt.format(item.maoDeObra);
      breakdown.hidden = false;

      out.textContent = item.qtd > 1
        ? fmt.format(item.itemTotal) + " (" + item.qtd + " × " + fmt.format(item.unitTotal) + ")"
        : fmt.format(item.itemTotal);
      out.classList.add("has-value");
      addBtn.disabled = false;
    }

    function setDescontoLabel(el) {
      var texto = (descontoTextoInput.value || "").trim();
      el.innerHTML = "";
      el.appendChild(document.createTextNode("Desconto"));
      if (texto) {
        var span = document.createElement("span");
        span.className = "calc-desconto-label-texto";
        span.textContent = " (" + texto + ")";
        el.appendChild(span);
      }
    }

    function computeDesconto(subtotal) {
      var valor = parseFloat(String(descontoValorInput.value).replace(",", "."));
      if (!isFinite(valor) || valor <= 0) return 0;
      var desconto = descontoTipoInput.value === "pct" ? subtotal * (valor / 100) : valor;
      return Math.min(desconto, subtotal);
    }

    function renderItens() {
      itensList.innerHTML = "";
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;

        var li = document.createElement("li");
        li.className = "calc-item-row";

        var info = document.createElement("span");
        info.className = "calc-item-info";

        var infoTitulo = document.createElement("span");
        infoTitulo.textContent = (item.nome || "Peça " + (i + 1)) + " × " + item.qtd;
        info.appendChild(infoTitulo);

        var horasInt = Math.floor(item.tempoH);
        var minutosInt = Math.round((item.tempoH - horasInt) * 60);
        var infoMeta = document.createElement("span");
        infoMeta.className = "calc-item-meta";
        infoMeta.textContent = item.pesoG.toFixed(1) + " g · " + horasInt + "h" + (minutosInt ? " " + minutosInt + "min" : "");
        info.appendChild(infoMeta);

        var valor = document.createElement("span");
        valor.className = "calc-item-valor";
        valor.textContent = fmt.format(item.itemTotal);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "calc-item-remove";
        removeBtn.setAttribute("aria-label", "Remover " + (item.nome || "peça " + (i + 1)));
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          itens.splice(i, 1);
          renderItens();
        });

        li.appendChild(info);
        li.appendChild(valor);
        li.appendChild(removeBtn);
        itensList.appendChild(li);
      });

      var desconto = computeDesconto(total);
      if (desconto > 0) {
        itensSubtotalOut.textContent = fmt.format(total);
        setDescontoLabel(descontoLabel);
        descontoOut.textContent = "-" + fmt.format(desconto);
        descontoBreakdown.hidden = false;
      } else {
        descontoBreakdown.hidden = true;
      }

      itensTotalOut.textContent = fmt.format(total - desconto);
      itensBox.hidden = itens.length === 0;
    }

    [descontoValorInput, descontoTipoInput, descontoTextoInput].forEach(function (el) {
      el.addEventListener("input", renderItens);
    });

    addBtn.addEventListener("click", function () {
      if (!current) return;
      itens.push(current);
      renderItens();

      nome.value = "";
      quantidade.value = "1";
      peso.value = "";
      horas.value = "";
      minutos.value = "";
      margemInput.value = d.margemPct || "";
      perdaInput.value = d.perdaPct || "";
      modeloUpload.value = "";
      modeloPreview.hidden = true;
      modeloErro.hidden = true;
      modeloBadge.hidden = true;
      modeloAbrirBtn.hidden = false;
      tempoHint.hidden = true;
      pesoAutoTag.hidden = true;
      tempoAutoTag.hidden = true;
      lastMeshStats = null;
      densidadeDoArquivo = null;
      current = null;
      out.textContent = "Preencha os campos";
      out.classList.remove("has-value");
      breakdown.hidden = true;
      addBtn.disabled = true;
      nome.focus();
    });

    clearBtn.addEventListener("click", function () {
      itens = [];
      descontoValorInput.value = "";
      descontoTipoInput.value = "pct";
      descontoTextoInput.value = "";
      renderItens();
    });

    pdfBtn.addEventListener("click", function () {
      if (!itens.length) return;

      printBody.innerHTML = "";
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;
        var tr = document.createElement("tr");
        ["nome", "qtd", "unit", "subtotal"].forEach(function (col) {
          var td = document.createElement("td");
          if (col === "nome") td.textContent = item.nome || "Peça " + (i + 1);
          else if (col === "qtd") td.textContent = item.qtd;
          else if (col === "unit") td.textContent = fmt.format(item.unitTotal);
          else td.textContent = fmt.format(item.itemTotal);
          tr.appendChild(td);
        });
        printBody.appendChild(tr);
      });

      var desconto = computeDesconto(total);
      if (desconto > 0) {
        printSubtotalOut.textContent = fmt.format(total);
        setDescontoLabel(printDescontoLabel);
        printDescontoOut.textContent = "-" + fmt.format(desconto);
        printDescontoBreakdown.hidden = false;
      } else {
        printDescontoBreakdown.hidden = true;
      }
      printTotalOut.textContent = fmt.format(total - desconto);

      // Vira filho direto do body pra CSS de impressão poder esconder só o resto da página.
      document.body.appendChild(printBox);
      document.body.classList.add("is-printing-calc");
      window.print();
    });

    window.addEventListener("afterprint", function () {
      document.body.classList.remove("is-printing-calc");
    });

    function csvNum(n) {
      return n.toFixed(2).replace(".", ",");
    }

    function csvField(value) {
      var str = String(value);
      return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    }

    csvBtn.addEventListener("click", function () {
      if (!itens.length) return;

      var linhas = [[
        "Peça", "Quantidade", "Filamento", "Energia", "Desgaste da impressora",
        "Subtotal", "Perda (%)", "Perda", "Margem (%)", "Margem", "Mão de obra",
        "Valor unitário", "Valor total"
      ]];
      var total = 0;

      itens.forEach(function (item, i) {
        total += item.itemTotal;
        linhas.push([
          item.nome || "Peça " + (i + 1),
          item.qtd,
          csvNum(item.custoFilamento),
          csvNum(item.energia),
          csvNum(item.desgaste),
          csvNum(item.subtotal),
          csvNum(item.perdaPct),
          csvNum(item.perda),
          csvNum(item.margemPct),
          csvNum(item.margem),
          csvNum(item.maoDeObra),
          csvNum(item.unitTotal),
          csvNum(item.itemTotal)
        ]);
      });

      linhas.push(["Total geral", "", "", "", "", "", "", "", "", "", "", "", csvNum(total)]);

      var csv = linhas.map(function (linha) {
        return linha.map(csvField).join(";");
      }).join("\r\n");

      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "orcamento.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    var LOGO_HIDDEN_KEY = "orcamentoCalc:logoHidden";
    var LOGO_CUSTOM_KEY = "orcamentoCalc:logoCustom";
    var LOGO_MAX_BYTES = 500 * 1024;

    function applyLogoState() {
      if (!printLogo) return;
      var hidden = localStorage.getItem(LOGO_HIDDEN_KEY) === "1";
      var custom = localStorage.getItem(LOGO_CUSTOM_KEY);
      var hasCustom = !!custom;

      // Com logo própria, a marca Wisky 3D Print (texto) fica sempre oculta.
      logoHideInput.checked = hidden || hasCustom;
      logoHideInput.disabled = hasCustom;

      printLogo.style.display = hidden && !hasCustom ? "none" : "";
      printLogo.src = custom || printLogo.dataset.defaultSrc;
      if (printBrand) printBrand.style.display = hidden || hasCustom ? "none" : "";
    }

    logoHideInput.addEventListener("change", function () {
      if (logoHideInput.checked) {
        localStorage.setItem(LOGO_HIDDEN_KEY, "1");
      } else {
        localStorage.removeItem(LOGO_HIDDEN_KEY);
      }
      applyLogoState();
    });

    logoUploadInput.addEventListener("change", function () {
      var file = logoUploadInput.files && logoUploadInput.files[0];
      if (!file) return;

      if (!/^image\//.test(file.type)) {
        alert("Escolha um arquivo de imagem.");
        logoUploadInput.value = "";
        return;
      }
      if (file.size > LOGO_MAX_BYTES) {
        alert("A imagem é muito grande. Escolha uma imagem de até 500KB.");
        logoUploadInput.value = "";
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        localStorage.setItem(LOGO_CUSTOM_KEY, reader.result);
        localStorage.setItem(LOGO_HIDDEN_KEY, "1");
        applyLogoState();
      };
      reader.readAsDataURL(file);
    });

    logoResetBtn.addEventListener("click", function () {
      localStorage.removeItem(LOGO_HIDDEN_KEY);
      localStorage.removeItem(LOGO_CUSTOM_KEY);
      logoUploadInput.value = "";
      applyLogoState();
    });

    applyLogoState();

    var MODELO_MAX_BYTES = 60 * 1024 * 1024;
    var MODELO_MAX_TRIANGULOS = 6000000;
    var lastMeshStats = null;
    var densidadeDoArquivo = null;

    function densidadeAtual() {
      if (densidadeDoArquivo) return densidadeDoArquivo.densidade;
      if (materialSelect.value === "outro") {
        return parseFloat(String(densidadeInput.value).replace(",", "."));
      }
      var opt = materialSelect.options[materialSelect.selectedIndex];
      return parseFloat(opt.dataset.densidade);
    }

    function mostrarErroModelo(msg) {
      modeloErro.textContent = msg;
      modeloErro.hidden = false;
    }

    function limparErroModelo() {
      modeloErro.hidden = true;
      modeloErro.textContent = "";
    }

    function aplicarEstimativas() {
      if (!lastMeshStats) return;

      var densidade = densidadeAtual();
      var infillPct = parseFloat(String(infillInput.value).replace(",", ".")) || 0;

      if (!isFinite(densidade) || densidade <= 0) {
        mostrarErroModelo("Não encontramos a densidade do material nesse arquivo. Selecione o material (ou informe a densidade manualmente) para calcular o peso.");
        tempoHint.hidden = true;
        return;
      }
      limparErroModelo();

      var volumeCm3 = lastMeshStats.volumeMm3 / 1000;
      peso.value = (volumeCm3 * densidade * (infillPct / 100)).toFixed(1);

      var alturaCamada = parseFloat(String(alturaCamadaInput.value).replace(",", ".")) || parseFloat(d.alturaCamadaMm) || 0.2;
      var velocidade = parseFloat(String(velocidadeInput.value).replace(",", ".")) || parseFloat(d.velocidadeMmS) || 50;
      var larguraExtrusao = parseFloat(d.larguraExtrusaoMm) || 0.4;
      var overheadPorCamada = parseFloat(d.overheadCamadaS) || 2;

      var alturaModelo = lastMeshStats.bbox.maxZ - lastMeshStats.bbox.minZ;
      var nCamadas = Math.ceil(alturaModelo / alturaCamada);
      var volumeEfetivoMm3 = lastMeshStats.volumeMm3 * (infillPct / 100);
      var vazaoMm3S = velocidade * alturaCamada * larguraExtrusao;
      var tempoTotalMin = vazaoMm3S > 0
        ? (volumeEfetivoMm3 / vazaoMm3S + nCamadas * overheadPorCamada) / 60
        : 0;

      horas.value = Math.floor(tempoTotalMin / 60);
      minutos.value = Math.round(tempoTotalMin % 60);
      tempoHint.hidden = false;

      pesoAutoTag.hidden = false;
      tempoAutoTag.hidden = false;

      calc();
    }

    peso.addEventListener("input", function () {
      pesoAutoTag.hidden = true;
    });
    [horas, minutos].forEach(function (el) {
      el.addEventListener("input", function () {
        tempoAutoTag.hidden = true;
      });
    });

    function processarStats(stats, nomeArquivo, densidadeArquivo) {
      var triangleCount = stats.triangleCount;
      var bbox = stats.bbox;
      var volumeMm3 = stats.volumeMm3;

      if (!triangleCount) {
        mostrarErroModelo("Não foi possível ler triângulos desse arquivo.");
        return;
      }
      if (triangleCount > MODELO_MAX_TRIANGULOS) {
        mostrarErroModelo("Modelo muito complexo para calcular no navegador. Tente simplificar a malha ou informe peso/tempo manualmente.");
        return;
      }
      if (volumeMm3 <= 0) {
        mostrarErroModelo("Malha inválida ou não fechada (non-manifold). Tente exportar novamente do seu software de modelagem.");
        return;
      }

      lastMeshStats = { volumeMm3: volumeMm3, bbox: bbox };
      densidadeDoArquivo = densidadeArquivo || null;
      limparErroModelo();

      nome.value = nomeArquivo.replace(/\.(stl|3mf)$/i, "");

      modeloNomeOut.textContent = nomeArquivo;
      modeloDimsOut.textContent =
        (bbox.maxX - bbox.minX).toFixed(1) + " × " +
        (bbox.maxY - bbox.minY).toFixed(1) + " × " +
        (bbox.maxZ - bbox.minZ).toFixed(1) + " mm";
      modeloVolumeOut.textContent = (volumeMm3 / 1000).toFixed(2) + " cm³";
      if (densidadeDoArquivo) {
        modeloDensidadeOut.textContent = "Densidade lida do arquivo: " + densidadeDoArquivo.densidade + " g/cm³";
        modeloDensidadeOut.hidden = false;
      } else {
        modeloDensidadeOut.hidden = true;
      }
      modeloPreview.hidden = false;

      modeloBadgeNome.textContent = nomeArquivo;
      modeloBadge.hidden = false;
      modeloAbrirBtn.hidden = true;
      fecharModeloModal();

      aplicarEstimativas();
    }

    function abrirModeloModal() {
      modeloModal.hidden = false;
    }

    function fecharModeloModal() {
      modeloModal.hidden = true;
    }

    modeloAbrirBtn.addEventListener("click", abrirModeloModal);
    modeloEditarBtn.addEventListener("click", abrirModeloModal);
    modeloFecharBtn.addEventListener("click", fecharModeloModal);
    modeloModal.addEventListener("click", function (e) {
      if (e.target === modeloModal) fecharModeloModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modeloModal.hidden) fecharModeloModal();
    });

    modeloRemoverBtn.addEventListener("click", function () {
      modeloUpload.value = "";
      lastMeshStats = null;
      densidadeDoArquivo = null;
      modeloPreview.hidden = true;
      limparErroModelo();
      modeloBadge.hidden = true;
      modeloAbrirBtn.hidden = false;
      tempoHint.hidden = true;
      pesoAutoTag.hidden = true;
      tempoAutoTag.hidden = true;
    });

    function mostrarCarregandoModelo(ativo) {
      modeloLoading.hidden = !ativo;
      modeloDropzoneTexto.hidden = ativo;
    }

    function processarArquivoModelo(file) {
      if (!file) return;

      modeloPreview.hidden = true;
      limparErroModelo();

      if (file.size > MODELO_MAX_BYTES) {
        mostrarErroModelo("Arquivo muito grande (máx. 60MB).");
        modeloUpload.value = "";
        return;
      }

      var ext = (file.name.split(".").pop() || "").toLowerCase();

      if (ext === "stl") {
        mostrarCarregandoModelo(true);
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var triangulos = parseSTL(reader.result);
            var stats = triangulos.length
              ? { triangleCount: triangulos.length, bbox: computeBoundingBox(triangulos), volumeMm3: computeMeshVolumeMm3(triangulos) }
              : { triangleCount: 0, bbox: bboxVazio(), volumeMm3: 0 };
            processarStats(stats, file.name, null);
          } catch (e) {
            mostrarErroModelo("Não foi possível ler esse arquivo STL.");
          } finally {
            mostrarCarregandoModelo(false);
          }
        };
        reader.onerror = function () {
          mostrarErroModelo("Falha ao ler o arquivo.");
          mostrarCarregandoModelo(false);
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === "3mf") {
        if (typeof JSZip === "undefined") {
          mostrarErroModelo("Não foi possível carregar o leitor de 3MF. Verifique sua conexão e tente novamente.");
          return;
        }
        mostrarCarregandoModelo(true);
        var zipRef = null;
        JSZip.loadAsync(file)
          .then(function (zip) {
            zipRef = zip;
            var modelFiles = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
            if (!modelFiles.length) modelFiles = zip.file(/3dmodel\.model$/i);
            if (!modelFiles.length) throw new Error("modelo não encontrado no 3MF");
            var configFiles = zip.file(/project_settings\.config$/i);
            return Promise.all([
              modelFiles[0].async("text"),
              configFiles.length ? configFiles[0].async("text") : Promise.resolve(null)
            ]);
          })
          .then(function (resultados) {
            var xmlText = resultados[0];
            var configText = resultados[1];
            var densidadeArquivo = configText ? parse3MFDensidade(configText) : null;
            return parse3MFPackage(zipRef, xmlText).then(function (resultado) {
              processarStats(resultado, file.name, densidadeArquivo);
            });
          })
          .catch(function () {
            mostrarErroModelo("Não foi possível ler esse arquivo 3MF.");
          })
          .then(function () {
            mostrarCarregandoModelo(false);
          });
      } else {
        mostrarErroModelo("Formato não suportado. Envie um arquivo .stl ou .3mf.");
        modeloUpload.value = "";
      }
    }

    modeloUpload.addEventListener("change", function () {
      var file = modeloUpload.files && modeloUpload.files[0];
      processarArquivoModelo(file);
    });

    ["dragenter", "dragover"].forEach(function (evt) {
      modeloDropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        modeloDropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "dragend", "drop"].forEach(function (evt) {
      modeloDropzone.addEventListener(evt, function () {
        modeloDropzone.classList.remove("is-dragover");
      });
    });
    modeloDropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      processarArquivoModelo(file);
    });

    materialSelect.addEventListener("change", function () {
      densidadeWrap.hidden = materialSelect.value !== "outro";
      densidadeDoArquivo = null;
      modeloDensidadeOut.hidden = true;
      aplicarEstimativas();
    });
    [infillInput, alturaCamadaInput, velocidadeInput, densidadeInput].forEach(function (el) {
      el.addEventListener("input", aplicarEstimativas);
    });

    form.addEventListener("input", calc);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (current) addBtn.click();
    });
  })();

