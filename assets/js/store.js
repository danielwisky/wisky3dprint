// ---------------------------------------------------------------------------
// BLOCO: Carrossel de fotos do card
// ---------------------------------------------------------------------------

(function () {
  const carousels = document.querySelectorAll("[data-carousel]");
  if (!carousels.length) return;

  carousels.forEach(function (car) {
    const slides = car.querySelectorAll(".stock-slide");
    const dots = car.querySelectorAll(".stock-dot");
    const prev = car.querySelector(".stock-nav-prev");
    const next = car.querySelector(".stock-nav-next");
    let idx = 0;

    function show(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        const active = n === idx;
        s.classList.toggle("is-active", active);
        s.tabIndex = active ? 0 : -1;
      });
      dots.forEach(function (d, n) {
        d.classList.toggle("is-active", n === idx);
      });
    }

    if (prev)
      prev.addEventListener("click", function (e) {
        e.stopPropagation();
        show(idx - 1);
      });
    if (next)
      next.addEventListener("click", function (e) {
        e.stopPropagation();
        show(idx + 1);
      });
    dots.forEach(function (d, n) {
      d.addEventListener("click", function (e) {
        e.stopPropagation();
        show(n);
      });
    });

    // Swipe no celular
    let x0 = null;
    car.addEventListener(
      "touchstart",
      function (e) {
        x0 = e.touches[0].clientX;
      },
      { passive: true }
    );
    car.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Botão "Quero essa peça" (copia mensagem para o Instagram)
// ---------------------------------------------------------------------------

(function () {
  const buttons = document.querySelectorAll("[data-stock-buy]");
  if (!buttons.length) return;

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const name = btn.getAttribute("data-piece");
      if (!name) return;
      const inStock = btn.getAttribute("data-in-stock") === "true";
      const msg = "Oi! Tenho interesse na peça " + name + (inStock ? " (pronta entrega)." : ".");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).catch(function () {});
      }
    });
  });
})();

// ---------------------------------------------------------------------------
// BLOCO: Filtro por categoria, busca e ordenação da vitrine
// ---------------------------------------------------------------------------

(function () {
  const controls = document.querySelector("[data-stock-controls]");
  const grid = document.querySelector(".stock-grid");
  if (!controls || !grid) return;

  const cards = Array.prototype.slice.call(grid.querySelectorAll(".stock-card"));
  if (!cards.length) return;

  const chips = Array.prototype.slice.call(controls.querySelectorAll(".stock-chip"));
  const sortSelect = controls.querySelector("[data-stock-sort]");
  const searchInput = controls.querySelector("[data-stock-search]");
  const activeBar = controls.querySelector("[data-stock-active]");
  const activePills = controls.querySelector("[data-stock-active-pills]");
  const clearBtn = controls.querySelector("[data-stock-clear]");
  const countMsg = document.querySelector("[data-stock-count]");

  let activeFilters = [];
  let searchTerm = "";

  // Remove acentos e caixa pra busca "tolerante" (ex.: "poke" acha "Pokémon").
  function normalize(txt) {
    return (txt || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  // Pré-computa categorias e nome normalizado de cada card (uma vez só).
  const items = cards.map(function (card) {
    return {
      el: card,
      cats: (card.getAttribute("data-categories") || "").split("§").filter(function (c) {
        return c !== "";
      }),
      name: normalize(card.getAttribute("data-name"))
    };
  });

  // Uma peça combina quando tem TODAS as categorias marcadas (interseção) e o
  // nome contém o termo buscado. matches(_, [], "") === true (mostra tudo).
  function matches(item, filters, term) {
    const hasCategories = filters.every(function (f) {
      return item.cats.indexOf(f) !== -1;
    });
    return hasCategories && (term === "" || item.name.indexOf(term) !== -1);
  }

  function count(filters, term) {
    let n = 0;
    items.forEach(function (item) {
      if (matches(item, filters, term)) n++;
    });
    return n;
  }

  function pluralize(n) {
    return n + (n === 1 ? " peça" : " peças");
  }

  function updateCount(visibleCount) {
    if (!countMsg) return;
    countMsg.textContent =
      visibleCount > 0 ? "Mostrando " + pluralize(visibleCount) : "Nenhuma peça com esse filtro por enquanto.";
  }

  // Re-dispara um fade-in suave nos cards visíveis (um reflow só).
  function replayFade() {
    cards.forEach(function (card) {
      card.classList.remove("stock-card--in");
    });
    void grid.offsetWidth;
    cards.forEach(function (card) {
      if (!card.classList.contains("stock-card--hidden")) {
        card.classList.add("stock-card--in");
      }
    });
  }

  function applyFilter(withFade) {
    let visibleCount = 0;
    items.forEach(function (item) {
      const show = matches(item, activeFilters, searchTerm);
      item.el.classList.toggle("stock-card--hidden", !show);
      if (show) visibleCount++;
    });
    updateCount(visibleCount);
    updateChips();
    updateActiveFilters();
    if (withFade) replayFade();
  }

  function sort(mode) {
    const sorted = cards.slice();
    sorted.sort(function (a, b) {
      if (mode === "preco-asc" || mode === "preco-desc") {
        const pa = parseFloat(a.getAttribute("data-price")) || 0;
        const pb = parseFloat(b.getAttribute("data-price")) || 0;
        return mode === "preco-asc" ? pa - pb : pb - pa;
      }
      if (mode === "nome-asc") {
        return (a.getAttribute("data-name") || "").localeCompare(b.getAttribute("data-name") || "", "pt-BR", {
          sensitivity: "base"
        });
      }
      // padrão: pronta entrega primeiro, depois oferta, depois ordem original do YAML
      function group(el) {
        if (el.getAttribute("data-sale") === "true") return 0;
        if (el.getAttribute("data-in-stock") === "true") return 1;
        return 2;
      }
      const ga = group(a);
      const gb = group(b);
      if (ga !== gb) return ga - gb;
      return (parseInt(a.getAttribute("data-order"), 10) || 0) - (parseInt(b.getAttribute("data-order"), 10) || 0);
    });
    sorted.forEach(function (card) {
      grid.appendChild(card);
    });
  }

  // Atualiza cada chip: estado ativo, contagem CONTEXTUAL (quantas peças
  // sobram se ele for somado à seleção atual) e desabilita quem daria zero.
  // "Todos" e chips já ativos nunca desabilitam (precisa poder remover).
  function updateChips() {
    chips.forEach(function (chip) {
      const filter = chip.getAttribute("data-filter") || "todos";
      const active = filter === "todos" ? activeFilters.length === 0 : activeFilters.indexOf(filter) !== -1;

      let n;
      if (filter === "todos") n = count([], searchTerm);
      else if (active) n = count(activeFilters, searchTerm);
      else n = count(activeFilters.concat([filter]), searchTerm);

      const countEl = chip.querySelector(".stock-chip-count");
      if (countEl) countEl.textContent = n;

      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");

      const disabled = filter !== "todos" && !active && n === 0;
      chip.classList.toggle("is-disabled", disabled);
      chip.disabled = disabled;
      if (disabled) {
        chip.setAttribute("aria-label", filter + ", indisponível com os filtros atuais");
      } else {
        chip.removeAttribute("aria-label");
      }
    });
  }

  // Monta as etiquetas de filtros ativos, cada uma com × pra remover.
  // A barra some quando não há nada marcado.
  function updateActiveFilters() {
    if (!activeBar || !activePills) return;
    activePills.innerHTML = "";
    activeFilters.forEach(function (cat) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "stock-active-pill";
      pill.setAttribute("data-remove", cat);
      pill.setAttribute("aria-label", "Remover filtro " + cat);
      const label = document.createElement("span");
      label.textContent = cat;
      const x = document.createElement("span");
      x.className = "stock-active-x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "×";
      pill.appendChild(label);
      pill.appendChild(x);
      activePills.appendChild(pill);
    });
    const activeLabel = activeBar.querySelector(".stock-active-label");
    if (activeLabel) activeLabel.hidden = activeFilters.length === 0;
    activeBar.hidden = activeFilters.length === 0 && searchTerm === "";
  }

  // Reflete filtro + ordenação na URL (?categoria=&ordem=), sem poluir o histórico.
  function updateURL() {
    if (!window.history || !window.history.replaceState) return;
    const params = new URLSearchParams(window.location.search);
    if (activeFilters.length > 0) params.set("categoria", activeFilters.join(","));
    else params.delete("categoria");
    if (searchTerm) params.set("busca", searchTerm);
    else params.delete("busca");
    const order = sortSelect ? sortSelect.value : "padrao";
    if (order && order !== "padrao") params.set("ordem", order);
    else params.delete("ordem");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }

  function toggleCategory(cat) {
    const i = activeFilters.indexOf(cat);
    if (i === -1) activeFilters.push(cat);
    else activeFilters.splice(i, 1);
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      if (chip.disabled) return;
      const filter = chip.getAttribute("data-filter") || "todos";
      if (filter === "todos") activeFilters = [];
      else toggleCategory(filter);
      applyFilter(true);
      updateURL();
    });
  });

  // × nas etiquetas de filtros ativos (remove aquela categoria).
  if (activePills) {
    activePills.addEventListener("click", function (e) {
      const pill = e.target.closest(".stock-active-pill");
      if (!pill) return;
      toggleCategory(pill.getAttribute("data-remove"));
      applyFilter(true);
      updateURL();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      activeFilters = [];
      searchTerm = "";
      if (searchInput) searchInput.value = "";
      applyFilter(true);
      updateURL();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchTerm = normalize(searchInput.value);
      applyFilter(true);
      updateURL();
    });
  }

  // Botão "Filtros": recolhe/expande TUDO (busca, chips e filtros ativos),
  // deixando só o próprio botão e a ordenação. Usa uma classe no contêiner
  // para não conflitar com o controle dinâmico da barra de filtros ativos.
  const toggleBtn = controls.querySelector("[data-stock-toggle]");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      const expanded = toggleBtn.getAttribute("aria-expanded") !== "true";
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      controls.classList.toggle("is-collapsed", !expanded);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      sort(sortSelect.value);
      updateURL();
    });
  }

  // Estado inicial a partir da URL (link compartilhável / sobrevive ao refresh).
  (function initFromURL() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("categoria");
    const search = params.get("busca");
    const order = params.get("ordem");

    if (cat) {
      const validFilters = chips.map(function (c) {
        return c.getAttribute("data-filter");
      });
      activeFilters = cat.split(",").filter(function (p) {
        return p !== "todos" && validFilters.indexOf(p) !== -1;
      });
    }
    if (search && searchInput) {
      searchInput.value = search;
      searchTerm = normalize(search);
    }
    if (order && sortSelect) {
      const exists = Array.prototype.some.call(sortSelect.options, function (o) {
        return o.value === order;
      });
      if (exists) sortSelect.value = order;
    }
    sort(sortSelect ? sortSelect.value : "padrao");
    applyFilter(false); // sem fade no load (evita conflito com o reveal-stagger)
  })();
})();
