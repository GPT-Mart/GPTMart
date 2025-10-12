// Safety: ensure GPTS/LANGUAGES exist so the page never blanks
window.GPTS = Array.isArray(window.GPTS) ? window.GPTS : [];
window.LANGUAGES = Array.isArray(window.LANGUAGES) ? window.LANGUAGES : [];
// ---------- Safe access to data ----------
function getArray(ref) {
  return Array.isArray(ref) ? ref : [];
}
const DATA = {
  get GPTS() { return getArray(window.GPTS); },
  set GPTS(v) { window.GPTS = getArray(v); },
  get LANGUAGES() { return getArray(window.LANGUAGES); },
  set LANGUAGES(v) { window.LANGUAGES = getArray(v); },
};

// If data didn't load, initialize to [] so UI doesn't crash
if (!Array.isArray(window.GPTS)) window.GPTS = [];
if (!Array.isArray(window.LANGUAGES)) window.LANGUAGES = [];

// ---------- Helpers & state ----------
const contains = (t, q) => (t || '').toLowerCase().includes((q || '').toLowerCase());
const state = { q: '', cat: 'All' };

// Local storage utilities for user-added GPTs
const STORAGE_KEY = 'gptmart_custom_gpts_v1';
const loadCustom = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};
const saveCustom = (items) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items || [])); }
  catch { /* ignore quota/security errors */ }
};

// Safe GA helper
function gaEvent(name, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
}

// ---------- Rendering ----------
function renderCategories() {
  const cats = ['All', ...new Set(DATA.GPTS.flatMap(x => x.categories || []))];
  const wrap = document.getElementById('categories');
  wrap.innerHTML = cats
    .map(c => `<button class="category-btn ${state.cat === c ? 'active' : ''}" data-cat="${c}">${c}</button>`)
    .join('');
  wrap.querySelectorAll('.category-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.cat = btn.dataset.cat;
      gaEvent('select_content', { content_type: 'category', item_id: state.cat });
      renderCategories();
      renderGrid();
    })
  );
}

function renderLanguageIcons() {
  const el = document.getElementById('languageIcons');
  el.innerHTML = DATA.LANGUAGES.map(l => `
    <a href="${l.url}" class="lang-icon" title="${l.name}" target="_blank" rel="noopener">
      <img src="${l.icon}" alt="${l.name}" onerror="this.src='./assets/fallback.svg'"/>
      <span>${l.name}</span>
    </a>
  `).join('');
}

function cardHTML(g) {
  const open = g.url && g.url !== '#' ? `<a href="${g.url}" target="_blank" rel="noopener" data-track="open-link">Open</a>` : '';
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
    </article>
  `;
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const q = state.q.trim();
  const items = DATA.GPTS.filter(g =>
    (state.cat === 'All' || (g.categories || []).includes(state.cat)) &&
    (!q || contains(g.title, q) || contains(g.desc, q) || (g.categories || []).some(c => contains(c, q)))
  );
  grid.innerHTML = items.map(cardHTML).join('');

  // Track outbound opens
  grid.querySelectorAll('a[data-track="open-link"]').forEach(a => {
    a.addEventListener('click', () => {
      gaEvent('select_content', { content_type: 'gpt', item_id: a.href });
    });
  });
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  // Merge built-ins + user's saved items
  window.CUSTOM_GPTS = loadCustom();
  if (Array.isArray(window.CUSTOM_GPTS) && window.CUSTOM_GPTS.length) {
    DATA.GPTS.push(...window.CUSTOM_GPTS);
  }

  renderCategories();
  renderLanguageIcons();
  renderGrid();

  // Search + GA
  const searchEl = document.getElementById('searchInput');
  let lastSearchSent = '';
  searchEl.addEventListener('input', e => {
    state.q = e.target.value;
    renderGrid();
    const term = state.q.trim();
    if (term && term !== lastSearchSent) {
      lastSearchSent = term;
      gaEvent('search', { search_term: term });
    }
  });

  // Upload form
  const form = document.getElementById('gptForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const title = document.getElementById('gptTitle').value.trim();
      const desc = document.getElementById('gptDesc').value.trim();
      const url = document.getElementById('gptUrl').value.trim();
      const icon = document.getElementById('gptIcon').value.trim();
      const categories = document.getElementById('gptCategories').value
        .split(',').map(c => c.trim()).filter(Boolean);

      if (!title || !desc || !url || !icon || !categories.length) return;

      const newItem = { title, desc, url, icon, categories };

      DATA.GPTS.push(newItem);
      window.CUSTOM_GPTS.push(newItem);
      saveCustom(window.CUSTOM_GPTS);

      gaEvent('add_gpt', {
        value: 1,
        item_name: title,
        item_category: categories[0] || 'Uncategorized'
      });

      renderCategories();
      renderGrid();
      form.reset();
    });
  }

  // Clear local GPTs
  const clearBtn = document.getElementById('clearCustom');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Remove all GPTs you added locally?')) return;

      const customSet = new Set(window.CUSTOM_GPTS.map(j => JSON.stringify(j)));
      for (let i = DATA.GPTS.length - 1; i >= 0; i--) {
        if (customSet.has(JSON.stringify(DATA.GPTS[i]))) DATA.GPTS.splice(i, 1);
      }
      window.CUSTOM_GPTS = [];
      saveCustom(window.CUSTOM_GPTS);
      renderCategories();
      renderGrid();
      gaEvent('clear_custom_gpts', { value: 1 });
    });
  }
});
