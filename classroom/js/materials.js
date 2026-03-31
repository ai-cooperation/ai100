// ClassClaw — materials
// Teaching materials: built-in list, deck options, custom materials, material library

// Teaching materials
var materials = [
  // --- Supplements S01-S18 ---
  { title: 'S01 GAS \u81EA\u52D5\u5316', icon: '\u26A1', url: '/slides/supplements/S01_GAS_Automation.html', desc: '\u4E09\u5C0F\u6642\u00B751\u9801' },
  { title: 'S02 Vibe Coding', icon: '\uD83C\uDFA8', url: '/slides/supplements/S02_Vibe_Coding.html', desc: '\u4E09\u5C0F\u6642\u00B758\u9801' },
  { title: 'S03 CLI Agent', icon: '\u2328\uFE0F', url: '/slides/supplements/S03_CLI_Agent.html', desc: '\u4E09\u5C0F\u6642\u00B754\u9801' },
  { title: 'S04 VS Code IDE', icon: '\uD83C\uDFD7\uFE0F', url: '/slides/supplements/S04_VSCode_IDE.html', desc: '\u4E09\u5C0F\u6642\u00B749\u9801' },
  { title: 'S05 OpenClaw \u9F8D\u8766', icon: '\uD83E\uDD9E', url: '/slides/supplements/S05_OpenClaw.html', desc: '\u4E09\u5C0F\u6642\u00B762\u9801' },
  { title: 'S06 Token \u7D93\u6FDF\u5B78', icon: '\uD83E\uDE99', url: '/slides/supplements/S06_Token_Economy.html', desc: '\u4E00\u5C0F\u6642\u00B724\u9801' },
  { title: 'S07 NotebookLM \u5B78\u7FD2\u8853', icon: '\uD83D\uDCD3', url: '/slides/supplements/S07_NotebookLM.html', desc: '\u4E00\u5C0F\u6642\u00B724\u9801' },
  { title: 'S08 81K \u771F\u5FC3\u8A71', icon: '\uD83D\uDCAC', url: '/slides/supplements/S08_81K_Voices.html', desc: '30\u5206\u9418\u00B715\u9801' },
  { title: 'S09 FARS \u4E8B\u5BE6\u67E5\u6838', icon: '\uD83D\uDD0D', url: '/slides/supplements/S09_FARS_FactCheck_v2.html', desc: '\u4E8B\u5BE6\u67E5\u6838\u00B720\u9801' },
  { title: 'S10 \u5DE5\u5177\u9078\u64C7\u5206\u6790', icon: '\uD83D\uDD27', url: '/slides/supplements/S10_Tool_Selection.html', desc: '\u5DE5\u5177\u6C7A\u7B56\u00B727\u9801' },
  { title: 'S11 Everything Claude Code', icon: '\uD83E\uDDEC', url: '/slides/supplements/S11_ECC.html', desc: '\u9032\u968E\u00B717\u9801' },
  { title: 'S12 Personal AI \u57FA\u790E\u8A2D\u65BD', icon: '\uD83C\uDFDB\uFE0F', url: '/slides/supplements/S12_PAI.html', desc: '\u67B6\u69CB\u00B715\u9801' },
  { title: 'S13 Google Apps Script', icon: '\uD83D\uDCDC', url: '/slides/supplements/S13_GAS.html', desc: '\u81EA\u52D5\u5316\u00B715\u9801' },
  { title: 'S14 Google Workspace CLI', icon: '\uD83D\uDDA5\uFE0F', url: '/slides/supplements/S14_GWS.html', desc: 'CLI\u5DE5\u5177\u00B712\u9801' },
  { title: 'S15 Google Cloud SDK', icon: '\u2601\uFE0F', url: '/slides/supplements/S15_gcloud.html', desc: '\u96F2\u7AEF\u00B712\u9801' },
  { title: 'S16 clasp \u958B\u767C\u5DE5\u5177', icon: '\uD83D\uDD29', url: '/slides/supplements/S16_clasp.html', desc: 'GAS\u958B\u767C\u00B710\u9801' },
  { title: 'S17 \u672A\u4F86\u8FAF\u8AD6\u5834', icon: '\u2694\uFE0F', url: '/slides/supplements/S17_Future_Debate_Arena.html', desc: 'AI\u5DE5\u4F5C\u574A\u00B724\u9801' },
  { title: 'S18 AI\u7C21\u58316\u7A2E\u8DEF\u7DDA', icon: '\uD83C\uDFAF', url: '/slides/supplements/S18_AI_Slide_Routes.html', desc: '6\u8DEF\u7DDA\u5168\u666F\u00B718\u9801' },
  { title: 'S19 \u5927\u5B78\u6F14\u8B1B \u4EBA\u99D5\u99AD AI', icon: '\uD83C\uDF93', url: '/slides/supplements/S19_University_Talk.html', desc: '\u99D5\u99ADAI Token\u00B737\u9801' },
  { title: 'S20 \u5F9E\u7B46\u8A18\u5230\u7B2C\u4E8C\u5927\u8166', icon: '\uD83E\uDDE0', url: '/slides/supplements/S20_Knowledge_Base_L1_L5.html', desc: 'AI\u80FD\u529B\u4E94\u7D1A\u00B755\u9801' },
  // --- Chantoban ---
  { title: '\u7522\u6295\u73ED \u8AB2\u7A0B\u4ECB\u7D39', icon: '\uD83C\uDFED', url: '/slides/chantoban/Course_Intro.html', desc: '\u62DB\u751F\u7248\u00B718\u9801' },
  // --- Learn system ---
  { title: '\u4E09\u554F\u6CD5\u5B78\u7FD2\u7CFB\u7D71', icon: '\uD83E\uDDE0', url: '/classroom/learn', desc: '\u81EA\u5B78\u00B7M01 AI \u601D\u7DAD\u8207\u6CBB\u7406' },
  // --- Original materials ---
  { title: '\u5927\u5B78\u6F14\u8B1B \u2014 PPTX \u5716\u7247\u7248', icon: '\uD83C\uDF93', url: '/classroom/presenter', hasSlideControl: true, queryExtra: '&deck=university-talk' },
  { title: 'AI \u7C21\u5831 6 \u8DEF\u7DDA \u2014 HTML \u7248', icon: '\uD83D\uDCCA', url: '/ai-pptx-routes', hasSlideControl: true },
  { title: 'Demo \u6295\u5F71\u7247', icon: '\uD83D\uDCFD', url: '/classroom/presenter', hasSlideControl: true, queryExtra: '&deck=demo' },
  { title: 'Slidev \u98A8\u683C\u793A\u7BC4', icon: '\uD83C\uDFAF', url: '/demo-slidev' },
  { title: 'Marp \u98A8\u683C\u793A\u7BC4', icon: '\uD83D\uDCDD', url: '/demo-marp' },
  { title: 'reveal.js \u98A8\u683C\u793A\u7BC4', icon: '\uD83D\uDD00', url: '/demo-revealjs' }
];

// Deck options for selects
var deckOptions = [
  { name: 'S01_GAS_Automation', label: 'S01 GAS \u81EA\u52D5\u5316' },
  { name: 'S02_Vibe_Coding', label: 'S02 Vibe Coding' },
  { name: 'S03_CLI_Agent', label: 'S03 CLI Agent' },
  { name: 'S04_VSCode_IDE', label: 'S04 VS Code IDE' },
  { name: 'S05_OpenClaw', label: 'S05 OpenClaw' },
  { name: 'S06_Token_Economy', label: 'S06 Token \u7D93\u6FDF\u5B78' },
  { name: 'S07_NotebookLM', label: 'S07 NotebookLM' },
  { name: 'S08_81K_Voices', label: 'S08 81K \u771F\u5FC3\u8A71' },
  { name: 'S09_FARS_FactCheck_v2', label: 'S09 FARS \u4E8B\u5BE6\u67E5\u6838' },
  { name: 'S10_Tool_Selection', label: 'S10 \u5DE5\u5177\u9078\u64C7\u5206\u6790' },
  { name: 'S11_ECC', label: 'S11 Everything Claude Code' },
  { name: 'S12_PAI', label: 'S12 Personal AI' },
  { name: 'S13_GAS', label: 'S13 Google Apps Script' },
  { name: 'S14_GWS', label: 'S14 Google Workspace CLI' },
  { name: 'S15_gcloud', label: 'S15 Google Cloud SDK' },
  { name: 'S16_clasp', label: 'S16 clasp' },
  { name: 'S17_Future_Debate_Arena', label: 'S17 \u672A\u4F86\u8FAF\u8AD6\u5834' },
  { name: 'S18_AI_Slide_Routes', label: 'S18 AI\u7C21\u58316\u7A2E\u8DEF\u7DDA' },
  { name: 'S19_University_Talk', label: 'S19 \u5927\u5B78\u6F14\u8B1B' },
  { name: 'S20_Knowledge_Base_L1_L5', label: 'S20 \u5F9E\u7B46\u8A18\u5230\u7B2C\u4E8C\u5927\u8166' }
];

// ═══ Custom Materials ═══
var customMaterials = [];

function getAllMaterials() {
  var all = materials.map(function(m, i) { return Object.assign({ _idx: i, _builtin: true }, m); });
  customMaterials.forEach(function(m) {
    var entry = {
      title: m.title,
      icon: m.type === 'pptx' ? '\uD83D\uDCFD' : m.type === 'external' ? '\uD83D\uDD17' : '\uD83D\uDCCA',
      desc: m.desc || '',
      _custom: true,
      _key: m._key
    };
    if (m.type === 'pptx') {
      entry.url = '/classroom/presenter';
      entry.hasSlideControl = true;
      entry.queryExtra = '&deck=' + m.deck;
    } else if (m.type === 'external') {
      entry.url = m.url;
      entry.hasSlideControl = false;
    } else {
      entry.url = m.url;
      entry.hasSlideControl = true;
    }
    all.push(entry);
  });
  return all;
}

function loadCustomMaterials() {
  if (!currentUser) return;
  db.ref('users/' + currentUser.uid + '/customMaterials').on('value', function(snap) {
    customMaterials = [];
    snap.forEach(function(c) {
      var m = c.val();
      m._key = c.key;
      m._custom = true;
      customMaterials.push(m);
    });
    renderCustomMaterialsList();
  });
}

function renderCustomMaterialsList() {
  // If material library is open, refresh it
  var mlEl = document.getElementById('materialLibrary');
  if (mlEl && mlEl.classList.contains('active')) {
    renderMaterialLibrary();
  }
}

// ═══ Material Library View ═══
function openMaterialLibrary() {
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('materialLibrary').style.display = 'block';
  document.getElementById('materialLibrary').classList.add('active');
  renderMaterialLibrary();
}

function closeMaterialLibrary() {
  document.getElementById('materialLibrary').style.display = 'none';
  document.getElementById('materialLibrary').classList.remove('active');
  document.getElementById('lobby').classList.add('active');
}

function renderMaterialLibrary() {
  // Built-in materials
  var builtinEl = document.getElementById('mlBuiltinList');
  document.getElementById('mlBuiltinCount').textContent = materials.length;
  var bHtml = '';
  materials.forEach(function(m, idx) {
    var typeLabel = m.hasSlideControl ? '\u6295\u5F71\u7247' : '\u9023\u7D50';
    if (m.url === '/classroom/presenter') typeLabel = 'PPTX \u5716\u7247';
    bHtml += '<div class="room-card" style="cursor:pointer" onclick="previewMaterial(' + idx + ',true)">';
    bHtml += '<span style="font-size:1.3rem;flex-shrink:0">' + m.icon + '</span>';
    bHtml += '<div class="rc-info"><div class="rc-name">' + esc(m.title) + '</div><div class="rc-meta">' + (m.desc || '') + ' \u00B7 ' + typeLabel + '</div></div>';
    bHtml += '</div>';
  });
  builtinEl.innerHTML = bHtml;

  // Custom materials
  var customEl = document.getElementById('mlCustomList');
  document.getElementById('mlCustomCount').textContent = customMaterials.length;
  if (!customMaterials.length) {
    customEl.innerHTML = '<div class="no-rooms">\u5C1A\u7121\u81EA\u8A02\u6559\u6750\u3002\u9EDE\u4E0B\u65B9\u300C\u65B0\u589E\u6559\u6750\u300D\u958B\u59CB\u3002</div>';
    return;
  }
  var cHtml = '';
  customMaterials.forEach(function(m, idx) {
    var icon = m.type === 'pptx' ? '\uD83D\uDCFD' : m.type === 'external' ? '\uD83D\uDD17' : '\uD83D\uDCCA';
    var typeLabel = m.type === 'pptx' ? 'PPTX' : m.type === 'external' ? '\u5916\u90E8\u9023\u7D50' : 'HTML';
    var detail = m.type === 'pptx' ? 'deck: ' + esc(m.deck || '') : (m.url ? esc(m.url) : '');
    cHtml += '<div class="room-card" style="cursor:pointer" onclick="previewMaterial(' + idx + ',false)">';
    cHtml += '<span style="font-size:1.3rem;flex-shrink:0">' + icon + '</span>';
    cHtml += '<div class="rc-info"><div class="rc-name">' + esc(m.title) + ' <span style="font-size:0.7rem;color:var(--dim)">(' + typeLabel + ')</span></div><div class="rc-meta">' + (m.desc ? esc(m.desc) : '') + (detail ? ' \u00B7 ' + detail : '') + '</div></div>';
    cHtml += '<button class="rc-del" onclick="event.stopPropagation();deleteCustomMaterial(\'' + esc(m._key) + '\')">\u522A\u9664</button>';
    cHtml += '</div>';
  });
  customEl.innerHTML = cHtml;
}

// ═══ Preview material from library (open in new window) ═══
function previewMaterial(idx, isBuiltin) {
  var m;
  if (isBuiltin) {
    m = materials[idx];
  } else {
    var cm = customMaterials[idx];
    if (!cm) return;
    // Build material object from custom material data
    m = {};
    if (cm.type === 'pptx') {
      m.url = '/classroom/presenter';
      m.queryExtra = '&deck=' + cm.deck;
    } else {
      m.url = cm.url;
    }
    m.title = cm.title;
  }
  if (!m || !m.url) return;
  // Build preview URL (no room param — just open the content)
  var url = m.url;
  if (m.queryExtra) {
    url += (url.indexOf('?') >= 0 ? '' : '?') + m.queryExtra.replace(/^&/, '');
  }
  window.open(url, '_blank');
}

function showAddMaterial() {
  var el = document.getElementById('customMaterialForm');
  el.style.display = 'block';
  el.innerHTML = '<div class="cm-form">'
    + '<label>\u6559\u6750\u540D\u7A31</label><input type="text" id="cmTitle" placeholder="\u4F8B\uFF1A\u78B3\u8DB3\u8DE1\u7C21\u5831">'
    + '<label>\u985E\u578B</label>'
    + '<div class="cm-type-group">'
    + '<span class="cm-type-opt selected" onclick="selectCmType(this,\'pptx\')">\u5DF2\u8F49\u6A94 PPTX</span>'
    + '<span class="cm-type-opt" onclick="selectCmType(this,\'external\')">\u5916\u90E8\u9023\u7D50</span>'
    + '<span class="cm-type-opt" onclick="selectCmType(this,\'html\')">HTML \u7C21\u5831</span>'
    + '</div>'
    + '<div id="cmDeckField"><label>Deck \u540D\u7A31</label><input type="text" id="cmDeck" placeholder="\u4F8B\uFF1Acarbon-footprint\uFF08convert-deck.sh \u7522\u751F\u7684\u8CC7\u6599\u593E\u540D\u7A31\uFF09"></div>'
    + '<div id="cmUrlField" style="display:none"><label>URL</label><input type="url" id="cmUrl" placeholder="https://..."></div>'
    + '<label>\u8AAA\u660E\uFF08\u9078\u586B\uFF09</label><input type="text" id="cmDesc" placeholder="\u4F8B\uFF1A3\u5C0F\u6642\u00B730\u9801">'
    + '<div class="cm-form-actions">'
    + '<button class="cm-btn-save" onclick="submitCustomMaterial()">\u65B0\u589E</button>'
    + '<button class="cm-btn-cancel" onclick="hideAddMaterial()">\u53D6\u6D88</button>'
    + '</div></div>';
  window._cmType = 'pptx';
}

function selectCmType(el, type) {
  document.querySelectorAll('.cm-type-opt').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
  window._cmType = type;
  document.getElementById('cmDeckField').style.display = type === 'pptx' ? '' : 'none';
  document.getElementById('cmUrlField').style.display = type !== 'pptx' ? '' : 'none';
}

function hideAddMaterial() {
  var el = document.getElementById('customMaterialForm');
  el.style.display = 'none';
  el.innerHTML = '';
}

function submitCustomMaterial() {
  var title = document.getElementById('cmTitle').value.trim();
  if (!title) { showNotification('error', '\u8ACB\u586B\u5BEB\u6559\u6750\u540D\u7A31'); return; }
  var type = window._cmType || 'pptx';
  var data = { title: title, type: type, desc: document.getElementById('cmDesc').value.trim(), created: firebase.database.ServerValue.TIMESTAMP };
  if (type === 'pptx') {
    var deck = document.getElementById('cmDeck').value.trim();
    if (!deck) { showNotification('error', '\u8ACB\u586B\u5BEB Deck \u540D\u7A31'); return; }
    data.deck = deck;
  } else {
    var url = document.getElementById('cmUrl').value.trim();
    if (!url) { showNotification('error', '\u8ACB\u586B\u5BEB URL'); return; }
    data.url = url;
  }
  db.ref('users/' + currentUser.uid + '/customMaterials').push(data).then(function() {
    hideAddMaterial();
    showNotification('success', '\u6559\u6750\u5DF2\u65B0\u589E\uFF1A' + title);
  });
}

function deleteCustomMaterial(key) {
  if (!confirm('\u522A\u9664\u6B64\u6559\u6750\uFF1F')) return;
  db.ref('users/' + currentUser.uid + '/customMaterials/' + key).remove();
}

function getMaterialTypeLabel(m) {
  if (!m) return '';
  if (m.url === '/classroom/presenter' && m.queryExtra) { return 'PPTX \u6295\u5F71\u7247'; }
  if (m.hasSlideControl && m.url !== '/classroom/presenter') { return 'HTML \u7C21\u5831'; }
  if (!m.hasSlideControl) { return '\u5916\u90E8\u9023\u7D50'; }
  return '\u6295\u5F71\u7247';
}

// ═══ Material opening with Firebase write ═══
function openMaterial(idx) {
  var m = materials[idx];
  if (!m) return;
  var url = m.hasSlideControl ? m.url + '?room=' + encodeURIComponent(roomId) + (m.queryExtra || '') : m.url;

  // Extract deckId from queryExtra if present
  var deckId = null;
  if (m.queryExtra) {
    var match = m.queryExtra.match(/deck=([^&]+)/);
    if (match) deckId = match[1];
  }

  // Write presentation state to Firebase so remote/student pages can sync
  if (roomId && m.hasSlideControl) {
    var deckType = deckId ? 'slides' : 'html';
    db.ref('rooms/' + roomId + '/presentation').set({
      mode: deckType,
      deck: deckId || m.url,
      current: 0,
      title: m.title,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }
  window.open(url, '_blank');
}

// ═══ Change Material (live phase) ═══
function showChangeMaterial() {
  var el = document.getElementById('mainContent');
  var all = getAllMaterials();
  var html = '<div style="max-width:600px;margin:1rem auto;padding:1rem">';
  html += '<h3 style="color:var(--gold);margin-bottom:1rem">\u66F4\u63DB\u6559\u6750</h3>';
  var hasBuiltin = all.some(function(m) { return m._builtin; });
  var hasCustom = all.some(function(m) { return m._custom; });
  if (hasBuiltin && hasCustom) { html += '<div class="mat-cat-header">\u2500\u2500 \u5167\u5EFA\u6559\u6750 \u2500\u2500</div>'; }
  all.forEach(function(m, idx) {
    if (hasBuiltin && hasCustom && m._custom && idx > 0 && all[idx - 1]._builtin) {
      html += '<div class="mat-cat-header">\u2500\u2500 \u6211\u7684\u6559\u6750 \u2500\u2500</div>';
    }
    html += '<div class="mat-radio" onclick="changeMaterialTo(' + idx + ')" style="cursor:pointer">';
    html += '<span class="mat-icon">' + m.icon + '</span>';
    html += '<div class="mat-info"><div class="mat-title">' + esc(m.title) + '</div><div class="mat-desc">' + (m.desc || '') + '</div></div>';
    html += '</div>';
  });
  html += '<button onclick="renderContent()" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--bg);color:var(--dim);border:1px solid var(--border);border-radius:8px;cursor:pointer">\u53D6\u6D88</button>';
  html += '</div>';
  el.innerHTML = html;
}

function changeMaterialTo(idx) {
  var all = getAllMaterials();
  var m = all[idx]; if (!m || !roomId) return;
  selectedMaterialIdx = idx;
  var deckId = null;
  if (m.queryExtra) { var match = m.queryExtra.match(/deck=([^&]+)/); if (match) deckId = match[1]; }
  if (m.hasSlideControl) {
    var deckType = deckId ? 'slides' : 'html';
    db.ref('rooms/' + roomId + '/presentation').set({ mode: deckType, deck: deckId || m.url, current: 0, title: m.title, ts: firebase.database.ServerValue.TIMESTAMP });
  }
  showNotification('success', '\u6559\u6750\u5DF2\u66F4\u63DB\uFF1A' + m.title);
  updateLiveStatusBar();
  renderContent();
}
