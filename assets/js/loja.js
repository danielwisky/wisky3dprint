// ---------------------------------------------------------------------------
// BLOCO: Carrossel de fotos do card
// ---------------------------------------------------------------------------

  (function () {
    var carousels = document.querySelectorAll("[data-carousel]");
    if (!carousels.length) return;

    carousels.forEach(function (car) {
      var slides = car.querySelectorAll(".estoque-slide");
      var dots = car.querySelectorAll(".estoque-dot");
      var prev = car.querySelector(".estoque-nav-prev");
      var next = car.querySelector(".estoque-nav-next");
      var idx = 0;

      function show(i) {
        idx = (i + slides.length) % slides.length;
        slides.forEach(function (s, n) {
          var active = n === idx;
          s.classList.toggle("is-active", active);
          s.tabIndex = active ? 0 : -1;
        });
        dots.forEach(function (d, n) {
          d.classList.toggle("is-active", n === idx);
        });
      }

      if (prev) prev.addEventListener("click", function (e) { e.stopPropagation(); show(idx - 1); });
      if (next) next.addEventListener("click", function (e) { e.stopPropagation(); show(idx + 1); });
      dots.forEach(function (d, n) {
        d.addEventListener("click", function (e) { e.stopPropagation(); show(n); });
      });

      // Swipe no celular
      var x0 = null;
      car.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      car.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  })();


// ---------------------------------------------------------------------------
// BLOCO: Botão "Quero essa peça" (copia mensagem para o Instagram)
// ---------------------------------------------------------------------------

  (function () {
    var buttons = document.querySelectorAll("[data-estoque-buy]");
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nome = btn.getAttribute("data-peca");
        if (!nome) return;
        var prontaEntrega = btn.getAttribute("data-pronta-entrega") === "true";
        var msg = "Oi! Tenho interesse na peça " + nome + (prontaEntrega ? " (pronta entrega)." : ".");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).catch(function () {});
        }
      });
    });
  })();

  // Filtro (chips) + ordenação + estado na URL da vitrine da loja.

// ---------------------------------------------------------------------------
// BLOCO: Filtro por categoria, busca e ordenação da vitrine
// ---------------------------------------------------------------------------

  (function () {
    var controls = document.querySelector("[data-estoque-controls]");
    var grid = document.querySelector(".estoque-grid");
    if (!controls || !grid) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll(".estoque-card"));
    if (!cards.length) return;

    var chips = Array.prototype.slice.call(controls.querySelectorAll(".estoque-chip"));
    var sortSelect = controls.querySelector("[data-estoque-sort]");
    var searchInput = controls.querySelector("[data-estoque-search]");
    var activeBar = controls.querySelector("[data-estoque-active]");
    var activePills = controls.querySelector("[data-estoque-active-pills]");
    var clearBtn = controls.querySelector("[data-estoque-clear]");
    var countMsg = document.querySelector("[data-estoque-count]");

    var filtrosAtivos = [];
    var termoBusca = "";

    // Remove acentos e caixa pra busca "tolerante" (ex.: "poke" acha "Pokémon").
    function normalizar(txt) {
      return (txt || "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    }

    // Pré-computa categorias e nome normalizado de cada card (uma vez só).
    var itens = cards.map(function (card) {
      return {
        el: card,
        cats: (card.getAttribute("data-categorias") || "")
          .split("§")
          .filter(function (c) { return c !== ""; }),
        nome: normalizar(card.getAttribute("data-nome"))
      };
    });

    // Uma peça combina quando tem TODAS as categorias marcadas (interseção) e o
    // nome contém o termo buscado. combina(_, [], "") === true (mostra tudo).
    function combina(item, filtros, termo) {
      var temCategorias = filtros.every(function (f) {
        return item.cats.indexOf(f) !== -1;
      });
      return temCategorias && (termo === "" || item.nome.indexOf(termo) !== -1);
    }

    function contar(filtros, termo) {
      var n = 0;
      itens.forEach(function (item) { if (combina(item, filtros, termo)) n++; });
      return n;
    }

    function plural(n) {
      return n + (n === 1 ? " peça" : " peças");
    }

    function atualizarContagem(visiveis) {
      if (!countMsg) return;
      countMsg.textContent = visiveis > 0
        ? "Mostrando " + plural(visiveis)
        : "Nenhuma peça com esse filtro por enquanto.";
    }

    // Re-dispara um fade-in suave nos cards visíveis (um reflow só).
    function reproduzirFade() {
      cards.forEach(function (card) { card.classList.remove("estoque-card--in"); });
      void grid.offsetWidth;
      cards.forEach(function (card) {
        if (!card.classList.contains("estoque-card--hidden")) {
          card.classList.add("estoque-card--in");
        }
      });
    }

    function aplicarFiltro(comFade) {
      var visiveis = 0;
      itens.forEach(function (item) {
        var mostra = combina(item, filtrosAtivos, termoBusca);
        item.el.classList.toggle("estoque-card--hidden", !mostra);
        if (mostra) visiveis++;
      });
      atualizarContagem(visiveis);
      atualizarChips();
      atualizarFiltrosAtivos();
      if (comFade) reproduzirFade();
    }

    function ordenar(modo) {
      var ordenados = cards.slice();
      ordenados.sort(function (a, b) {
        if (modo === "preco-asc" || modo === "preco-desc") {
          var pa = parseFloat(a.getAttribute("data-preco")) || 0;
          var pb = parseFloat(b.getAttribute("data-preco")) || 0;
          return modo === "preco-asc" ? pa - pb : pb - pa;
        }
        if (modo === "nome-asc") {
          return (a.getAttribute("data-nome") || "").localeCompare(
            b.getAttribute("data-nome") || "",
            "pt-BR",
            { sensitivity: "base" }
          );
        }
        // padrão: pronta entrega primeiro, depois oferta, depois ordem original do YAML
        function grupo(el) {
          if (el.getAttribute("data-oferta") === "true") return 0;
          if (el.getAttribute("data-pronta-entrega") === "true") return 1;
          return 2;
        }
        var ga = grupo(a);
        var gb = grupo(b);
        if (ga !== gb) return ga - gb;
        return (parseInt(a.getAttribute("data-ordem"), 10) || 0) -
          (parseInt(b.getAttribute("data-ordem"), 10) || 0);
      });
      ordenados.forEach(function (card) {
        grid.appendChild(card);
      });
    }

    // Atualiza cada chip: estado ativo, contagem CONTEXTUAL (quantas peças
    // sobram se ele for somado à seleção atual) e desabilita quem daria zero.
    // "Todos" e chips já ativos nunca desabilitam (precisa poder remover).
    function atualizarChips() {
      chips.forEach(function (chip) {
        var filtro = chip.getAttribute("data-filtro") || "todos";
        var ativo = filtro === "todos"
          ? filtrosAtivos.length === 0
          : filtrosAtivos.indexOf(filtro) !== -1;

        var n;
        if (filtro === "todos") n = contar([], termoBusca);
        else if (ativo) n = contar(filtrosAtivos, termoBusca);
        else n = contar(filtrosAtivos.concat([filtro]), termoBusca);

        var countEl = chip.querySelector(".estoque-chip-count");
        if (countEl) countEl.textContent = n;

        chip.classList.toggle("is-active", ativo);
        chip.setAttribute("aria-pressed", ativo ? "true" : "false");

        var desabilita = filtro !== "todos" && !ativo && n === 0;
        chip.classList.toggle("is-disabled", desabilita);
        chip.disabled = desabilita;
      });
    }

    // Monta as etiquetas de filtros ativos, cada uma com × pra remover.
    // A barra some quando não há nada marcado.
    function atualizarFiltrosAtivos() {
      if (!activeBar || !activePills) return;
      activePills.innerHTML = "";
      filtrosAtivos.forEach(function (cat) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "estoque-active-pill";
        pill.setAttribute("data-remove", cat);
        pill.setAttribute("aria-label", "Remover filtro " + cat);
        var rotulo = document.createElement("span");
        rotulo.textContent = cat;
        var x = document.createElement("span");
        x.className = "estoque-active-x";
        x.setAttribute("aria-hidden", "true");
        x.textContent = "×";
        pill.appendChild(rotulo);
        pill.appendChild(x);
        activePills.appendChild(pill);
      });
      var activeLabel = activeBar.querySelector(".estoque-active-label");
      if (activeLabel) activeLabel.hidden = filtrosAtivos.length === 0;
      activeBar.hidden = filtrosAtivos.length === 0 && termoBusca === "";
    }

    // Reflete filtro + ordenação na URL (?categoria=&ordem=), sem poluir o histórico.
    function atualizarURL() {
      if (!window.history || !window.history.replaceState) return;
      var params = new URLSearchParams(window.location.search);
      if (filtrosAtivos.length > 0) params.set("categoria", filtrosAtivos.join(","));
      else params.delete("categoria");
      if (termoBusca) params.set("busca", termoBusca);
      else params.delete("busca");
      var ordem = sortSelect ? sortSelect.value : "padrao";
      if (ordem && ordem !== "padrao") params.set("ordem", ordem);
      else params.delete("ordem");
      var qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }

    function alternarCategoria(cat) {
      var i = filtrosAtivos.indexOf(cat);
      if (i === -1) filtrosAtivos.push(cat);
      else filtrosAtivos.splice(i, 1);
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (chip.disabled) return;
        var filtro = chip.getAttribute("data-filtro") || "todos";
        if (filtro === "todos") filtrosAtivos = [];
        else alternarCategoria(filtro);
        aplicarFiltro(true);
        atualizarURL();
      });
    });

    // × nas etiquetas de filtros ativos (remove aquela categoria).
    if (activePills) {
      activePills.addEventListener("click", function (e) {
        var pill = e.target.closest(".estoque-active-pill");
        if (!pill) return;
        alternarCategoria(pill.getAttribute("data-remove"));
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        filtrosAtivos = [];
        termoBusca = "";
        if (searchInput) searchInput.value = "";
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        termoBusca = normalizar(searchInput.value);
        aplicarFiltro(true);
        atualizarURL();
      });
    }

    // Botão "Filtros": recolhe/expande TUDO (busca, chips e filtros ativos),
    // deixando só o próprio botão e a ordenação. Usa uma classe no contêiner
    // para não conflitar com o controle dinâmico da barra de filtros ativos.
    var toggleBtn = controls.querySelector("[data-estoque-toggle]");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        var aberto = toggleBtn.getAttribute("aria-expanded") !== "true";
        toggleBtn.setAttribute("aria-expanded", aberto ? "true" : "false");
        controls.classList.toggle("is-collapsed", !aberto);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        ordenar(sortSelect.value);
        atualizarURL();
      });
    }

    // Estado inicial a partir da URL (link compartilhável / sobrevive ao refresh).
    (function initFromURL() {
      var params = new URLSearchParams(window.location.search);
      var cat = params.get("categoria");
      var busca = params.get("busca");
      var ordem = params.get("ordem");

      if (cat) {
        var validas = chips.map(function (c) { return c.getAttribute("data-filtro"); });
        filtrosAtivos = cat.split(",").filter(function (p) {
          return p !== "todos" && validas.indexOf(p) !== -1;
        });
      }
      if (busca && searchInput) {
        searchInput.value = busca;
        termoBusca = normalizar(busca);
      }
      if (ordem && sortSelect) {
        var existe = Array.prototype.some.call(sortSelect.options, function (o) {
          return o.value === ordem;
        });
        if (existe) sortSelect.value = ordem;
      }
      ordenar(sortSelect ? sortSelect.value : "padrao");
      aplicarFiltro(false); // sem fade no load (evita conflito com o reveal-stagger)
    })();
  })();
