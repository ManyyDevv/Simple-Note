/* ════════════════════════════════════
   SimpleNote v4 — script.js
════════════════════════════════════ */

// ─── STATE ───────────────────────────
let notes   = JSON.parse(localStorage.getItem('sn4_notes')   || '[]');
let folders = JSON.parse(localStorage.getItem('sn4_folders') || '[]');
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
  renderNotes();
})();

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
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.page));
  });
}
function goToPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-'+name);
  if(!page) return;
  page.classList.remove('hidden');
  const navBtn = document.querySelector(`.nav-item[data-page="${name}"]`);
  if(navBtn) navBtn.classList.add('active');
  if(name==='home')    renderNotes();
  if(name==='stats')   renderStats();
  if(name==='folders') renderFolders();
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
  document.getElementById('note-count').textContent = notes.length + ' note'+(notes.length!==1?'s':'');

  container.querySelectorAll('.ncard').forEach(c => c.remove());

  let filtered = notes.filter(n => {
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
  notes.forEach(n => (n.tags||[]).forEach(t => allTags.add(t)));
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
  };
}

function applyFormData(data){
  document.getElementById('f-title').value  = data.title  || '';
  document.getElementById('f-author').value = data.author || '';
  document.getElementById('f-desc').value   = data.desc   || '';
  document.getElementById('f-tags').value   = (data.tags||[]).join(', ');
  document.getElementById('editor').innerHTML = data.content || '';
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
        updatedAt:new Date().toISOString(), history,
      };
    }
    saveNotes(); showToast('✓ Note modifiée');
    const id = editingId; editingId = null;
    resetForm(); clearDraft();
    openNote(id);
  } else {
    const note = {
      id:genId(), title:d.title, description:d.desc, author:d.author,
      content:d.content, tags:d.tags, color:d.color,
      folderId:d.folder||null, locked:d.locked, pw:d.locked?d.pw:null,
      pinned:false, createdAt:new Date().toISOString(), history:[],
    };
    notes.unshift(note);
    saveNotes(); showToast('✓ Note créée !'); clearDraft();
    resetForm(); openNote(note.id);
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
  ['f-title','f-author','f-desc','f-tags','f-pw'].forEach(id => document.getElementById(id).value='');
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
  if(!currentId || !confirm('Supprimer définitivement cette note ?')) return;
  notes = notes.filter(n => n.id !== currentId);
  saveNotes(); currentId = null;
  showToast('🗑 Note supprimée'); goToPage('home');
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
    const cnt = notes.filter(n => n.folderId===f.id).length;
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
  const totalN   = notes.length;
  const totalW   = notes.reduce((s,n) => s+countWords(stripTags(n.content||'')), 0);
  const authors  = new Set(notes.map(n => n.author)).size;
  const pinned   = notes.filter(n => n.pinned).length;
  const locked   = notes.filter(n => n.locked).length;
  const withTags = notes.filter(n => (n.tags||[]).length).length;
  const avgW     = totalN ? Math.round(totalW/totalN) : 0;
  const inFolders = notes.filter(n => n.folderId).length;

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
  notes.forEach(n => (n.tags||[]).forEach(t => tc[t]=(tc[t]||0)+1));
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
  notes.forEach(n => {
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
//  PERSIST
// ════════════════════════════════════
function saveNotes()  { localStorage.setItem('sn4_notes',   JSON.stringify(notes)); }
function saveFolders(){ localStorage.setItem('sn4_folders', JSON.stringify(folders)); }

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