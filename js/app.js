(() => {
  'use strict';

  // ---------- Хранилище (localStorage с защитой от ошибок) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* нет доступа */ }
    }
  };

  const FAV_KEY = 'msgapp.favorites.v1';
  const LANG_KEY = 'msgapp.lang';
  const SECTIONS = ['short', 'long'];

  let lang = store.get(LANG_KEY, null) || ((navigator.language || '').startsWith('uk') ? 'uk' : 'ru');
  let favorites = store.get(FAV_KEY, []); // [{key, text, section, cat, ts}]
  let index = null;                       // содержимое data/index.json
  const catCache = new Map();             // "short/category_1" -> [{key, text}]

  const t = (k, ...a) => { const v = I18N[lang][k] ?? I18N.ru[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
  const loc = (v) => (v && typeof v === 'object') ? (v[lang] ?? v.ru ?? v.uk ?? Object.values(v)[0] ?? '') : (v ?? '');

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const titleEl = $('#title');
  const backBtn = $('#backBtn');
  const langBtn = $('#langBtn');
  const favBtn = $('#favBtn');
  const favCount = $('#favCount');
  const toastEl = $('#toast');
  const sheet = $('#sheet');
  const sheetActions = $('#sheetActions');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.1 0 3.6 1.2 4.4 2.5h2C13.8 6.2 15.3 5 17.4 5 21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
  };

  // Стабильный id для сообщения без явного id (хэш текста FNV-1a)
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return 'h' + (h >>> 0).toString(36);
  }

  // ---------- Загрузка данных ----------
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return res.json();
  }

  async function loadIndex() {
    if (!index) index = await fetchJSON('data/index.json');
    return index;
  }

  function findCategory(section, catId) {
    return (index[section] || []).find((c) => c.id === catId);
  }

  async function loadCategory(section, catId) {
    const cacheKey = section + '/' + catId;
    if (catCache.has(cacheKey)) return catCache.get(cacheKey);
    const cat = findCategory(section, catId);
    if (!cat) return null;
    const data = await fetchJSON('data/' + (cat.file || (section + '/' + catId + '.json')));
    const list = (Array.isArray(data) ? data : data.messages || []).map((m) => {
      const msg = typeof m === 'string' ? { text: m } : m;
      const raw = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
      return { key: section + '/' + catId + '/' + (msg.id ?? hash(raw)), text: msg.text, section, cat: catId };
    });
    catCache.set(cacheKey, list);
    return list;
  }

  // ---------- Избранное ----------
  const isFav = (key) => favorites.some((f) => f.key === key);

  function toggleFav(msg) {
    if (isFav(msg.key)) {
      favorites = favorites.filter((f) => f.key !== msg.key);
      toast(t('removed'));
    } else {
      favorites.unshift({ key: msg.key, text: msg.text, section: msg.section, cat: msg.cat, ts: Date.now() });
      toast(t('added'));
    }
    store.set(FAV_KEY, favorites);
    updateFavBadge();
    return isFav(msg.key);
  }

  function updateFavBadge() {
    favCount.hidden = favorites.length === 0;
    favCount.textContent = favorites.length > 99 ? '99+' : favorites.length;
  }

  // ---------- Копирование и отправка ----------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast(t('copied'));
  }

  const MESSENGERS = [
    { name: 'Telegram', cls: 'tg', url: (s) => 'https://t.me/share/url?url=' + encodeURIComponent(s) },
    { name: 'WhatsApp', cls: 'wa', url: (s) => 'https://wa.me/?text=' + encodeURIComponent(s) },
    { name: 'Viber', cls: 'vb', url: (s) => 'viber://forward?text=' + encodeURIComponent(s) }
  ];

  function shareText(text) {
    sheetActions.innerHTML = '';
    MESSENGERS.forEach((m) => {
      const a = document.createElement('a');
      a.className = 'btn sheet-btn ' + m.cls;
      a.href = m.url(text);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = m.name;
      a.addEventListener('click', closeSheet);
      sheetActions.appendChild(a);
    });
    if (navigator.share) {
      const b = document.createElement('button');
      b.className = 'btn sheet-btn other';
      b.textContent = t('otherApps');
      b.addEventListener('click', async () => {
        closeSheet();
        try { await navigator.share({ text }); } catch { /* отменено */ }
      });
      sheetActions.appendChild(b);
    }
    const c = document.createElement('button');
    c.className = 'btn sheet-btn copy';
    c.textContent = t('copy');
    c.addEventListener('click', () => { closeSheet(); copyText(text); });
    sheetActions.appendChild(c);

    $('#sheetTitle').textContent = t('sendTo');
    $('#sheetClose').textContent = t('cancel');
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
    sheetActions.firstElementChild?.focus();
  }

  function closeSheet() {
    sheet.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; }, 200);
  }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  $('#sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => { toastEl.hidden = true; }, 250);
    }, 1600);
  }

  // ---------- Отрисовка ----------
  function setHeader(title, backHref) {
    titleEl.textContent = title;
    document.title = title === t('appTitle') ? title : title + ' · ' + t('appTitle');
    backBtn.hidden = !backHref;
    backBtn.dataset.href = backHref || '';
    backBtn.setAttribute('aria-label', t('back'));
    favBtn.setAttribute('aria-label', t('favorites'));
    favBtn.classList.toggle('active', location.hash === '#/favorites');
    langBtn.textContent = t('langSwitch');
    langBtn.setAttribute('aria-label', t('langSwitchLabel'));
    document.documentElement.lang = lang;
  }

  backBtn.addEventListener('click', () => { location.hash = backBtn.dataset.href || '#/'; });

  function renderHome() {
    setHeader(t('appTitle'), null);
    app.innerHTML = `
      <p class="lead">${esc(t('chooseType'))}</p>
      <div class="type-grid">
        <a class="type-card short" href="#/short">
          <span class="type-icon" aria-hidden="true">✉️</span>
          <span class="type-name">${esc(t('short'))}</span>
          <span class="type-hint">${esc(t('shortHint'))}</span>
        </a>
        <a class="type-card long" href="#/long">
          <span class="type-icon" aria-hidden="true">📜</span>
          <span class="type-name">${esc(t('long'))}</span>
          <span class="type-hint">${esc(t('longHint'))}</span>
        </a>
      </div>
      <a class="row-link fav-row" href="#/favorites">
        <span class="row-icon" aria-hidden="true">${ICONS.heart}</span>
        <span class="row-text"><b>${esc(t('favorites'))}</b><small>${esc(t('favoritesHint'))}</small></span>
        <span class="row-count">${favorites.length || ''}</span>
        ${ICONS.chevron}
      </a>`;
  }

  async function renderCategories(section) {
    setHeader(t(section), '#/');
    await loadIndex();
    const cats = index[section] || [];
    app.innerHTML = `
      <h2 class="section-title">${esc(t('categories'))}</h2>
      <div class="cat-list">
        ${cats.map((c) => `
          <a class="row-link" href="#/${section}/${encodeURIComponent(c.id)}">
            <span class="row-emoji" aria-hidden="true">${esc(c.icon || '💬')}</span>
            <span class="row-text"><b>${esc(loc(c.title) || c.id)}</b></span>
            ${ICONS.chevron}
          </a>`).join('')}
      </div>`;
  }

  function messageCard(msg, { showSource = false } = {}) {
    const text = loc(msg.text);
    const liked = isFav(msg.key);
    const el = document.createElement('article');
    el.className = 'msg';
    let source = '';
    if (showSource && index) {
      const c = findCategory(msg.section, msg.cat);
      source = `<a class="msg-source" href="#/${msg.section}/${encodeURIComponent(msg.cat)}">${esc(t(msg.section))} · ${esc(c ? loc(c.title) : msg.cat)}</a>`;
    }
    el.innerHTML = `
      ${source}
      <p class="msg-text">${esc(text)}</p>
      <div class="msg-actions">
        <button class="act like ${liked ? 'on' : ''}" aria-pressed="${liked}" aria-label="${esc(liked ? t('unlike') : t('like'))}" title="${esc(liked ? t('unlike') : t('like'))}">${ICONS.heart}</button>
        <span class="spacer"></span>
        <button class="act copy">${ICONS.copy}<span>${esc(t('copy'))}</span></button>
        <button class="act share primary">${ICONS.share}<span>${esc(t('share'))}</span></button>
      </div>`;
    el.querySelector('.copy').addEventListener('click', () => copyText(text));
    el.querySelector('.share').addEventListener('click', () => shareText(text));
    el.querySelector('.like').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const on = toggleFav(msg);
      btn.classList.toggle('on', on);
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      btn.setAttribute('aria-pressed', on);
      btn.setAttribute('aria-label', on ? t('unlike') : t('like'));
      btn.title = on ? t('unlike') : t('like');
      if (location.hash === '#/favorites' && !on) {
        el.remove();
        if (!favorites.length) app.querySelector('.msg-list').innerHTML = `<p class="empty">${esc(t('emptyFav'))}</p>`;
        updateCount(favorites.length);
      }
    });
    return el;
  }

  function updateCount(n) {
    const c = app.querySelector('.count');
    if (c) c.textContent = t('count', n);
  }

  function renderList(list, emptyText, opts) {
    app.innerHTML = `
      <div class="toolbar">
        <label class="search">${ICONS.search}<input type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"></label>
        <span class="count">${esc(t('count', list.length))}</span>
      </div>
      <div class="msg-list"></div>`;
    const box = app.querySelector('.msg-list');
    const input = app.querySelector('input');
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const items = q ? list.filter((m) => loc(m.text).toLowerCase().includes(q)) : list;
      box.innerHTML = '';
      if (!items.length) {
        box.innerHTML = `<p class="empty">${esc(q ? t('notFound') : emptyText)}</p>`;
      } else {
        const frag = document.createDocumentFragment();
        items.forEach((m) => frag.appendChild(messageCard(m, opts)));
        box.appendChild(frag);
      }
      updateCount(items.length);
    };
    input.addEventListener('input', draw);
    draw();
  }

  async function renderMessages(section, catId) {
    await loadIndex();
    const cat = findCategory(section, catId);
    if (!cat) { location.hash = '#/' + section; return; }
    setHeader(loc(cat.title) || cat.id, '#/' + section);
    app.innerHTML = '<div class="loader" aria-hidden="true"></div>';
    const list = await loadCategory(section, catId);
    renderList(list || [], t('emptyCat'));
  }

  async function renderFavorites() {
    setHeader(t('favorites'), '#/');
    try { await loadIndex(); } catch { /* избранное работает и без сети */ }
    renderList(favorites.slice(), t('emptyFav'), { showSource: true });
  }

  // ---------- Роутер ----------
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    window.scrollTo(0, 0);
    try {
      if (parts[0] === 'favorites') await renderFavorites();
      else if (SECTIONS.includes(parts[0]) && parts[1]) await renderMessages(parts[0], parts[1]);
      else if (SECTIONS.includes(parts[0])) await renderCategories(parts[0]);
      else renderHome();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<p class="empty error">${esc(t('loadError'))}</p>`;
    }
  }

  langBtn.addEventListener('click', () => {
    lang = lang === 'ru' ? 'uk' : 'ru';
    store.set(LANG_KEY, lang);
    route();
  });

  window.addEventListener('hashchange', route);
  updateFavBadge();
  route();

  // ---------- PWA ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
