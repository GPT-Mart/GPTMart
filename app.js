/***********************
 * User & Storage Management
 ***********************/
function getUserId() {
    let userId = localStorage.getItem('gptdeck_user_id');
    if (!userId) {
        // crypto.randomUUID() is a modern, secure way to generate a unique ID
        userId = crypto.randomUUID();
        localStorage.setItem('gptdeck_user_id', userId);
    }
    return userId;
}

// Generate a unique storage key for each user, sandboxing their custom GPTs.
const USER_ID = getUserId();
const STORAGE_KEY = `gptdeck_custom_gpts_${USER_ID}`;

const loadCustom = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
};

const saveCustom = (items) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
    } catch {
        // Fails silently if storage is full or disabled
    }
};

/***********************
 * State & Utilities
 ***********************/
const state = { q: '', cat: 'All' };
const contains = (text, query) => (text || '').toLowerCase().includes((query || '').toLowerCase());

/***********************
 * Rendering
 ***********************/
function renderCategories() {
    const categoriesContainer = document.getElementById('categories');
    const allGpts = window.GPTS || [];
    const uniqueCategories = ['All', ...new Set(allGpts.flatMap(gpt => gpt.categories || []))];

    categoriesContainer.innerHTML = uniqueCategories.map(cat => `
        <button class="category-btn ${state.cat === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');

    categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.cat = btn.dataset.cat;
            renderCategories(); // Re-render to update active state
            renderGrid();
        });
    });
}

function renderLanguageIcons() {
    const languagesContainer = document.getElementById('languageIcons');
    const languages = window.LANGUAGES || [];
    languagesContainer.innerHTML = languages.map(lang => `
        <a href="${lang.url}" class="lang-icon" title="${lang.name}" target="_blank" rel="noopener">
            <img src="${lang.icon}" alt="${lang.name}" onerror="this.src='./assets/fallback.svg'"/>
            <span>${lang.name}</span>
        </a>
    `).join('');
}

function cardHTML(g) {
    const tagsHTML = (g.categories || []).map(cat => `<span class="gpt-card-tag">${cat}</span>`).join('');
    const openLinkHTML = g.url && g.url !== '#' ? `<a href="${g.url}" target="_blank" rel="noopener">Open</a>` : '';

    return `
    <article class="gpt-card">
      <div class="gpt-card-header">
        <div class="gpt-card-icon">
          <img src="${g.icon}" alt="${g.title}" onerror="this.src='./assets/fallback.svg'">
        </div>
        <h3 class="gpt-card-title">${g.title}</h3>
      </div>
      <p class="gpt-card-description">${g.desc}</p>
      <div class="gpt-card-footer">
        <div class="gpt-card-tags">${tagsHTML}</div>
        <div class="gpt-card-actions">${openLinkHTML}</div>
      </div>
    </article>
    `;
}

function renderGrid() {
    const grid = document.getElementById('grid');
    const noResultsEl = document.getElementById('noResults');
    const allGpts = window.GPTS || [];
    const query = state.q.trim();

    const filteredItems = allGpts.filter(g =>
        (state.cat === 'All' || (g.categories || []).includes(state.cat)) &&
        (!query || contains(g.title, query) || contains(g.desc, query) || (g.categories || []).some(c => contains(c, query)))
    );

    if (filteredItems.length > 0) {
        grid.innerHTML = filteredItems.map(cardHTML).join('');
        grid.style.display = 'grid';
        noResultsEl.style.display = 'none';
    } else {
        grid.innerHTML = '';
        grid.style.display = 'none';
        noResultsEl.style.display = 'block';
    }
}


/***********************
 * App Initialization
 ***********************/
document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Data
    window.GPTS = window.GPTS || [];
    window.LANGUAGES = window.LANGUAGES || [];
    window.CUSTOM_GPTS = loadCustom(); // This now loads from the user-specific key
    if (Array.isArray(window.CUSTOM_GPTS) && window.CUSTOM_GPTS.length) {
        // Prevent duplicates on page refresh
        const existingTitles = new Set(window.GPTS.map(g => g.title));
        const newCustomGpts = window.CUSTOM_GPTS.filter(customGpt => !existingTitles.has(customGpt.title));
        window.GPTS.push(...newCustomGpts);
    }

    // 2. Initial Render
    renderCategories();
    renderLanguageIcons();
    renderGrid();

    // 3. Event Listeners
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', e => {
        state.q = e.target.value;
        renderGrid();
    });

    // --- Modal Logic ---
    const modal = document.getElementById('addGptModal');
    const addGptBtn = document.getElementById('addGptBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    addGptBtn.addEventListener('click', () => modal.style.display = 'flex');
    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // --- Form Submission ---
    const gptForm = document.getElementById('gptForm');
    gptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('gptTitle').value.trim();
        const desc = document.getElementById('gptDesc').value.trim();
        const url = document.getElementById('gptUrl').value.trim();
        const icon = document.getElementById('gptIcon').value.trim();
        const categories = document.getElementById('gptCategories').value
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);

        if (!title || !desc || !url || !icon || !categories.length) {
            alert('Please fill out all fields.');
            return;
        }

        const newItem = { title, desc, url, icon, categories };
        
        window.GPTS.push(newItem);
        window.CUSTOM_GPTS.push(newItem);
        saveCustom(window.CUSTOM_GPTS); // This now saves to the user-specific key

        renderCategories();
        renderGrid();
        gptForm.reset();
        modal.style.display = 'none';
    });
    
    // --- Clear Custom GPTs ---
    const clearBtn = document.getElementById('clearCustom');
    clearBtn.addEventListener('click', () => {
        if (!window.CUSTOM_GPTS.length) {
            alert("You haven't added any custom GPTs yet.");
            return;
        }
        if (!confirm('Are you sure you want to remove all GPTs you added locally? This cannot be undone.')) return;

        // Re-filter the main GPTS array to remove custom ones
        const customGptTitles = new Set(window.CUSTOM_GPTS.map(g => g.title));
        window.GPTS = window.GPTS.filter(g => !customGptTitles.has(g.title));
        
        window.CUSTOM_GPTS = [];
        saveCustom([]); // This now clears the user-specific key
        
        renderCategories();
        renderGrid();
    });
});
