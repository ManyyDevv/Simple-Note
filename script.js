/* ════════════════════════════════════
   SimpleNote v4 — script.js
════════════════════════════════════ */

// ─── STATE ───────────────────────────
let notes   = [];
let folders = [];
let currentUser = null;
let theme   = localStorage.getItem('sn4_theme')  || 'dark';
let viewMode = localStorage.getItem('sn4_view')  || 'grid';
let sortBy   = localStorage.getItem('sn4_sort')  || 'date-desc';
let activeTag    = 'all';
let activeFolder = 'all';
let searchQ  = '';
let currentId = null;
let editingId = null;
let pendingUnlockId = null;
let selColor  = 'gold';
let folderColor = 'gold';
let savedRange = null; // for link insertion

let draftTimer   = null;
let autosaveTimer = null;
let toastTimer   = null;
let focusMode    = false;

const COLOR_HEX = {gold:'#e8c87a',rose:'#e07a7a',mint:'#7adbb8',sky:'#7aaee8',lavender:'#b07ae8',peach:'#e8a07a'};
const DAY_NAMES  = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

// ─── NEW FEATURES STATE ──────────────
let activity = JSON.parse(localStorage.getItem('sn4_activity') || '[]');
const TRASH_RETENTION_DAYS = 30;
const ACHIEVEMENTS = [
  {icon:'✍️', lbl:'Première note', test: s => s.total>=1},
  {icon:'📚', lbl:'10 notes créées', test: s => s.total>=10},
  {icon:'🏛️', lbl:'25 notes créées', test: s => s.total>=25},
  {icon:'🔥', lbl:'Série de 3 jours', test: s => s.streak>=3},
  {icon:'📁', lbl:'Bien organisé', test: s => s.folders>=3},
  {icon:'🏷️', lbl:'Maître des tags', test: s => s.tags>=5},
  {icon:'🔒', lbl:'Sécurisé', test: s => s.locked>=1},
  {icon:'📌', lbl:'Épingleur', test: s => s.pinned>=1},
  {icon:'✒️', lbl:'1000 mots écrits', test: s => s.words>=1000},
];

// ─── INIT ────────────────────────────
// (function init(){ ... })() a été remplacé plus bas par une version qui
// attend correctement que Firebase soit prêt (voir "whenFbReady").

// ════════════════════════════════════
//  ATTENTE DE FIREBASE (fbApi)
// ════════════════════════════════════
// firebase-init.js tourne dans un module séparé et peut mettre un peu de
// temps à se charger (téléchargement du SDK Firebase). Avant, script.js
// supposait que window.fbApi existait déjà au moment où il s'exécutait :
// si Firebase mettait ne serait-ce qu'un peu plus de temps que prévu (ou
// échouait à se charger : pas de connexion, bloqueur de pub, etc.),
// script.js plantait dès la ligne `window.fbApi.onAuthChange(...)` et
// TOUT le reste (affichage des notes, du dashboard, etc.) restait vide.
// `whenFbReady` corrige ça : on attend l'évènement "fbapi-ready" (déjà
// envoyé par firebase-init.js) avant de continuer, avec un message clair
// si ça ne répond vraiment pas.
function whenFbReady(cb){
  if(window.fbApi){ cb(); return; }
  const onReady = () => { window.removeEventListener('fbapi-ready', onReady); cb(); };
  window.addEventListener('fbapi-ready', onReady);
  setTimeout(() => {
    if(!window.fbApi){
      window.removeEventListener('fbapi-ready', onReady);
      document.getElementById('app-loading')?.classList.add('hidden');
      const box = document.getElementById('boot-error');
      if(box){
        box.textContent = "Impossible de contacter le serveur (Firebase). Vérifie ta connexion internet puis recharge la page.";
        box.classList.remove('hidden');
      }
    }
  }, 8000);
}

// Filet de sécurité : si une erreur inattendue survient ailleurs dans
// l'app, on l'affiche discrètement au lieu de laisser une page vide sans
// aucune explication.
window.addEventListener('error', (e) => {
  console.error('Erreur SimpleNote :', e.error || e.message);
  showToast('❌ Une erreur est survenue. Réessaie ou recharge la page.');
});

// ─── INIT ────────────────────────────
(function init(){
  applyTheme();
  bindSidebar();
  bindSearch();
  bindNav();
  bindEditor();
  bindSelBubble();
  bindColorPickers();
  bindToggle();
  bindViewToggle();
  bindFocusMode();
  bindKeyboard();
  bindSortSelect();

  bindAdmin();
  bindShare();
  bindReminders();
  bindAuthGate();
  bindLanding();

  whenFbReady(() => window.fbApi.onAuthChange(handleAuthChange));
})();

async function handleAuthChange(user){
  document.getElementById('app-loading')?.classList.add('hidden');
  const landing = document.getElementById('landing');
  const gate  = document.getElementById('auth-gate');
  const shell = document.getElementById('app-shell');

  if(user){
    currentUser = user;
    document.getElementById('current-user-email').textContent = user.email;
    landing.classList.add('hidden');
    gate.classList.add('hidden');
    shell.classList.remove('hidden');

    try{
      const [n, f] = await Promise.all([window.fbApi.fetchNotes(user.uid), window.fbApi.fetchFolders(user.uid)]);
      notes = n; folders = f;
    }catch(e){
      showToast('❌ Impossible de charger tes notes. Vérifie ta connexion internet.');
      notes = []; folders = [];
    }

    purgeOldTrash();
    renderNotes();
    renderDashboard();
    checkSharedLinkOnLoad();
    updateReminderBadge();
    setInterval(checkDueReminders, 60000);
    setTimeout(checkDueReminders, 1500);
  } else {
    currentUser = null;
    notes = []; folders = [];
    shell.classList.add('hidden');
    gate.classList.add('hidden');
    landing.classList.remove('hidden');
  }
}

// ════════════════════════════════════
//  PAGE D'ACCUEIL PUBLIQUE (landing)
// ════════════════════════════════════
function bindLanding(){
  document.querySelectorAll('.landing-start-btn').forEach(b => b.addEventListener('click', () => showAuthGate('signup')));
  document.getElementById('landing-login-btn').addEventListener('click', () => showAuthGate('signin'));
  document.getElementById('auth-back-btn').addEventListener('click', showLandingPage);
}
function showAuthGate(mode){
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('auth-gate').classList.remove('hidden');
  if(mode && mode!==authMode) document.getElementById('auth-toggle-mode').click();
  document.getElementById('auth-email').focus();
}
function showLandingPage(){
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

// ════════════════════════════════════
//  THEME
// ════════════════════════════════════
function applyTheme(){
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon-dark').style.display  = theme==='dark'  ? 'block' : 'none';
  document.getElementById('theme-icon-light').style.display = theme==='light' ? 'block' : 'none';
}
function bindSidebar(){
  document.getElementById('theme-btn').onclick = () => {
    theme = theme==='dark' ? 'light' : 'dark';
    localStorage.setItem('sn4_theme', theme);
    applyTheme();
  };
  document.getElementById('hamburger').onclick = toggleSidebar;
  document.getElementById('add-folder-btn').onclick = openFolderModal;
}

// ════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════
function bindNav(){
  document.querySelectorAll('.nav-item, .topnav-tab').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.page));
  });
}
function goToPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item, .topnav-tab').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-'+name);
  if(!page) return;
  page.classList.remove('hidden');
  document.querySelectorAll(`[data-page="${name}"]`).forEach(b => b.classList.add('active'));
  if(name==='home')      renderNotes();
  if(name==='stats')     renderStats();
  if(name==='folders')   renderFolders();
  if(name==='dashboard') renderDashboard();
  if(name==='reminders') renderReminders();
  if(name==='trash')     renderTrash();
  if(name==='challenge') renderChallenge();
  if(name==='shared')    renderShared();
  if(name==='create' && !editingId) resetForm();
  closeSidebar();
}

// ════════════════════════════════════
//  SEARCH
// ════════════════════════════════════
function bindSearch(){
  const inp = document.getElementById('search-input');
  const clr = document.getElementById('search-clear');
  inp.addEventListener('input', () => {
    searchQ = inp.value.trim().toLowerCase();
    clr.classList.toggle('hidden', !searchQ);
    renderNotes();
  });
  clr.addEventListener('click', () => {
    inp.value = ''; searchQ = '';
    clr.classList.add('hidden');
    renderNotes();
  });
}

// ════════════════════════════════════
//  SORT
// ════════════════════════════════════
function bindSortSelect(){
  const sel = document.getElementById('sort-select');
  sel.value = sortBy;
  sel.addEventListener('change', () => {
    sortBy = sel.value;
    localStorage.setItem('sn4_sort', sortBy);
    renderNotes();
  });
}

// ════════════════════════════════════
//  VIEW TOGGLE
// ════════════════════════════════════
function bindViewToggle(){
  document.getElementById('btn-grid').onclick = () => setView('grid');
  document.getElementById('btn-list').onclick = () => setView('list');
  setView(viewMode, false);
}
function setView(mode, save=true){
  viewMode = mode;
  if(save) localStorage.setItem('sn4_view', mode);
  const c = document.getElementById('notes-container');
  c.classList.toggle('list-view', mode==='list');
  document.getElementById('btn-grid').classList.toggle('active', mode==='grid');
  document.getElementById('btn-list').classList.toggle('active', mode==='list');
}

// ════════════════════════════════════
//  FOCUS MODE
// ════════════════════════════════════
function bindFocusMode(){
  document.getElementById('focus-btn').onclick = toggleFocusMode;
}
function toggleFocusMode(){
  focusMode = !focusMode;
  document.body.classList.toggle('focus-mode', focusMode);
  const btn = document.getElementById('focus-btn');
  btn.title = focusMode ? 'Quitter le mode focus (F)' : 'Mode focus (F)';
  btn.style.color = focusMode ? 'var(--accent)' : '';
}

// ════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ════════════════════════════════════
function bindKeyboard(){
  document.addEventListener('keydown', e => {
    const inEditor = document.activeElement === document.getElementById('editor');
    const inInput  = ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);

    // Ctrl+N — nouvelle note
    if((e.ctrlKey||e.metaKey) && e.key==='n'){ e.preventDefault(); goToPage('create'); return; }
    // Escape — retour
    if(e.key==='Escape'){
      if(!document.getElementById('page-detail').classList.contains('hidden')) goToPage('home');
      if(focusMode) toggleFocusMode();
      closeAllModals();
      return;
    }
    // F — focus mode (pas dans un champ)
    if(e.key==='f' && !inInput && !inEditor && !document.getElementById('page-create').classList.contains('hidden'))
      toggleFocusMode();
    // T — thème
    if(e.key==='t' && !inInput && !inEditor){
      theme = theme==='dark' ? 'light' : 'dark';
      localStorage.setItem('sn4_theme', theme);
      applyTheme();
    }
  });
}

// ════════════════════════════════════
//  EDITOR — TOOLBAR & COMMANDS
// ════════════════════════════════════
function bindEditor(){
  const editor = document.getElementById('editor');

  // Toolbar buttons
  document.querySelectorAll('.tb').forEach(btn => {
    btn.addEventListener('mousedown', e => { e.preventDefault(); execCmd(btn.dataset.cmd); });
  });

  // Keyboard shortcuts inside editor
  editor.addEventListener('keydown', e => {
    if(e.ctrlKey || e.metaKey){
      if(e.key==='b'){ e.preventDefault(); execCmd('bold'); }
      if(e.key==='i'){ e.preventDefault(); execCmd('italic'); }
      if(e.key==='u'){ e.preventDefault(); execCmd('underline'); }
      if(e.key==='z' && !e.shiftKey){ /* default */ }
      if(e.key==='y' || (e.key==='z' && e.shiftKey)){ /* default */ }
    }
    // Tab → indent
    if(e.key==='Tab'){ e.preventDefault(); document.execCommand('insertHTML',false,'&nbsp;&nbsp;&nbsp;&nbsp;'); }
  });

  // Word count & draft autosave
  editor.addEventListener('input', () => {
    updateWordCount();
    triggerDraftSave();
    updateToolbarState();
  });
  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('mouseup', updateToolbarState);
  editor.addEventListener('focus', updateToolbarState);

  // Update draft indicator
  function triggerDraftSave(){
    clearTimeout(draftTimer);
    document.getElementById('draft-pill').classList.remove('hidden');
    draftTimer = setTimeout(() => {
      saveDraft();
      showAutosave();
    }, 4000);
  }

  // Load draft on open
  loadDraft();
}

function execCmd(cmd){
  const editor = document.getElementById('editor');
  editor.focus();
  switch(cmd){
    case 'h1': wrapBlock('h1'); break;
    case 'h2': wrapBlock('h2'); break;
    case 'h3': wrapBlock('h3'); break;
    case 'blockquote': wrapBlock('blockquote'); break;
    case 'code': wrapInlineCode(); break;
    case 'hr':  insertHR(); break;
    case 'createLink': openLinkModal(); break;
    case 'checklist': insertChecklistItem(); break;
    default: document.execCommand(cmd, false, null);
  }
  updateToolbarState();
  editor.focus();
}

function wrapBlock(tag){
  const sel = window.getSelection();
  if(!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const el = document.createElement(tag);
  try{
    range.surroundContents(el);
  } catch(e){
    el.innerHTML = range.extractContents().textContent || '&nbsp;';
    range.insertNode(el);
  }
  range.selectNodeContents(el);
  sel.removeAllRanges(); sel.addRange(range);
}

function wrapInlineCode(){
  const sel = window.getSelection();
  if(!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const el = document.createElement('code');
  try{
    range.surroundContents(el);
  } catch(e){
    el.textContent = range.toString() || 'code';
    range.deleteContents(); range.insertNode(el);
  }
}

function insertHR(){
  document.execCommand('insertHTML', false, '<hr/>');
}

// Toolbar state (bold/italic active indicator)
function updateToolbarState(){
  const cmds = ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'];
  cmds.forEach(cmd => {
    const btn = document.querySelector(`.tb[data-cmd="${cmd}"]`);
    if(btn) btn.classList.toggle('active-fmt', document.queryCommandState(cmd));
  });
  updateWordCount();
}

function updateWordCount(){
  const editor = document.getElementById('editor');
  const text = editor.innerText || '';
  const words = countWords(text);
  const mins  = Math.ceil(words/200);
  document.getElementById('tb-words').textContent = words + ' mot'+(words!==1?'s':'');
  document.getElementById('tb-time').textContent  = '~'+mins+' min';
}

// ════════════════════════════════════
//  SELECTION BUBBLE
// ════════════════════════════════════
function bindSelBubble(){
  const bubble = document.getElementById('sel-bubble');
  const editor = document.getElementById('editor');

  document.addEventListener('mouseup', e => {
    const sel = window.getSelection();
    if(sel && sel.toString().trim().length > 0 && editor.contains(sel.anchorNode)){
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      bubble.style.top  = (rect.top + window.scrollY - 46) + 'px';
      bubble.style.left = (rect.left + rect.width/2 - 80) + 'px';
      bubble.classList.remove('hidden');
    } else {
      if(!bubble.contains(e.target)) bubble.classList.add('hidden');
    }
  });

  bubble.querySelectorAll('button[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      execCmd(btn.dataset.cmd);
      bubble.classList.add('hidden');
    });
  });

  document.addEventListener('keydown', () => bubble.classList.add('hidden'));
}

// ════════════════════════════════════
//  LINK MODAL
// ════════════════════════════════════
function openLinkModal(){
  // save selection before modal steals focus
  const sel = window.getSelection();
  if(sel.rangeCount) {
    savedRange = sel.getRangeAt(0).cloneRange();
    document.getElementById('link-text').value = sel.toString();
  }
  document.getElementById('link-url').value = '';
  openModal('modal-link');
}
function insertLink(){
  const text = document.getElementById('link-text').value.trim();
  const url  = document.getElementById('link-url').value.trim();
  if(!url){ closeModal('modal-link'); return; }
  const editor = document.getElementById('editor');
  editor.focus();
  if(savedRange){
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(savedRange);
  }
  const a = document.createElement('a');
  a.href = url; a.textContent = text || url; a.target = '_blank';
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents(); range.insertNode(a);
  savedRange = null;
  closeModal('modal-link');
}

// ════════════════════════════════════
//  DRAFT AUTOSAVE
// ════════════════════════════════════
function saveDraft(){
  const data = getFormData();
  localStorage.setItem('sn4_draft', JSON.stringify(data));
}
function loadDraft(){
  const d = localStorage.getItem('sn4_draft');
  if(!d) return;
  const data = JSON.parse(d);
  if(!data.content && !data.title) return;
  // Don't load if editing an existing note
  if(editingId) return;
  applyFormData(data);
  document.getElementById('draft-pill').classList.remove('hidden');
}
function clearDraft(){ localStorage.removeItem('sn4_draft'); }
function showAutosave(){
  const b = document.getElementById('autosave-badge');
  b.classList.remove('hidden');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => b.classList.add('hidden'), 2500);
}

// ════════════════════════════════════
//  COLOR PICKERS
// ════════════════════════════════════
function bindColorPickers(){
  // Note color picker
  document.querySelectorAll('#f-colors .cdot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#f-colors .cdot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selColor = btn.dataset.c;
    });
  });
  // Folder color picker
  document.querySelectorAll('#folder-colors .cdot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#folder-colors .cdot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      folderColor = btn.dataset.c;
    });
  });
}

// ════════════════════════════════════
//  TOGGLE (password)
// ════════════════════════════════════
function bindToggle(){
  const chk = document.getElementById('f-lock');
  const wrap = document.getElementById('f-pw-wrap');
  chk.addEventListener('change', () => wrap.classList.toggle('hidden', !chk.checked));

  // Tags live preview
  document.getElementById('f-tags').addEventListener('input', updateTagsPreview);
  // Char counters
  document.getElementById('f-title').addEventListener('input', () => {
    const v = document.getElementById('f-title').value;
    document.getElementById('f-title-count').textContent = v.length+'/80';
  });
  document.getElementById('f-desc').addEventListener('input', () => {
    const v = document.getElementById('f-desc').value;
    document.getElementById('f-desc-count').textContent = v.length+'/160';
  });
}
function updateTagsPreview(){
  const raw = document.getElementById('f-tags').value;
  const tags = parseTags(raw);
  const prev = document.getElementById('f-tags-preview');
  prev.innerHTML = tags.map(t => `<span class="ntag" style="--tc:${tagColor(t)}">${esc(t)}</span>`).join('');
}

// ════════════════════════════════════
//  RENDER NOTES
// ════════════════════════════════════
function renderNotes(){
  renderSbFolders();
  renderSbTags();
  updateFolderSelect();

  const container = document.getElementById('notes-container');
  const emptyEl   = document.getElementById('empty-state');
  const activeNotes = notes.filter(n => !n.deletedAt);
  document.getElementById('note-count').textContent = activeNotes.length + ' note'+(activeNotes.length!==1?'s':'');

  container.querySelectorAll('.ncard').forEach(c => c.remove());

  let filtered = activeNotes.filter(n => {
    if(activeTag !== 'all' && !(n.tags||[]).includes(activeTag)) return false;
    if(activeFolder !== 'all'){
      if(activeFolder === '__none__') { if(n.folderId) return false; }
      else { if(n.folderId !== activeFolder) return false; }
    }
    if(searchQ){
      const hay = [n.title, n.description, n.author, ...(n.tags||[])].join(' ').toLowerCase();
      if(!hay.includes(searchQ)) return false;
    }
    return true;
  });

  filtered = sortNotes(filtered);

  emptyEl.style.display = filtered.length ? 'none' : 'flex';

  filtered.forEach((note, i) => {
    const card = buildCard(note, i);
    container.appendChild(card);
  });

  // Update heading
  const ht = document.getElementById('home-title');
  const hs = document.getElementById('home-sub');
  if(searchQ){
    ht.textContent = `"${searchQ}"`;
    hs.textContent = filtered.length + ' résultat'+(filtered.length!==1?'s':'');
  } else if(activeFolder !== 'all'){
    const f = folders.find(f => f.id===activeFolder);
    ht.textContent = f ? f.name : 'Notes sans dossier';
    hs.textContent = filtered.length + ' note'+(filtered.length!==1?'s':'');
  } else if(activeTag !== 'all'){
    ht.textContent = '#'+activeTag;
    hs.textContent = filtered.length + ' note'+(filtered.length!==1?'s':'');
  } else {
    ht.textContent = 'Toutes les notes';
    hs.textContent = 'Retrouvez toutes vos idées.';
  }
}

function sortNotes(arr){
  return [...arr].sort((a,b) => {
    if(sortBy==='pinned'){
      if(a.pinned && !b.pinned) return -1;
      if(!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    if(sortBy==='date-asc')  return new Date(a.createdAt) - new Date(b.createdAt);
    if(sortBy==='title-asc') return a.title.localeCompare(b.title,'fr');
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function buildCard(note, i){
  const hex = COLOR_HEX[note.color] || COLOR_HEX.gold;
  const div = document.createElement('div');
  div.className = 'ncard'+(note.pinned?' pinned':'');
  div.style.cssText = `--card-c:${hex};animation-delay:${i*.04}s`;

  const tagsHtml = (note.tags||[]).slice(0,4).map(t =>
    `<span class="ntag" style="--tc:${tagColor(t)}">${hlSearch(esc(t))}</span>`
  ).join('');

  const folder = note.folderId ? folders.find(f => f.id===note.folderId) : null;

  div.innerHTML = `
    <div class="ncard-top">
      <div class="ncard-title">${hlSearch(esc(note.title))}</div>
      ${note.pinned ? '<span class="ncard-pin">📌</span>' : ''}
    </div>
    <div class="ncard-desc">${hlSearch(esc(note.description))}</div>
    ${tagsHtml ? `<div class="ncard-tags">${tagsHtml}</div>` : ''}
    <div class="ncard-foot">
      <span class="ncard-author">@${esc(note.author)}</span>
      <span>${folder ? '📁 '+esc(folder.name)+' · ' : ''}${fmtDate(note.createdAt)}</span>
    </div>
  `;
  div.addEventListener('click', () => openNote(note.id));
  return div;
}

// ════════════════════════════════════
//  SIDEBAR FOLDERS & TAGS
// ════════════════════════════════════
function renderSbFolders(){
  const el = document.getElementById('sb-folders');
  el.innerHTML = '';

  // "All" entry
  const all = document.createElement('button');
  all.className = 'sb-folder-item'+(activeFolder==='all'?' active':'');
  all.innerHTML = `<span class="sb-folder-dot" style="background:var(--muted)"></span>Toutes`;
  all.onclick = () => { activeFolder='all'; renderNotes(); goToPage('home'); };
  el.appendChild(all);

  folders.forEach(f => {
    const b = document.createElement('button');
    b.className = 'sb-folder-item'+(activeFolder===f.id?' active':'');
    b.innerHTML = `<span class="sb-folder-dot" style="background:${COLOR_HEX[f.color]||COLOR_HEX.gold}"></span>${esc(f.name)}`;
    b.onclick = () => { activeFolder=f.id; renderNotes(); goToPage('home'); };
    el.appendChild(b);
  });
}

function renderSbTags(){
  const el = document.getElementById('sb-tags');
  const allTags = new Set();
  notes.filter(n => !n.deletedAt).forEach(n => (n.tags||[]).forEach(t => allTags.add(t)));
  el.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'sb-tag'+(activeTag==='all'?' active':'');
  allBtn.textContent = 'Tout';
  allBtn.onclick = () => { activeTag='all'; renderNotes(); };
  el.appendChild(allBtn);

  allTags.forEach(tag => {
    const b = document.createElement('button');
    b.className = 'sb-tag'+(activeTag===tag?' active':'');
    b.textContent = tag;
    b.style.setProperty('--tc', tagColor(tag));
    b.onclick = () => { activeTag=tag; renderNotes(); };
    el.appendChild(b);
  });
}

function updateFolderSelect(){
  const sel = document.getElementById('f-folder');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Aucun —</option>';
  folders.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    sel.appendChild(o);
  });
  sel.value = cur;
}

// ════════════════════════════════════
//  OPEN NOTE
// ════════════════════════════════════
function openNote(id){
  const note = notes.find(n => n.id===id);
  if(!note) return;

  if(note.locked){
    pendingUnlockId = id;
    document.getElementById('unlock-pw').value = '';
    document.getElementById('pw-error').classList.add('hidden');
    openModal('modal-pw');
    return;
  }

  currentId = id;
  const hex = COLOR_HEX[note.color] || COLOR_HEX.gold;
  const card = document.getElementById('detail-card');
  card.style.setProperty('--card-c', hex);
  card.style.borderTopColor = hex;

  document.getElementById('d-author').textContent = '@'+note.author;
  document.getElementById('d-date').textContent   = fmtDate(note.createdAt);
  const wc = countWords(stripTags(note.content||''));
  document.getElementById('d-words').textContent  = wc+' mot'+(wc!==1?'s':'');
  document.getElementById('d-time').textContent   = '~'+Math.ceil(wc/200)+' min';

  const folder = note.folderId ? folders.find(f => f.id===note.folderId) : null;
  const fb = document.getElementById('d-folder-badge');
  fb.textContent = folder ? '📁 '+folder.name : '';
  fb.style.display = folder ? '' : 'none';

  document.getElementById('d-tags').innerHTML = (note.tags||[]).map(t =>
    `<span class="ntag" style="--tc:${tagColor(t)}">${esc(t)}</span>`
  ).join('');

  document.getElementById('d-title').textContent = note.title;
  document.getElementById('d-desc').textContent  = note.description;

  document.getElementById('d-content-render').innerHTML = note.content || '';
  document.getElementById('d-content-source').textContent = note.content || '';
  bindChecklistToggles();

  // Reset tabs
  switchContentTab('render');

  // Pin button
  const pinBtn = document.getElementById('pin-btn');
  document.getElementById('pin-label').textContent = note.pinned ? 'Désépingler' : 'Épingler';
  pinBtn.classList.toggle('active-pin', !!note.pinned);

  // Reset copy
  const copyBtn = document.getElementById('copy-btn');
  copyBtn.classList.remove('copied');
  copyBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Copier`;

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-detail').classList.remove('hidden');
}

// ════════════════════════════════════
//  CONTENT TABS (render / source)
// ════════════════════════════════════
function switchContentTab(tab){
  document.querySelectorAll('.ctab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  document.getElementById('d-content-render').classList.toggle('hidden', tab!=='render');
  document.getElementById('d-content-source').classList.toggle('hidden', tab!=='source');
}
document.querySelectorAll('.ctab').forEach(b => {
  b.addEventListener('click', () => switchContentTab(b.dataset.tab));
});

// ════════════════════════════════════
//  CREATE / EDIT
// ════════════════════════════════════
function getFormData(){
  return {
    title:   document.getElementById('f-title').value.trim(),
    author:  document.getElementById('f-author').value.trim(),
    desc:    document.getElementById('f-desc').value.trim(),
    tags:    parseTags(document.getElementById('f-tags').value),
    folder:  document.getElementById('f-folder').value,
    color:   selColor,
    content: document.getElementById('editor').innerHTML,
    locked:  document.getElementById('f-lock').checked,
    pw:      document.getElementById('f-pw').value,
    reminder: document.getElementById('f-reminder').value || null,
  };
}

function applyFormData(data){
  document.getElementById('f-title').value  = data.title  || '';
  document.getElementById('f-author').value = data.author || '';
  document.getElementById('f-desc').value   = data.desc   || '';
  document.getElementById('f-tags').value   = (data.tags||[]).join(', ');
  document.getElementById('editor').innerHTML = data.content || '';
  document.getElementById('f-reminder').value = data.reminder || '';
  if(data.color){
    selColor = data.color;
    document.querySelectorAll('#f-colors .cdot').forEach(b => b.classList.toggle('active', b.dataset.c===selColor));
  }
  updateTagsPreview();
  updateWordCount();
  document.getElementById('f-title-count').textContent = (data.title||'').length+'/80';
  document.getElementById('f-desc-count').textContent  = (data.desc||'').length+'/160';
}

function submitNote(){
  const d = getFormData();
  const err = document.getElementById('form-error');
  if(!d.title || !d.author || !d.desc || !d.content.replace(/<[^>]*>/g,'').trim()){
    err.classList.remove('hidden'); return;
  }
  err.classList.add('hidden');

  if(editingId){
    const idx = notes.findIndex(n => n.id===editingId);
    if(idx!==-1){
      // Save history (keep last 5 versions)
      const history = notes[idx].history || [];
      history.unshift({ content: notes[idx].content, savedAt: new Date().toISOString() });
      if(history.length > 5) history.pop();
      notes[idx] = {
        ...notes[idx],
        title:d.title, description:d.desc, author:d.author,
        content:d.content, tags:d.tags, color:d.color,
        folderId:d.folder||null, locked:d.locked, pw:d.locked?d.pw:null,
        reminderAt:d.reminder||null, reminderNotified:false,
        updatedAt:new Date().toISOString(), history,
      };
    }
    saveNotes(); showToast('✓ Note modifiée');
    logActivity('Note modifiée', d.title);
    const id = editingId; editingId = null;
    resetForm(); clearDraft();
    openNote(id);
    updateReminderBadge();
  } else {
    const note = {
      id:genId(), title:d.title, description:d.desc, author:d.author,
      content:d.content, tags:d.tags, color:d.color,
      folderId:d.folder||null, locked:d.locked, pw:d.locked?d.pw:null,
      reminderAt:d.reminder||null, reminderNotified:false,
      pinned:false, createdAt:new Date().toISOString(), history:[], deletedAt:null,
    };
    notes.unshift(note);
    saveNotes(); showToast('✓ Note créée !'); clearDraft();
    logActivity('Note créée', note.title);
    resetForm(); openNote(note.id);
    updateReminderBadge();
  }
}

function editCurrentNote(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  editingId = note.id;
  document.getElementById('form-title').textContent = 'Modifier la note';
  document.getElementById('submit-btn').innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Sauvegarder`;
  applyFormData({
    title: note.title, author: note.author, desc: note.description,
    tags: note.tags, content: note.content, color: note.color,
  });
  document.getElementById('f-folder').value = note.folderId || '';
  document.getElementById('f-reminder').value = note.reminderAt || '';
  document.getElementById('f-lock').checked = !!note.locked;
  document.getElementById('f-pw-wrap').classList.toggle('hidden', !note.locked);
  document.getElementById('f-pw').value = note.pw || '';
  updateFolderSelect();
  goToPage('create');
}

function cancelForm(){
  editingId ? openNote(editingId) : goToPage('home');
  editingId = null;
  resetForm();
}

function resetForm(){
  document.getElementById('form-title').textContent = 'Nouvelle note';
  document.getElementById('submit-btn').innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Enregistrer`;
  ['f-title','f-author','f-desc','f-tags','f-pw','f-reminder'].forEach(id => document.getElementById(id).value='');
  document.getElementById('editor').innerHTML = '';
  document.getElementById('f-lock').checked = false;
  document.getElementById('f-pw-wrap').classList.add('hidden');
  document.getElementById('f-folder').value = '';
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('draft-pill').classList.add('hidden');
  document.getElementById('f-tags-preview').innerHTML = '';
  document.getElementById('f-title-count').textContent = '0/80';
  document.getElementById('f-desc-count').textContent  = '0/160';
  document.getElementById('tb-words').textContent = '0 mot';
  document.getElementById('tb-time').textContent  = '~0 min';
  selColor = 'gold';
  document.querySelectorAll('#f-colors .cdot').forEach(b => b.classList.toggle('active', b.dataset.c==='gold'));
  updateFolderSelect();
}

// ════════════════════════════════════
//  DELETE
// ════════════════════════════════════
function deleteCurrentNote(){
  if(!currentId || !confirm('Déplacer cette note vers la corbeille ?')) return;
  const note = notes.find(n => n.id===currentId);
  if(note){
    note.deletedAt = new Date().toISOString();
    saveNotes();
    logActivity('Note déplacée vers la corbeille', note.title);
  }
  currentId = null;
  showToast('🗑 Note déplacée vers la corbeille'); goToPage('home');
}

// ════════════════════════════════════
//  PIN
// ════════════════════════════════════
function togglePin(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  note.pinned = !note.pinned; saveNotes();
  document.getElementById('pin-label').textContent = note.pinned ? 'Désépingler' : 'Épingler';
  document.getElementById('pin-btn').classList.toggle('active-pin', note.pinned);
  showToast(note.pinned ? '📌 Épinglée' : '↩ Désépinglée');
}

// ════════════════════════════════════
//  COPY
// ════════════════════════════════════
function copyContent(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  const text = stripTags(note.content||'');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 4 7-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copié !`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Copier`;
    }, 2200);
  });
}

// ════════════════════════════════════
//  EXPORT
// ════════════════════════════════════
function exportNote(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  const txt = [
    '═══════════════════════════',
    '  SimpleNote — Export',
    '═══════════════════════════',
    '', 'Titre       : '+note.title,
    'Auteur      : @'+note.author,
    'Description : '+note.description,
    'Tags        : '+(note.tags||[]).join(', '),
    'Date        : '+fmtDate(note.createdAt),
    '', '───────────────────────────','',
    stripTags(note.content||''),
  ].join('\n');
  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const a = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob), download: note.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.txt'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('⬇ Exportée en .txt');
}

// ════════════════════════════════════
//  PASSWORD LOCK
// ════════════════════════════════════
function unlockNote(){
  const note = notes.find(n => n.id===pendingUnlockId);
  if(!note) return;
  const pw = document.getElementById('unlock-pw').value;
  if(pw !== note.pw){
    document.getElementById('pw-error').classList.remove('hidden'); return;
  }
  closeModal('modal-pw');
  const id = pendingUnlockId; pendingUnlockId = null;
  currentId = id;
  const idx = notes.findIndex(n => n.id===id);
  if(idx!==-1){
    const tmp = {...notes[idx], locked:false};
    currentId = id;
    // Temporarily show without lock
    const saved = notes[idx].locked;
    notes[idx].locked = false;
    openNote(id);
    notes[idx].locked = saved;
  }
}

// ════════════════════════════════════
//  HISTORY
// ════════════════════════════════════
function showHistory(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  const list = document.getElementById('history-list');
  const hist = note.history || [];
  if(!hist.length){
    list.innerHTML = '<p style="color:var(--muted);font-size:14px;padding:12px 0">Aucun historique disponible. Les versions précédentes apparaissent ici après modification.</p>';
  } else {
    list.innerHTML = hist.map((v,i) => `
      <div class="history-item">
        <div class="history-meta">
          <span class="history-date">Version ${hist.length-i} — ${fmtDateTime(v.savedAt)}</span>
          <button class="history-restore" onclick="restoreVersion(${i})">Restaurer</button>
        </div>
        <div class="history-preview">${stripTags(v.content||'').slice(0,180)}…</div>
      </div>
    `).join('');
  }
  openModal('modal-history');
}
function restoreVersion(idx){
  const note = notes.find(n => n.id===currentId);
  if(!note || !note.history[idx]) return;
  if(!confirm('Restaurer cette version ? Le contenu actuel sera sauvegardé dans l\'historique.')) return;
  const history = note.history || [];
  history.unshift({content:note.content, savedAt:new Date().toISOString()});
  note.content = note.history[idx+1]?.content ?? note.history[idx].content;
  note.history = history.slice(0,5);
  saveNotes(); closeModal('modal-history');
  openNote(currentId); showToast('↩ Version restaurée');
}

// ════════════════════════════════════
//  FOLDERS
// ════════════════════════════════════
function openFolderModal(){
  document.getElementById('folder-name').value = '';
  document.getElementById('modal-folder-title').textContent = 'Nouveau dossier';
  folderColor = 'gold';
  document.querySelectorAll('#folder-colors .cdot').forEach(b => b.classList.toggle('active', b.dataset.c==='gold'));
  openModal('modal-folder');
}
function saveFolder(){
  const name = document.getElementById('folder-name').value.trim();
  if(!name){ document.getElementById('folder-name').focus(); return; }
  folders.push({id:genId(), name, color:folderColor});
  saveFolders(); closeModal('modal-folder');
  renderFolders(); renderSbFolders(); updateFolderSelect();
  showToast('📁 Dossier créé');
}
function deleteFolder(id){
  if(!confirm('Supprimer ce dossier ? Les notes ne seront pas supprimées.')) return;
  folders = folders.filter(f => f.id!==id);
  notes.forEach(n => { if(n.folderId===id) n.folderId=null; });
  saveFolders(); saveNotes();
  renderFolders(); renderSbFolders(); showToast('🗑 Dossier supprimé');
}
function renderFolders(){
  const grid = document.getElementById('folders-grid');
  grid.innerHTML = '';
  if(!folders.length){
    grid.innerHTML = '<p style="color:var(--muted);font-size:14px">Aucun dossier. Créez-en un pour organiser vos notes.</p>'; return;
  }
  folders.forEach(f => {
    const cnt = notes.filter(n => n.folderId===f.id && !n.deletedAt).length;
    const hex = COLOR_HEX[f.color]||COLOR_HEX.gold;
    const div = document.createElement('div');
    div.className = 'folder-card';
    div.style.cssText = `--fc:${hex}`;
    div.innerHTML = `
      <div class="folder-icon">📁</div>
      <div class="folder-name">${esc(f.name)}</div>
      <div class="folder-count">${cnt} note${cnt!==1?'s':''}</div>
      <div class="folder-actions">
        <button onclick="event.stopPropagation();activeFolder='${f.id}';renderNotes();goToPage('home')">Voir les notes</button>
        <button class="del-folder" onclick="event.stopPropagation();deleteFolder('${f.id}')">Supprimer</button>
      </div>
    `;
    div.addEventListener('click', () => { activeFolder=f.id; renderNotes(); goToPage('home'); });
    grid.appendChild(div);
  });
}

// ════════════════════════════════════
//  STATS
// ════════════════════════════════════
function renderStats(){
  const activeNotes = notes.filter(n => !n.deletedAt);
  const totalN   = activeNotes.length;
  const totalW   = activeNotes.reduce((s,n) => s+countWords(stripTags(n.content||'')), 0);
  const authors  = new Set(activeNotes.map(n => n.author)).size;
  const pinned   = activeNotes.filter(n => n.pinned).length;
  const locked   = activeNotes.filter(n => n.locked).length;
  const withTags = activeNotes.filter(n => (n.tags||[]).length).length;
  const avgW     = totalN ? Math.round(totalW/totalN) : 0;
  const inFolders = activeNotes.filter(n => n.folderId).length;

  const sc = document.getElementById('stats-cards');
  sc.innerHTML = [
    {val:totalN,        lbl:'Notes'},
    {val:totalW.toLocaleString('fr'), lbl:'Mots écrits'},
    {val:authors,       lbl:'Auteurs'},
    {val:pinned,        lbl:'Épinglées'},
    {val:locked,        lbl:'Protégées 🔒'},
    {val:avgW,          lbl:'Mots moy./note'},
    {val:inFolders,     lbl:'Dans un dossier'},
    {val:withTags,      lbl:'Avec tags'},
  ].map((s,i) => `
    <div class="stat-card" style="animation-delay:${i*.05}s">
      <div class="stat-val">${s.val}</div>
      <div class="stat-lbl">${s.lbl}</div>
    </div>
  `).join('');

  // Tag chart
  const tc = {};
  activeNotes.forEach(n => (n.tags||[]).forEach(t => tc[t]=(tc[t]||0)+1));
  const tags = Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxT = tags[0]?.[1]||1;
  document.getElementById('chart-tags').innerHTML = tags.length ? tags.map(([t,c]) => `
    <div class="bar-row">
      <span class="bar-lbl" title="${esc(t)}">${esc(t)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/maxT*100)}%;background:${tagColor(t)}"></div></div>
      <span class="bar-n">${c}</span>
    </div>
  `).join('') : '<p style="color:var(--muted);font-size:13px">Aucun tag utilisé.</p>';

  // Activity chart
  const now = new Date();
  const counts = Array(7).fill(0);
  activeNotes.forEach(n => {
    const diff = Math.floor((now - new Date(n.createdAt))/86400000);
    if(diff>=0 && diff<7) counts[6-diff]++;
  });
  const maxC = Math.max(...counts,1);
  const today = now.getDay();
  document.getElementById('chart-activity').innerHTML = counts.map((c,i) => {
    const dayIdx = (today-(6-i)+7)%7;
    const lbl = DAY_NAMES[(dayIdx+6)%7];
    const h = Math.round(c/maxC*56);
    return `
      <div class="act-col">
        <div class="act-bar" style="height:${Math.max(h,2)}px" data-n="${c} note${c!==1?'s':''}"></div>
        <span class="act-day">${lbl}</span>
      </div>
    `;
  }).join('');
}

// ════════════════════════════════════
//  MODALS
// ════════════════════════════════════
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
function closeAllModals(){
  document.querySelectorAll('.modal-bg').forEach(m => m.classList.add('hidden'));
}
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => { if(e.target===bg) bg.classList.add('hidden'); });
});

// ════════════════════════════════════
//  MOBILE SIDEBAR
// ════════════════════════════════════
function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('hidden', !open);
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.add('hidden');
}

// ════════════════════════════════════
//  TOAST
// ════════════════════════════════════
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ════════════════════════════════════
//  PERSIST (Firestore, par compte)
// ════════════════════════════════════
let notesSyncTimer = null, foldersSyncTimer = null;
function saveNotes(){
  const badge = document.getElementById('autosave-badge');
  if(!currentUser || !window.fbApi) return;
  clearTimeout(notesSyncTimer);
  notesSyncTimer = setTimeout(() => {
    window.fbApi.syncNotes(currentUser.uid, notes)
      .then(() => { badge.classList.remove('hidden'); setTimeout(()=>badge.classList.add('hidden'), 1500); })
      .catch(() => showToast('❌ Erreur de synchronisation'));
  }, 400);
}
function saveFolders(){
  if(!currentUser || !window.fbApi) return;
  clearTimeout(foldersSyncTimer);
  foldersSyncTimer = setTimeout(() => {
    window.fbApi.syncFolders(currentUser.uid, folders).catch(() => showToast('❌ Erreur de synchronisation'));
  }, 400);
}

// ════════════════════════════════════
//  HELPERS
// ════════════════════════════════════
function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function fmtDate(iso){ return new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtDateTime(iso){ return new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function countWords(s){ return s.trim().split(/\s+/).filter(Boolean).length; }
function stripTags(html){ return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function parseTags(s){ return s.split(',').map(t=>t.trim()).filter(Boolean); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function hlSearch(str){
  if(!searchQ) return str;
  const re = new RegExp('('+searchQ.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return str.replace(re,'<mark class="hl">$1</mark>');
}

function tagColor(tag){
  const pal = Object.values(COLOR_HEX);
  let h=0; for(let i=0;i<tag.length;i++) h=(h*31+tag.charCodeAt(i))|0;
  return pal[Math.abs(h)%pal.length];
}

/* ════════════════════════════════════════════════════════════
   CHECKLIST (tâches à cocher dans l'éditeur et le rendu)
════════════════════════════════════════════════════════════ */
function insertChecklistItem(){
  document.execCommand('insertHTML', false,
    '<div class="checklist"><div class="check-item"><input type="checkbox"/><span>Nouvelle tâche…</span></div></div><p><br/></p>');
}
function bindChecklistToggles(){
  const wrap = document.getElementById('d-content-render');
  wrap.querySelectorAll('.check-item input[type=checkbox]').forEach(chk => {
    chk.onchange = () => {
      chk.closest('.check-item').classList.toggle('done', chk.checked);
      if(chk.checked) chk.setAttribute('checked','checked'); else chk.removeAttribute('checked');
      const note = notes.find(n => n.id===currentId);
      if(note){ note.content = wrap.innerHTML; saveNotes(); }
    };
  });
}
// Also allow toggling checkboxes while writing in the editor
document.addEventListener('click', e => {
  if(e.target.matches('#editor .check-item input[type=checkbox]')){
    setTimeout(() => e.target.closest('.check-item').classList.toggle('done', e.target.checked), 0);
  }
});

/* ════════════════════════════════════════════════════════════
   CORBEILLE (soft delete / restauration)
════════════════════════════════════════════════════════════ */
function purgeOldTrash(){
  const now = Date.now();
  const before = notes.length;
  notes = notes.filter(n => {
    if(!n.deletedAt) return true;
    const age = (now - new Date(n.deletedAt).getTime()) / 86400000;
    return age < TRASH_RETENTION_DAYS;
  });
  if(notes.length !== before) saveNotes();
}
function renderTrash(){
  const list = document.getElementById('trash-list');
  const trashed = notes.filter(n => n.deletedAt).sort((a,b)=>new Date(b.deletedAt)-new Date(a.deletedAt));
  if(!trashed.length){
    list.innerHTML = '<div class="dash-empty">La corbeille est vide.</div>'; return;
  }
  list.innerHTML = trashed.map(n => {
    const daysLeft = Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now()-new Date(n.deletedAt).getTime())/86400000));
    return `
      <div class="dash-item">
        <span class="dash-item-dot" style="background:${COLOR_HEX[n.color]||COLOR_HEX.gold}"></span>
        <div class="dash-item-main">
          <div class="dash-item-title">${esc(n.title)}</div>
          <div class="dash-item-sub">Supprimée le ${fmtDate(n.deletedAt)} · ${daysLeft} jour${daysLeft!==1?'s':''} avant suppression définitive</div>
        </div>
        <div class="dash-item-actions">
          <button onclick="restoreFromTrash('${n.id}')">Restaurer</button>
          <button class="danger" onclick="permanentlyDelete('${n.id}')">Supprimer</button>
        </div>
      </div>`;
  }).join('');
}
function restoreFromTrash(id){
  const note = notes.find(n => n.id===id);
  if(!note) return;
  note.deletedAt = null;
  saveNotes(); renderTrash(); renderNotes();
  logActivity('Note restaurée', note.title);
  showToast('↩ Note restaurée');
}
function permanentlyDelete(id){
  if(!confirm('Supprimer définitivement cette note ? Cette action est irréversible.')) return;
  const note = notes.find(n => n.id===id);
  notes = notes.filter(n => n.id !== id);
  saveNotes(); renderTrash();
  if(note) logActivity('Note supprimée définitivement', note.title);
  showToast('🗑 Supprimée définitivement');
}
function emptyTrash(){
  const trashed = notes.filter(n => n.deletedAt);
  if(!trashed.length){ showToast('La corbeille est déjà vide'); return; }
  if(!confirm(`Supprimer définitivement ${trashed.length} note(s) de la corbeille ?`)) return;
  notes = notes.filter(n => !n.deletedAt);
  saveNotes(); renderTrash();
  logActivity('Corbeille vidée', trashed.length+' note(s)');
  showToast('🗑 Corbeille vidée');
}

/* ════════════════════════════════════════════════════════════
   RAPPELS
════════════════════════════════════════════════════════════ */
function bindReminders(){
  document.getElementById('notif-permission-btn').onclick = () => {
    if(!('Notification' in window)){ showToast('Notifications non supportées par ce navigateur'); return; }
    Notification.requestPermission().then(p => {
      showToast(p==='granted' ? '🔔 Notifications activées' : 'Notifications refusées');
    });
  };
}
function getReminders(){
  const now = new Date();
  const withReminders = notes.filter(n => !n.deletedAt && n.reminderAt);
  const overdue  = withReminders.filter(n => new Date(n.reminderAt) < now).sort((a,b)=>new Date(a.reminderAt)-new Date(b.reminderAt));
  const upcoming = withReminders.filter(n => new Date(n.reminderAt) >= now).sort((a,b)=>new Date(a.reminderAt)-new Date(b.reminderAt));
  return {overdue, upcoming};
}
function reminderItemHTML(n, overdue){
  return `
    <div class="dash-item ${overdue?'overdue':''}" onclick="openNote('${n.id}')">
      <span class="dash-item-dot"></span>
      <div class="dash-item-main">
        <div class="dash-item-title">${esc(n.title)}</div>
        <div class="dash-item-sub">${fmtDateTime(n.reminderAt)}</div>
      </div>
      <div class="dash-item-actions">
        <button onclick="event.stopPropagation();clearReminder('${n.id}')">Terminé</button>
      </div>
    </div>`;
}
function renderReminders(){
  const {overdue, upcoming} = getReminders();
  document.getElementById('reminders-overdue').innerHTML = overdue.length
    ? overdue.map(n => reminderItemHTML(n, true)).join('')
    : '<div class="dash-empty">Aucun rappel en retard 🎉</div>';
  document.getElementById('reminders-upcoming').innerHTML = upcoming.length
    ? upcoming.map(n => reminderItemHTML(n, false)).join('')
    : '<div class="dash-empty">Aucun rappel à venir. Ajoutez-en un depuis l\'éditeur de note.</div>';
}
function clearReminder(id){
  const note = notes.find(n => n.id===id);
  if(!note) return;
  note.reminderAt = null; note.reminderNotified = false;
  saveNotes(); updateReminderBadge();
  renderReminders(); renderDashboard();
  showToast('✓ Rappel terminé');
}
function updateReminderBadge(){
  const {overdue} = getReminders();
  const badge = document.getElementById('reminder-badge');
  badge.textContent = overdue.length;
  badge.classList.toggle('hidden', overdue.length===0);
}
function checkDueReminders(){
  const now = new Date();
  let changed = false;
  notes.forEach(n => {
    if(!n.deletedAt && n.reminderAt && !n.reminderNotified && new Date(n.reminderAt) <= now){
      n.reminderNotified = true; changed = true;
      if('Notification' in window && Notification.permission==='granted'){
        new Notification('🔔 Rappel SimpleNote', {body:n.title});
      } else {
        showToast('🔔 Rappel : '+n.title);
      }
    }
  });
  if(changed) saveNotes();
  updateReminderBadge();
}

/* ════════════════════════════════════════════════════════════
   DUPLICATION
════════════════════════════════════════════════════════════ */
function duplicateNote(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  const copy = {
    ...note, id:genId(), title:note.title+' (copie)',
    createdAt:new Date().toISOString(), updatedAt:null,
    pinned:false, history:[], reminderAt:null, reminderNotified:false, deletedAt:null,
  };
  notes.unshift(copy);
  saveNotes();
  logActivity('Note dupliquée', note.title);
  showToast('📄 Note dupliquée');
  openNote(copy.id);
}

/* ════════════════════════════════════════════════════════════
   PARTAGE (lien encodé, sans serveur)
════════════════════════════════════════════════════════════ */
function b64EncodeUnicode(str){ return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m,p)=>String.fromCharCode('0x'+p))); }
function b64DecodeUnicode(str){ return decodeURIComponent(atob(str).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')); }

function bindShare(){
  document.getElementById('share-copy-btn').onclick = () => {
    const inp = document.getElementById('share-link-input');
    inp.select();
    navigator.clipboard.writeText(inp.value).then(() => showToast('🔗 Lien copié !'));
  };
  document.getElementById('import-share-confirm-btn').onclick = confirmImportSharedNote;

  document.getElementById('shared-refresh-btn')?.addEventListener('click', renderShared);

  document.getElementById('share-friend-btn').onclick = async () => {
    const emailInp = document.getElementById('share-friend-email');
    const errBox = document.getElementById('share-friend-error');
    const email = emailInp.value.trim();
    errBox.classList.add('hidden');
    if(!email || !email.includes('@')){
      errBox.textContent = 'Entre une adresse email valide.';
      errBox.classList.remove('hidden');
      return;
    }
    const note = notes.find(n => n.id===currentId);
    if(!note || !currentUser) return;
    const payload = { title:note.title, description:note.description, author:note.author, content:note.content, tags:note.tags, color:note.color };
    try{
      await window.fbApi.shareNoteWithFriend(currentUser.uid, currentUser.email, email, payload);
      showToast('✉️ Note envoyée à '+email+' !');
      emailInp.value = '';
    }catch(e){
      errBox.textContent = "Impossible d'envoyer la note. Vérifie ta connexion et réessaie.";
      errBox.classList.remove('hidden');
    }
  };
}
function openShareModal(){
  const note = notes.find(n => n.id===currentId);
  if(!note) return;
  const payload = {t:note.title, a:note.author, d:note.description, c:note.content, tags:note.tags, color:note.color};
  const encoded = b64EncodeUnicode(JSON.stringify(payload));
  const url = location.origin + location.pathname + '#share=' + encoded;
  document.getElementById('share-link-input').value = url;
  openModal('modal-share');
}
let pendingSharedNote = null;
function checkSharedLinkOnLoad(){
  if(!location.hash.startsWith('#share=')) return;
  try{
    const encoded = location.hash.slice(7);
    const payload = JSON.parse(b64DecodeUnicode(decodeURIComponent(encoded)));
    pendingSharedNote = payload;
    document.getElementById('import-share-title').textContent = payload.t || 'Sans titre';
    openModal('modal-import-share');
  }catch(e){ /* invalid link, ignore */ }
}
function confirmImportSharedNote(){
  if(!pendingSharedNote) return;
  const p = pendingSharedNote;
  const note = {
    id:genId(), title:p.t||'Note partagée', description:p.d||'', author:p.a||'Inconnu',
    content:p.c||'', tags:p.tags||[], color:p.color||'gold',
    folderId:null, locked:false, pw:null, reminderAt:null, reminderNotified:false,
    pinned:false, createdAt:new Date().toISOString(), history:[], deletedAt:null,
  };
  notes.unshift(note); saveNotes();
  logActivity('Note importée (partage)', note.title);
  closeModal('modal-import-share');
  history.replaceState(null, '', location.pathname);
  showToast('📥 Note importée avec succès');
  goToPage('home'); renderNotes();
  pendingSharedNote = null;
}

/* ════════════════════════════════════════════════════════════
   DÉFI DU JOUR
   (une petite idée d'écriture différente chaque jour, calculée
   simplement à partir de la date — pas besoin de serveur pour ça)
════════════════════════════════════════════════════════════ */
const WRITING_PROMPTS = [
  "Décris ta journée parfaite, du réveil au coucher.",
  "Invente une créature qui vit dans ton jardin sans que personne ne l'ait jamais vue.",
  "Si tu pouvais parler à ton toi du futur, que lui dirais-tu ?",
  "Raconte ce que tu ferais si tu étais invisible pendant 24h.",
  "Décris ton endroit préféré au monde, réel ou imaginaire.",
  "Écris une lettre à un ami pour lui expliquer pourquoi il compte pour toi.",
  "Invente une nouvelle fête qui n'existe pas encore.",
  "Raconte un souvenir qui te fait toujours sourire.",
  "Si les animaux pouvaient parler pendant une journée, que se diraient-ils ?",
  "Décris le monde dans 100 ans.",
  "Invente une recette complètement folle.",
  "Écris trois choses pour lesquelles tu es reconnaissant aujourd'hui.",
  "Si tu avais un super-pouvoir pendant une heure seulement, lequel choisirais-tu ?",
  "Raconte une histoire qui commence par « La porte s'est ouverte toute seule… »",
  "Décris ton super-héros préféré et pourquoi tu l'admires.",
  "Invente un objet magique et explique ce qu'il fait.",
  "Qu'est-ce que tu aimerais apprendre cette année ?",
  "Raconte ta pire (ou meilleure) blague et pourquoi elle te fait rire.",
  "Décris la ville de tes rêves.",
  "Si tu pouvais dîner avec n'importe qui, qui choisirais-tu et pourquoi ?",
  "Écris un poème sur la pluie.",
  "Raconte un rêve étrange dont tu te souviens.",
  "Invente un jeu que personne n'a jamais joué avant.",
  "Décris ce que tu vois par ta fenêtre en l'imaginant complètement différent.",
  "Si les couleurs avaient un goût, à quoi ressembleraient-elles ?",
  "Raconte l'histoire de ton objet préféré, comme s'il pouvait parler.",
  "Écris à propos d'un lieu où tu te sens totalement en sécurité.",
  "Invente une excuse complètement improbable pour être en retard.",
  "Décris ce que ferait ton animal de compagnie (réel ou rêvé) s'il dirigeait le monde.",
  "Raconte une journée vécue à l'envers, du soir au matin.",
];
function getTodayChallenge(){
  const start = new Date(2024,0,1);
  const days = Math.floor((Date.now() - start) / 86400000);
  const idx = ((days % WRITING_PROMPTS.length) + WRITING_PROMPTS.length) % WRITING_PROMPTS.length;
  return WRITING_PROMPTS[idx];
}
function getChallengesDone(){
  return JSON.parse(localStorage.getItem('sn4_challenges_done') || '[]');
}
function renderChallenge(){
  const prompt = getTodayChallenge();
  const done = getChallengesDone();
  const todayKey = new Date().toDateString();
  const doneToday = done.includes(todayKey);

  document.getElementById('challenge-card').innerHTML = `
    <div class="chart-card challenge-hero">
      <span class="chip-soft">Défi du ${new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})}</span>
      <p class="challenge-prompt">${esc(prompt)}</p>
      <button class="btn-primary" id="challenge-start-btn" ${doneToday ? 'disabled' : ''}>
        ${doneToday ? '✓ Défi relevé aujourd\'hui, bravo !' : 'Écrire ma réponse'}
      </button>
    </div>`;

  const startBtn = document.getElementById('challenge-start-btn');
  if(startBtn && !doneToday){
    startBtn.onclick = () => {
      const arr = getChallengesDone();
      arr.push(todayKey);
      localStorage.setItem('sn4_challenges_done', JSON.stringify(arr));
      editingId = null;
      resetForm();
      applyFormData({ title:'Défi : '+prompt.slice(0,60), desc:prompt, tags:['défi'] });
      goToPage('create');
    };
  }

  const hist = [...done].reverse().slice(0,10);
  document.getElementById('challenge-history').innerHTML = hist.length ? hist.map(d => `
    <div class="dash-item">
      <span class="dash-item-dot" style="background:var(--c-mint)"></span>
      <div class="dash-item-main">
        <div class="dash-item-title">Défi relevé</div>
        <div class="dash-item-sub">${esc(d)}</div>
      </div>
    </div>`).join('') : '<div class="dash-empty">Relève ton premier défi pour commencer une série !</div>';
}

/* ════════════════════════════════════════════════════════════
   NOTES PARTAGÉES PAR UN AMI (vraie fonctionnalité serveur)
   Explication simple : quand tu partages une note "à un ami",
   on l'écrit dans une boîte aux lettres commune sur le serveur
   Firebase (une collection "shares"). Ton ami, en se connectant,
   va lire cette boîte aux lettres et voir tes notes apparaître
   dans son onglet "Partagées" — un peu comme un email !
════════════════════════════════════════════════════════════ */
let sharedCache = [];
async function renderShared(){
  const list = document.getElementById('shared-list');
  if(!currentUser || !window.fbApi?.fetchSharesForMe){
    list.innerHTML = '<div class="dash-empty">Connecte-toi pour voir tes notes partagées.</div>';
    return;
  }
  list.innerHTML = '<div class="dash-empty">Chargement…</div>';
  try{
    sharedCache = await window.fbApi.fetchSharesForMe(currentUser.email);
    if(!sharedCache.length){
      list.innerHTML = '<div class="dash-empty">Aucune note partagée pour l\'instant. Demande à un ami de t\'en envoyer une depuis sa note, bouton « Partager » !</div>';
      return;
    }
    list.innerHTML = sharedCache.map(s => `
      <div class="dash-item">
        <span class="dash-item-dot" style="background:${COLOR_HEX[s.note?.color]||COLOR_HEX.gold}"></span>
        <div class="dash-item-main">
          <div class="dash-item-title">${esc(s.note?.title || 'Sans titre')}</div>
          <div class="dash-item-sub">Envoyée par ${esc(s.fromEmail||'un ami')}</div>
        </div>
        <button class="btn-ghost" onclick="importSharedNote('${s.shareId}')">Importer</button>
        <button class="icon-pill" onclick="dismissSharedNote('${s.shareId}')" title="Ignorer">✕</button>
      </div>`).join('');
  }catch(e){
    list.innerHTML = '<div class="dash-empty">Impossible de charger tes notes partagées. Vérifie ta connexion et réessaie.</div>';
  }
}
function importSharedNote(shareId){
  const s = sharedCache.find(x => x.shareId===shareId);
  if(!s) return;
  const p = s.note || {};
  const note = {
    id:genId(), title:p.title||'Note partagée', description:p.description||'', author:p.author||s.fromEmail||'Ami',
    content:p.content||'', tags:p.tags||[], color:p.color||'gold',
    folderId:null, locked:false, pw:null, reminderAt:null, reminderNotified:false,
    pinned:false, createdAt:new Date().toISOString(), history:[], deletedAt:null,
  };
  notes.unshift(note); saveNotes();
  logActivity('Note reçue d\'un ami', note.title);
  window.fbApi.dismissShare(shareId).catch(()=>{});
  showToast('📥 Note importée dans tes notes !');
  renderShared();
}
function dismissSharedNote(shareId){
  window.fbApi.dismissShare(shareId).then(renderShared).catch(()=>showToast('❌ Erreur, réessaie.'));
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
function computeStreak(activeNotes){
  const days = new Set();
  activeNotes.forEach(n => {
    days.add(new Date(n.createdAt).toDateString());
    if(n.updatedAt) days.add(new Date(n.updatedAt).toDateString());
  });
  let streak = 0;
  let d = new Date();
  while(days.has(d.toDateString())){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function renderDashboard(){
  const activeNotes = notes.filter(n => !n.deletedAt);
  const totalW = activeNotes.reduce((s,n)=>s+countWords(stripTags(n.content||'')),0);
  const tagsSet = new Set(); activeNotes.forEach(n=>(n.tags||[]).forEach(t=>tagsSet.add(t)));
  const {overdue, upcoming} = getReminders();
  const streak = computeStreak(activeNotes);

  const stats = {
    total: activeNotes.length, words: totalW, folders: folders.length,
    tags: tagsSet.size, locked: activeNotes.filter(n=>n.locked).length,
    pinned: activeNotes.filter(n=>n.pinned).length, streak,
  };

  document.getElementById('dash-stats').innerHTML = [
    {val:stats.total, lbl:'Notes actives'},
    {val:totalW.toLocaleString('fr'), lbl:'Mots écrits'},
    {val:streak, lbl:'Jours de suite 🔥'},
    {val:overdue.length+upcoming.length, lbl:'Rappels actifs'},
    {val:notes.filter(n=>n.deletedAt).length, lbl:'Dans la corbeille'},
    {val:folders.length, lbl:'Dossiers'},
  ].map(s => `<div class="stat-card"><div class="stat-val">${s.val}</div><div class="stat-lbl">${s.lbl}</div></div>`).join('');

  // Greeting
  const h = new Date().getHours();
  const greet = h<6?'Bonne nuit 🌙':h<12?'Bonjour ☀️':h<18?'Bon après-midi 👋':'Bonsoir 🌆';
  document.getElementById('dash-greeting').textContent = greet;

  // Recent notes
  const recent = [...activeNotes].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)).slice(0,6);
  document.getElementById('dash-recent').innerHTML = recent.length ? recent.map(n => `
    <div class="dash-item" onclick="openNote('${n.id}')">
      <span class="dash-item-dot" style="background:${COLOR_HEX[n.color]||COLOR_HEX.gold}"></span>
      <div class="dash-item-main">
        <div class="dash-item-title">${esc(n.title)}</div>
        <div class="dash-item-sub">@${esc(n.author)}</div>
      </div>
      <span class="dash-item-meta">${fmtDate(n.updatedAt||n.createdAt)}</span>
    </div>`).join('') : '<div class="dash-empty">Aucune note pour l\'instant.</div>';

  // Reminders due
  const dueList = [...overdue, ...upcoming].slice(0,5);
  document.getElementById('dash-reminders').innerHTML = dueList.length
    ? dueList.map(n => reminderItemHTML(n, new Date(n.reminderAt)<new Date())).join('')
    : '<div class="dash-empty">Aucun rappel programmé.</div>';

  // Achievements
  document.getElementById('dash-achievements').innerHTML = ACHIEVEMENTS.map(a => {
    const earned = a.test(stats);
    return `<div class="achv ${earned?'earned':''}"><div class="achv-icon">${a.icon}</div><div class="achv-lbl">${a.lbl}</div></div>`;
  }).join('');

  // Heatmap (70 days)
  const counts = {};
  activeNotes.forEach(n => {
    [n.createdAt, n.updatedAt].filter(Boolean).forEach(dt => {
      const key = new Date(dt).toDateString();
      counts[key] = (counts[key]||0)+1;
    });
  });
  const maxC = Math.max(1, ...Object.values(counts));
  let heatHtml = '';
  for(let i=69;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const c = counts[d.toDateString()] || 0;
    const intensity = c===0 ? 0 : Math.min(1, c/maxC);
    const bg = c===0 ? 'var(--s3)' : `color-mix(in srgb, var(--accent) ${20+Math.round(intensity*80)}%, var(--s3))`;
    heatHtml += `<div class="heat-cell" style="background:${bg}" title="${d.toLocaleDateString('fr-FR')} · ${c} activité(s)"></div>`;
  }
  document.getElementById('dash-heatmap').innerHTML = heatHtml;

  // Word cloud
  const STOP = new Set(['dans','avec','pour','cette','elle','vous','nous','plus','tout','toute','tous','toutes','être','avoir','fait','leur','leurs','sont','mais','donc','alors','comme','très','bien','peut','sans','sous','entre','encore','déjà','aussi','ceci','cela','celui','celle','the','and','for','with','that','this','from','have','are','was','were']);
  const freq = {};
  activeNotes.forEach(n => {
    stripTags(n.content||'').toLowerCase().match(/[a-zàâäéèêëïîôöùûüç]{4,}/g)?.forEach(w => {
      if(!STOP.has(w)) freq[w] = (freq[w]||0)+1;
    });
  });
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,25);
  const maxF = top[0]?.[1] || 1;
  document.getElementById('dash-wordcloud').innerHTML = top.length ? top.map(([w,c]) => {
    const size = 11 + Math.round((c/maxF)*20);
    return `<span class="wc-word" style="font-size:${size}px;opacity:${.5+(c/maxF)*.5}">${esc(w)}</span>`;
  }).join('') : '<div class="dash-empty">Écrivez quelques notes pour voir apparaître vos mots-clés.</div>';
}

/* ════════════════════════════════════════════════════════════
   ACTIVITÉ (journal)
════════════════════════════════════════════════════════════ */
function logActivity(action, detail){
  activity.unshift({action, detail:detail||'', at:new Date().toISOString()});
  activity = activity.slice(0,60);
  localStorage.setItem('sn4_activity', JSON.stringify(activity));
}

/* ════════════════════════════════════════════════════════════
   AUTHENTIFICATION (Firebase)
════════════════════════════════════════════════════════════ */
let authMode = 'signin'; // 'signin' | 'signup'

function bindAuthGate(){
  const emailInp = document.getElementById('auth-email');
  const pwInp    = document.getElementById('auth-password');
  const errBox   = document.getElementById('auth-error');
  const submitBtn= document.getElementById('auth-submit-btn');

  function setError(msg){
    if(!msg){ errBox.classList.add('hidden'); errBox.textContent=''; return; }
    errBox.textContent = msg; errBox.classList.remove('hidden');
  }
  function friendlyError(code){
    const map = {
      'auth/invalid-email':'Adresse email invalide.',
      'auth/missing-password':'Merci d\'entrer un mot de passe.',
      'auth/weak-password':'Le mot de passe doit faire au moins 6 caractères.',
      'auth/email-already-in-use':'Un compte existe déjà avec cet email. Essaie de te connecter.',
      'auth/invalid-credential':'Email ou mot de passe incorrect.',
      'auth/wrong-password':'Email ou mot de passe incorrect.',
      'auth/user-not-found':'Aucun compte avec cet email. Crée-en un !',
      'auth/too-many-requests':'Trop d\'essais, réessaie dans quelques minutes.',
      'auth/network-request-failed':'Problème de connexion internet.',
    };
    return map[code] || 'Une erreur est survenue. Réessaie.';
  }

  document.getElementById('auth-toggle-mode').addEventListener('click', () => {
    authMode = authMode==='signin' ? 'signup' : 'signin';
    document.getElementById('auth-title').textContent = authMode==='signin' ? 'Connexion' : 'Créer un compte';
    document.getElementById('auth-sub').textContent = authMode==='signin'
      ? 'Retrouve tes notes, en sécurité, où que tu sois.'
      : 'Un compte gratuit pour garder tes notes rien qu\'à toi.';
    submitBtn.textContent = authMode==='signin' ? 'Se connecter' : 'Créer mon compte';
    document.getElementById('auth-toggle-mode').textContent = authMode==='signin'
      ? 'Pas encore de compte ? Crée-en un'
      : 'Déjà un compte ? Connecte-toi';
    setError(null);
  });

  document.getElementById('auth-forgot-btn').addEventListener('click', () => {
    const email = emailInp.value.trim();
    if(!email){ setError('Entre d\'abord ton email ci-dessus, puis reclique ici.'); return; }
    window.fbApi.resetPassword(email)
      .then(() => showToast('📩 Email de réinitialisation envoyé !'))
      .catch(e => setError(friendlyError(e.code)));
  });

  async function submit(){
    const email = emailInp.value.trim();
    const pw = pwInp.value;
    if(!email || !pw){ setError('Remplis l\'email et le mot de passe.'); return; }
    setError(null);
    submitBtn.disabled = true;
    submitBtn.textContent = '…';
    try{
      if(authMode==='signin') await window.fbApi.signIn(email, pw);
      else await window.fbApi.signUp(email, pw);
      pwInp.value = '';
    }catch(e){
      setError(friendlyError(e.code));
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = authMode==='signin' ? 'Se connecter' : 'Créer mon compte';
    }
  }
  submitBtn.addEventListener('click', submit);
  pwInp.addEventListener('keydown', e => { if(e.key==='Enter') submit(); });
  emailInp.addEventListener('keydown', e => { if(e.key==='Enter') pwInp.focus(); });

  document.getElementById('signout-btn').addEventListener('click', () => {
    if(!confirm('Se déconnecter ?')) return;
    window.fbApi.signOutUser();
  });
}


/* ════════════════════════════════════════════════════════════
   MES DONNÉES (anciennement "admin", protégé par Firebase Auth)
════════════════════════════════════════════════════════════ */
function bindAdmin(){
  document.getElementById('admin-entry-btn').onclick = () => {
    goToPage('admin');
    renderAdminAll();
  };
  document.getElementById('admin-lock-btn').onclick = () => goToPage('dashboard');

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b===btn));
      document.querySelectorAll('.atab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('atab-'+btn.dataset.atab).classList.remove('hidden');
    });
  });

  document.getElementById('admin-notes-search').addEventListener('input', renderAdminNotesTable);
  document.getElementById('admin-select-all').addEventListener('change', e => {
    document.querySelectorAll('.admin-row-chk').forEach(c => c.checked = e.target.checked);
  });
  document.getElementById('admin-bulk-delete').onclick = adminBulkDelete;
  document.getElementById('admin-export-btn').onclick = exportAllData;
  document.getElementById('admin-import-btn').onclick = () => document.getElementById('admin-import-input').click();
  document.getElementById('admin-import-input').addEventListener('change', importAllData);
  document.getElementById('admin-reset-btn').onclick = resetAppData;
  document.getElementById('admin-pw-change-btn').onclick = changeAdminPassword;
}
function renderAdminAll(){
  renderAdminOverview();
  renderAdminNotesTable();
  renderAdminFoldersTable();
  renderAdminLog();
}
function renderAdminOverview(){
  const totalN = notes.length;
  const trashedN = notes.filter(n=>n.deletedAt).length;
  const lockedN = notes.filter(n=>n.locked).length;
  const pinnedN = notes.filter(n=>n.pinned).length;
  const totalW = notes.reduce((s,n)=>s+countWords(stripTags(n.content||'')),0);
  document.getElementById('admin-stats').innerHTML = [
    {val:totalN, lbl:'Total notes'},
    {val:trashedN, lbl:'En corbeille'},
    {val:lockedN, lbl:'Protégées'},
    {val:pinnedN, lbl:'Épinglées'},
    {val:folders.length, lbl:'Dossiers'},
    {val:totalW.toLocaleString('fr'), lbl:'Mots au total'},
  ].map(s => `<div class="stat-card"><div class="stat-val">${s.val}</div><div class="stat-lbl">${s.lbl}</div></div>`).join('');

  const dist = folders.map(f => ({name:f.name, c:notes.filter(n=>n.folderId===f.id && !n.deletedAt).length, color:f.color}));
  dist.push({name:'Sans dossier', c:notes.filter(n=>!n.folderId && !n.deletedAt).length, color:'gold'});
  const maxD = Math.max(1, ...dist.map(d=>d.c));
  document.getElementById('admin-folder-chart').innerHTML = dist.map(d => `
    <div class="bar-row">
      <span class="bar-lbl" title="${esc(d.name)}">${esc(d.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(d.c/maxD*100)}%;background:${COLOR_HEX[d.color]||COLOR_HEX.gold}"></div></div>
      <span class="bar-n">${d.c}</span>
    </div>`).join('');
}
function renderAdminNotesTable(){
  const q = (document.getElementById('admin-notes-search').value||'').toLowerCase();
  const rows = notes.filter(n => {
    if(!q) return true;
    return [n.title,n.author,...(n.tags||[])].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  document.getElementById('admin-notes-tbody').innerHTML = rows.map(n => {
    const folder = n.folderId ? folders.find(f=>f.id===n.folderId) : null;
    const badges = [
      n.deletedAt ? '<span class="a-badge trashed">Corbeille</span>' : '',
      n.locked    ? '<span class="a-badge locked">Protégée</span>' : '',
      n.pinned    ? '<span class="a-badge">Épinglée</span>' : '',
    ].filter(Boolean).join(' ') || '<span class="a-badge">Active</span>';
    return `
      <tr>
        <td><input type="checkbox" class="admin-row-chk" data-id="${n.id}"/></td>
        <td>${esc(n.title)}</td>
        <td>@${esc(n.author)}</td>
        <td>${folder?esc(folder.name):'—'}</td>
        <td>${badges}</td>
        <td>${fmtDate(n.createdAt)}</td>
        <td>
          <button onclick="adminViewNote('${n.id}')">Voir</button>
          <button class="danger" onclick="adminDeleteNote('${n.id}')">Suppr.</button>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Aucune note trouvée.</td></tr>`;
}
function adminViewNote(id){
  const note = notes.find(n=>n.id===id);
  if(!note) return;
  const wasLocked = note.locked;
  note.locked = false;   // admin can bypass the password lock to inspect content
  openNote(id);
  note.locked = wasLocked;
}
function adminDeleteNote(id){
  const note = notes.find(n=>n.id===id);
  if(!note) return;
  if(note.deletedAt){
    if(!confirm('Supprimer définitivement cette note ?')) return;
    notes = notes.filter(n=>n.id!==id);
    logActivity('Note supprimée définitivement (admin)', note.title);
  } else {
    note.deletedAt = new Date().toISOString();
    logActivity('Note déplacée vers la corbeille (admin)', note.title);
  }
  saveNotes(); renderAdminNotesTable(); renderAdminOverview();
  showToast('✓ Action effectuée');
}
function adminBulkDelete(){
  const ids = [...document.querySelectorAll('.admin-row-chk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ showToast('Aucune note sélectionnée'); return; }
  if(!confirm(`Supprimer définitivement ${ids.length} note(s) ?`)) return;
  notes = notes.filter(n => !ids.includes(n.id));
  saveNotes(); renderAdminNotesTable(); renderAdminOverview();
  logActivity('Suppression groupée (admin)', ids.length+' note(s)');
  showToast('🗑 Notes supprimées');
}
function renderAdminFoldersTable(){
  document.getElementById('admin-folders-tbody').innerHTML = folders.map(f => {
    const cnt = notes.filter(n=>n.folderId===f.id && !n.deletedAt).length;
    return `
      <tr>
        <td>${esc(f.name)}</td>
        <td><span class="sb-folder-dot" style="background:${COLOR_HEX[f.color]||COLOR_HEX.gold};display:inline-block"></span></td>
        <td>${cnt}</td>
        <td><button class="danger" onclick="deleteFolder('${f.id}');renderAdminFoldersTable();renderAdminOverview()">Supprimer</button></td>
      </tr>`;
  }).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Aucun dossier.</td></tr>`;
}
function exportAllData(){
  const data = {notes, folders, exportedAt:new Date().toISOString(), app:'SimpleNote.fr'};
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob), download:'simplenote_backup_'+Date.now()+'.json'});
  a.click(); URL.revokeObjectURL(a.href);
  logActivity('Export des données');
  showToast('⬇ Sauvegarde exportée');
}
function importAllData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!confirm(`Importer ${data.notes?.length||0} note(s) et ${data.folders?.length||0} dossier(s) ? Ils seront ajoutés à vos données actuelles.`)) return;
      const folderMap = {};
      (data.folders||[]).forEach(f => {
        const newId = genId(); folderMap[f.id] = newId;
        folders.push({...f, id:newId});
      });
      (data.notes||[]).forEach(n => {
        notes.push({...n, id:genId(), folderId: n.folderId ? (folderMap[n.folderId]||null) : null});
      });
      saveNotes(); saveFolders();
      renderAdminAll(); renderNotes(); renderFolders();
      logActivity('Import de données', (data.notes?.length||0)+' note(s)');
      showToast('📥 Données importées');
    }catch(err){ showToast('❌ Fichier invalide'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}
function resetAppData(){
  if(!confirm('Voulez-vous vraiment TOUT réinitialiser ? Toutes les notes et dossiers seront supprimés définitivement.')) return;
  if(!confirm('Dernière confirmation : cette action est irréversible. Continuer ?')) return;
  notes = []; folders = [];
  saveNotes(); saveFolders();
  logActivity('Réinitialisation complète de l\'application');
  renderAdminAll(); renderNotes(); renderFolders(); renderDashboard();
  showToast('♻️ Application réinitialisée');
}
async function changeAdminPassword(){
  const cur = document.getElementById('admin-pw-current').value;
  const next = document.getElementById('admin-pw-new').value;
  const err = document.getElementById('admin-pw-change-error');
  const btn = document.getElementById('admin-pw-change-btn');
  err.classList.add('hidden');
  if(!cur || !next){ err.textContent = 'Remplis les deux champs.'; err.classList.remove('hidden'); return; }
  if(next.length < 6){ err.textContent = 'Le nouveau mot de passe doit faire au moins 6 caractères.'; err.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = '…';
  try{
    await window.fbApi.changePassword(cur, next);
    document.getElementById('admin-pw-current').value = '';
    document.getElementById('admin-pw-new').value = '';
    logActivity('Mot de passe du compte modifié');
    showToast('✓ Mot de passe mis à jour');
  }catch(e){
    err.textContent = e.code==='auth/invalid-credential' || e.code==='auth/wrong-password'
      ? 'Mot de passe actuel incorrect.' : 'Une erreur est survenue.';
    err.classList.remove('hidden');
  }finally{
    btn.disabled = false; btn.textContent = 'Mettre à jour';
  }
}
function renderAdminLog(){
  const list = document.getElementById('admin-log-list');
  list.innerHTML = activity.length ? activity.map(a => `
    <div class="dash-item" style="cursor:default">
      <span class="dash-item-dot"></span>
      <div class="dash-item-main">
        <div class="dash-item-title">${esc(a.action)}</div>
        <div class="dash-item-sub">${esc(a.detail||'')}</div>
      </div>
      <span class="dash-item-meta">${fmtDateTime(a.at)}</span>
    </div>`).join('') : '<div class="dash-empty">Aucune activité enregistrée.</div>';
}