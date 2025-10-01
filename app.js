const contains = (t, q) => (t || '').toLowerCase().includes((q || '').toLowerCase());
const state = { q: '', cat: 'All' };

function renderCategories() {
  const cats = ['All', ...new Set(GPTS.flatMap(x => x.categories || []))];
  const wrap = document.getElementById('categories');
  wrap.innerHTML = cats
    .map(c => `<button class="category-btn ${state.cat === c ? 'active' : ''}" data-cat="${c}">${c}</button>`)
    .join('');
  wrap.querySelectorAll('.category-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.cat = btn.dataset.cat;
      renderCategories();
      renderGrid();
    })
  );
}

function renderLanguageIcons() {
  const el = document.getElementById('languageIcons');
  el.innerHTML = LANGUAGES.map(
    l =>
      `<a href="${l.url}" class="lang-icon" title="${l.name}" target="_blank" rel="noopener">
        <img src="${l.icon}" alt="${l.name}" onerror="this.src='./assets/fallback.svg'"/>
        <span>${l.name}</span>
      </a>`
  ).join('');
}

function cardHTML(g) {
  const open = g.url && g.url !== '#' ? `<a href="${g.url}" target="_blank" rel="noopener">Open</a>` : '';
  return `
    <article class="gpt-card">
      <div class="gpt-card-icon">
        <img src="${g.icon}" alt="${g.title}" onerror="this.src='./assets/fallback.svg'">
      </div>
      <div class="gpt-card-content">
        <div class="gpt-card-header">
          <h3 class="gpt-card-title">${g.title}</h3>
          <div class="gpt-card-actions">${open}</div>
        </div>
        <p class="gpt-card-description">${g.desc}</p>
      </div>
    </article>`;
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const q = state.q.trim();
  const items = GPTS.filter(
    g =>
      (state.cat === 'All' || (g.categories || []).includes(state.cat)) &&
      (!q ||
        contains(g.title, q) ||
        contains(g.desc, q) ||
        (g.categories || []).some(c => contains(c, q)))
  );
  grid.innerHTML = items.map(cardHTML).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  renderLanguageIcons();
  renderGrid();

  document.getElementById('searchInput').addEventListener('input', e => {
    state.q = e.target.value;
    renderGrid();
  });

  // ✅ Form handler goes here
  document.getElementById('gptForm').addEventListener('submit', e => {
    e.preventDefault();

    const title = document.getElementById('gptTitle').value.trim();
    const desc = document.getElementById('gptDesc').value.trim();
    const url = document.getElementById('gptUrl').value.trim();
    const icon = document.getElementById('gptIcon').value.trim();
    const categories = document
      .getElementById('gptCategories')
      .value.split(',')
      .map(c => c.trim());

    // Add to GPTS array
    GPTS.push({ title, desc, url, icon, categories });

    // Re-render
    renderCategories();
    renderGrid();

    // Reset form
    e.target.reset();
  });
});
