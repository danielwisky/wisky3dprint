// ---------------------------------------------------------------------------
// BLOCK: Filters (category and designer) and search for the projects page
// ---------------------------------------------------------------------------

(function () {
  const controls = document.querySelector("[data-projects-controls]");
  const grid = document.querySelector(".projects-grid");
  if (!controls || !grid) return;

  const chips = Array.prototype.slice.call(controls.querySelectorAll(".stock-chip"));
  const searchInput = controls.querySelector("[data-projects-search]");
  const countMsg = document.querySelector("[data-projects-count]");
  const GROUPS = ["category", "designer"];

  // Filler words customers type ("pikachu do pokemon") that don't help match.
  const STOPWORDS = ["de", "do", "da", "dos", "das", "o", "a", "e", "the"];

  // Drops accents and case so the search is forgiving ("pokemon" finds "Pokémon").
  function normalize(text) {
    return (text || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  const items = Array.prototype.slice.call(grid.querySelectorAll(".stock-card")).map(function (card) {
    const item = { el: card, text: normalize(card.getAttribute("data-search")) };
    GROUPS.forEach(function (group) {
      item[group] = card.getAttribute("data-" + group);
    });
    return item;
  });

  const active = { category: [], designer: [] };
  let words = [];

  // Every searched word must show up in the name, category, designer or
  // version, in any order.
  function matchesSearch(item) {
    return words.every(function (word) {
      return item.text.indexOf(word) !== -1;
    });
  }

  // Inside a group several chips = union (each project has one value);
  // across groups = intersection. `skip` ignores one group (used for counts).
  function matchesGroups(item, skip) {
    return GROUPS.every(function (group) {
      return group === skip || active[group].length === 0 || active[group].indexOf(item[group]) !== -1;
    });
  }

  // Single pass: shows/hides cards and counts, per group, how many projects
  // each chip would show (respecting the search and the other group).
  function apply() {
    const counts = { category: {}, designer: {} };
    const totals = { category: 0, designer: 0 };
    let visible = 0;

    items.forEach(function (item) {
      if (!matchesSearch(item)) {
        item.el.classList.add("stock-card--hidden");
        return;
      }
      GROUPS.forEach(function (group) {
        if (matchesGroups(item, group)) {
          counts[group][item[group]] = (counts[group][item[group]] || 0) + 1;
          totals[group]++;
        }
      });
      const show = matchesGroups(item);
      item.el.classList.toggle("stock-card--hidden", !show);
      if (show) visible++;
    });

    chips.forEach(function (chip) {
      const group = chip.getAttribute("data-group");
      const filter = chip.getAttribute("data-filter");
      const isAll = filter === "all";
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
      if (filter === "all") {
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
        .filter(function (word) {
          return word !== "" && STOPWORDS.indexOf(word) === -1;
        });
      apply();
    });
  }
})();
