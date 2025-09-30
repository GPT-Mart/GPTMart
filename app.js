(function () {
  // Guards
  if (!window.GPTS || !Array.isArray(window.GPTS)) {
    console.error("GPTS is not defined or not an array.");
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const categoriesWrap = $("#categories");
  const langWrap = $("#languageIcons");
  const searchInput = $("#searchInput");

  // Derive categories & languages
  const categories = Array.from(
    new Set(window.GPTS.map((g) => g.category || "Other"))
  ).sort();

  const languages = window.GPT_LANGUAGES && Array.isArray(window.GPT_LANGUAGES)
    ? window.GPT_LANGUAGES
    : Array.from(new Set(window.GPTS.map((g) => g.language || "Other"))).sort();

  let state = {
    query: "",
    category: "All",
    language: "All"
  };

  // ---- Render helpers ----
  function renderCategories() {
    const all = ["All", ...categories];
    categoriesWrap.innerHTML = all
      .map((c) => {
        const active = c === state.category ? "active" : "";
        return `<button class="chip ${active}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
      })
      .join("");
  }

  function renderLanguages() {
    const all = ["All", ...languages];
    langWrap.innerHTML = all
      .map((l) => {
        const active = l === state.language ? "active" : "";
        return `<button class="chip ${active}" data-language="${escapeHtml(l)}">${escapeHtml(l)}</button>`;
      })
      .join("");
  }

  function renderGrid() {
    const q = state.query.trim().toLowerCase();

    const filtered = window.GPTS.filter((g) => {
      const matchesQuery =
        !q ||
        (g.name && g.name.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (Array.isArray(g.tags) && g.tags.join(" ").toLowerCase().includes(q));

      const matchesCat =
        state.category === "All" || (g.category || "Other") === state.category;

      const matchesLang =
        state.language === "All" || (g.language || "Other") === state.language;

      return matchesQuery && matchesCat && matchesLang;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          <p>No GPTs match your filters.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((g) => {
        const icon = g.icon || "🤖";
        const name = escapeHtml(g.name || "Untitled GPT");
        const desc = escapeHtml(g.description || "");
        const url = g.url ? `href="${g.url}" target="_blank" rel="noopener"` : "";
        const cat = escapeHtml(g.category || "Other");
        const lang = escapeHtml(g.language || "Other");

        return `
          <a class="card" ${url}>
            <div class="card-icon">${icon}</div>
            <div class="card-body">
              <div class="card-title">${name}</div>
              <div class="card-meta">
                <span class="pill">${cat}</span>
                <span class="pill">${lang}</span>
              </div>
              <p class="card-desc">${desc}</p>
            </div>
          </a>
        `;
      })
      .join("");
  }

  // ---- Events ----
  categoriesWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    state.category = btn.getAttribute("data-category");
    renderCategories();
    renderGrid();
  });

  langWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-language]");
    if (!btn) return;
    state.language = btn.getAttribute("data-language");
    renderLanguages();
    renderGrid();
  });

  searchInput.addEventListener("input", (e) => {
    state.query = e.target.value || "";
    renderGrid();
  });

  // ---- Utils ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---- Init ----
  renderCategories();
  renderLanguages();
  renderGrid();
})();
