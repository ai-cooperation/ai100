// ClassClaw — settings
// Global settings: AI key, GAS URLs, Firebase-synced settings, service status

var DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxGE9i-742LPKD-zXcmfmzY4pt2UL8kbJgAI7kzEaQt3upYL1U55C-P_NHRWfUpLuj9FA/exec';

// ═══ Settings stored in Firebase users/{uid}/settings ═══
function loadSettingsFromFirebase() {
  if (!currentUser) return;
  db.ref('users/' + currentUser.uid + '/settings').once('value', function(snap) {
    var s = snap.val() || {};
    // Sync to localStorage (cache)
    if (s.aiKey) localStorage.setItem('_ai_key', s.aiKey);
    if (s.gasUrl) localStorage.setItem('_gas_url', s.gasUrl);
    if (s.backupUrl) localStorage.setItem('_gas_backup_url', s.backupUrl);
    // Update UI
    initGlobalSettingsUI();
    checkSettingsStatus();
  });
}

function saveSettingToFirebase(key, value) {
  if (!currentUser) return;
  var updates = {};
  updates['users/' + currentUser.uid + '/settings/' + key] = value || null;
  db.ref().update(updates);
}

function saveGlobalAIKey() {
  var k = document.getElementById('globalAIKey').value.trim();
  localStorage.setItem('_ai_key', k || '');
  if (!k) localStorage.removeItem('_ai_key');
  saveSettingToFirebase('aiKey', k);
  showNotification(k ? 'success' : 'info', k ? 'AI Key \u5DF2\u5132\u5B58' : 'AI Key \u5DF2\u6E05\u9664');
  checkSettingsStatus();
}

function saveGlobalGasUrl() {
  var u = document.getElementById('globalGasUrl').value.trim();
  localStorage.setItem('_gas_url', u || '');
  if (!u) localStorage.removeItem('_gas_url');
  saveSettingToFirebase('gasUrl', u);
  showNotification(u ? 'success' : 'info', u ? 'Email Relay \u5DF2\u5132\u5B58' : 'Email Relay \u5DF2\u6E05\u9664');
  checkSettingsStatus();
}

function saveGlobalBackupUrl() {
  var u = document.getElementById('globalBackupUrl').value.trim();
  localStorage.setItem('_gas_backup_url', u || '');
  if (!u) localStorage.removeItem('_gas_backup_url');
  saveSettingToFirebase('backupUrl', u);
  showNotification(u ? 'success' : 'info', u ? 'Sheets \u5099\u4EFD\u5DF2\u5132\u5B58' : 'Sheets \u5099\u4EFD\u5DF2\u6E05\u9664');
  checkSettingsStatus();
}

// ═══ Global Settings (lobby) ═══
function initGlobalSettings() {
  var k = localStorage.getItem('_ai_key');
  var g = localStorage.getItem('_gas_url') || DEFAULT_GAS_URL;
  if (k) document.getElementById('globalAIKey').value = k;
  document.getElementById('globalGasUrl').value = g;
  if (!localStorage.getItem('_gas_url')) localStorage.setItem('_gas_url', DEFAULT_GAS_URL);
  var b = localStorage.getItem('_gas_backup_url');
  if (b) document.getElementById('globalBackupUrl').value = b;
  checkSettingsStatus();
}

// Alias for loadSettingsFromFirebase callback
function initGlobalSettingsUI() {
  var k = localStorage.getItem('_ai_key');
  var g = localStorage.getItem('_gas_url') || DEFAULT_GAS_URL;
  if (k) document.getElementById('globalAIKey').value = k;
  document.getElementById('globalGasUrl').value = g;
  var b = localStorage.getItem('_gas_backup_url');
  if (b) document.getElementById('globalBackupUrl').value = b;
}

function checkSettingsStatus() {
  var aiKey = localStorage.getItem('_ai_key');
  var gasUrl = localStorage.getItem('_gas_url');
  var backupUrl = localStorage.getItem('_gas_backup_url');
  var dot1 = document.getElementById('settingDotAI');
  var dot2 = document.getElementById('settingDotGAS');
  var dot3 = document.getElementById('settingDotBackup');
  if (dot1) dot1.style.color = aiKey ? '#22c55e' : '#DC2626';
  if (dot2) dot2.style.color = gasUrl ? '#22c55e' : '#DC2626';
  if (dot3) dot3.style.color = backupUrl ? '#22c55e' : '#DC2626';
}

function checkServiceStatus() {
  var aiKey = localStorage.getItem('_ai_key');
  var gasUrl = localStorage.getItem('_gas_url');
  var aiDot = document.getElementById('statusDotAI');
  if (aiDot) aiDot.style.color = aiKey ? '#22c55e' : '#DC2626';
  var gasDot = document.getElementById('statusDotGAS');
  if (gasUrl) {
    fetch(gasUrl).then(function(r) { return r.json(); }).then(function(d) {
      if (gasDot) gasDot.style.color = d.status === 'ok' ? '#22c55e' : '#FFC857';
    }).catch(function() {
      if (gasDot) gasDot.style.color = '#DC2626';
    });
  } else if (gasDot) {
    gasDot.style.color = '#DC2626';
  }
}

// ═══ Room Settings ═══
function loadSettings() {
  db.ref('rooms/' + roomId + '/config/password').once('value').then(function(s) {
    var p = s.val();
    document.getElementById('chkPassword').checked = !!p;
    if (p) {
      document.getElementById('inputPassword').value = p;
      document.getElementById('inputPassword').classList.remove('hidden');
    }
  });
  if (!localStorage.getItem('_gas_url')) localStorage.setItem('_gas_url', DEFAULT_GAS_URL);
}

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
  document.getElementById('settingsOverlay').classList.toggle('show');
}

function savePassword() {
  var on = document.getElementById('chkPassword').checked;
  var pwd = document.getElementById('inputPassword').value.trim();
  if (on && !pwd) { showNotification('error', '\u8ACB\u8F38\u5165\u5BC6\u78BC'); return; }
  db.ref('rooms/' + roomId + '/config/password').set(on ? pwd : null).then(function() {
    showNotification('success', on ? '\u5BC6\u78BC\u5DF2\u8A2D\u5B9A' : '\u5BC6\u78BC\u5DF2\u95DC\u9589');
  });
}

function toggleAI() {
  if (!localStorage.getItem('_ai_key') && !aiEnabled) {
    showNotification('error', '\u8ACB\u5148\u5728\u5927\u5EF3\u5168\u57DF\u8A2D\u5B9A\u586B\u5165 Gemini API Key');
    return;
  }
  db.ref('rooms/' + roomId + '/config/aiEnabled').set(!aiEnabled);
}

function clearRoom() {
  if (!confirm('\u6E05\u9664\u6240\u6709\u4E92\u52D5\u8CC7\u6599\uFF1F')) return;
  db.ref('rooms/' + roomId).update({ wall: null, votes: null, currentVote: null, qa: null, qaUps: null, qaReplies: null });
}

// ═══ Test AI Key ═══
async function testAIKey() {
  var key = localStorage.getItem('_ai_key');
  var status = document.getElementById('globalAIKeyStatus');
  if (!key) { status.textContent = '\u274C \u8ACB\u5148\u586B\u5165 Key'; status.style.color = 'var(--red)'; return; }
  status.textContent = '\u23F3 \u6E2C\u8A66\u4E2D...'; status.style.color = 'var(--dim)';
  try {
    var model = 'gemini-2.5-pro', text = '';
    for (var mi = 0; mi < AI_MODELS.length; mi++) {
      var m = AI_MODELS[mi];
      var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: '\u8AAA\u300CAI\u52A9\u6559\u5DF2\u4E0A\u7DDA\u300D\u9019\u4E94\u500B\u5B57' }] }], generationConfig: { maxOutputTokens: 20 } })
      });
      if (res.status === 429) { continue; }
      if (!res.ok) throw new Error(m + ' HTTP ' + res.status);
      var data = await res.json();
      text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '(\u7121\u56DE\u61C9)';
      model = m; break;
    }
    if (!text) throw new Error('\u6240\u6709\u6A21\u578B 429');
    status.textContent = '\u2705 ' + model + '\uFF1A' + text.trim(); status.style.color = 'var(--pri)';
  } catch (e) {
    status.textContent = '\u274C \u5931\u6557\uFF1A' + e.message; status.style.color = 'var(--red)';
  }
}
