// ---------------------------------------------------------------------------
// BLOCO: Filtros (categoria e modelador) e busca da página de projetos
// ---------------------------------------------------------------------------

(function () {
  const controls = document.querySelector("[data-projects-controls]");
  const grid = document.querySelector(".projects-grid");
  if (!controls || !grid) return;

  const chips = Array.prototype.slice.call(controls.querySelectorAll(".stock-chip"));
  const searchInput = controls.querySelector("[data-projects-search]");
  const countMsg = document.querySelector("[data-projects-count]");
  const GROUPS = ["categoria", "modelador"];

  // Palavras de ligação que o cliente digita ("pikachu do pokemon") mas que
  // não ajudam a achar nada.
  const STOPWORDS = ["de", "do", "da", "dos", "das", "o", "a", "e", "the"];

  // Remove acentos e caixa pra busca "tolerante" (ex.: "pokemon" acha "Pokémon").
  function normalize(txt) {
    return (txt || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  const items = Array.prototype.slice.call(grid.querySelectorAll(".stock-card")).map(function (card) {
    const item = { el: card, text: normalize(card.getAttribute("data-search")) };
    GROUPS.forEach(function (g) {
      item[g] = card.getAttribute("data-" + g);
    });
    return item;
  });

  const active = { categoria: [], modelador: [] };
  let words = [];

  // Cada palavra buscada precisa aparecer no nome, categoria, modelador ou
  // versão, em qualquer ordem.
  function matchesSearch(item) {
    return words.every(function (w) {
      return item.text.indexOf(w) !== -1;
    });
  }

  // Dentro de um grupo, várias marcadas = união (cada projeto tem um valor só);
  // entre grupos, interseção. `skip` ignora um grupo (usado nas contagens).
  function matchesGroups(item, skip) {
    return GROUPS.every(function (g) {
      return g === skip || active[g].length === 0 || active[g].indexOf(item[g]) !== -1;
    });
  }

  // Uma passada só: mostra/esconde os cards e conta, por grupo, quantos
  // projetos cada chip mostraria (respeitando a busca e o outro grupo).
  function apply() {
    const counts = { categoria: {}, modelador: {} };
    const totals = { categoria: 0, modelador: 0 };
    let visible = 0;

    items.forEach(function (item) {
      if (!matchesSearch(item)) {
        item.el.classList.add("stock-card--hidden");
        return;
      }
      GROUPS.forEach(function (g) {
        if (matchesGroups(item, g)) {
          counts[g][item[g]] = (counts[g][item[g]] || 0) + 1;
          totals[g]++;
        }
      });
      const show = matchesGroups(item);
      item.el.classList.toggle("stock-card--hidden", !show);
      if (show) visible++;
    });

    chips.forEach(function (chip) {
      const group = chip.getAttribute("data-group");
      const filter = chip.getAttribute("data-filter");
      const isAll = filter === "todos";
      const isActive = isAll ? active[group].length === 0 : active[group].indexOf(filter) !== -1;
      const n = isAll ? totals[group] : counts[group][filter] || 0;

      const countEl = chip.querySelector(".stock-chip-count");
      if (countEl) countEl.textContent = n;
      chip.classList.toggle("is-active", isActive);
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
      const disabled = !isAll && !isActive && n === 0;
      chip.classList.toggle("is-disabled", disabled);
      chip.disabled = disabled;
    });

    if (countMsg) {
      countMsg.textContent =
        visible > 0
          ? "Mostrando " + visible + (visible === 1 ? " projeto" : " projetos")
          : "Não achei esse aqui. Me fala o que você procura, talvez eu tenha o arquivo!";
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      if (chip.disabled) return;
      const list = active[chip.getAttribute("data-group")];
      const filter = chip.getAttribute("data-filter");
      if (filter === "todos") {
        list.length = 0;
      } else {
        const i = list.indexOf(filter);
        if (i === -1) list.push(filter);
        else list.splice(i, 1);
      }
      apply();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      words = normalize(searchInput.value)
        .split(/\s+/)
        .filter(function (w) {
          return w !== "" && STOPWORDS.indexOf(w) === -1;
        });
      apply();
    });
  }
})();
