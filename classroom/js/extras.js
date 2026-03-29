// ClassClaw — extras
// Agent panel, push content, QR, deck label, overlay, screen share, voice aliases

// ═══ QR ═══
function makeQR(elId, url) {
  var el = document.getElementById(elId);
  if (!el) return;
  var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2 });
}

function toggleQR() {
  var url = location.origin + '/classroom/?room=' + encodeURIComponent(roomId);
  document.getElementById('qrUrl').textContent = url;
  var el = document.getElementById('qrBox'); var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4 });
  document.getElementById('qrOverlay').classList.toggle('show');
}

// ═══ Agent Panel ═══
function toggleAgentPanel() { document.getElementById('agentPanel').classList.toggle('open'); }

function initAgentPanel() {
  document.getElementById('agentCmdDisplay').textContent = 'python3 classroom_agent.py ' + roomId + ' --key YOUR_KEY --voice';
  var ref = db.ref('rooms/' + roomId + '/agentStatus');
  ref.on('value', function(s) {
    var d = s.val();
    var dot = document.getElementById('agentDot');
    var txt = document.getElementById('agentStatusText');
    var mods = document.getElementById('agentModules');
    var voiceCard = document.getElementById('agentVoiceCard');
    var voiceTxt = document.getElementById('agentVoiceText');
    var btnAgent = document.getElementById('btnAgent');
    var btnAgentTool = document.getElementById('btnAgentTool');
    if (d && d.online) {
      dot.classList.add('online');
      txt.textContent = (d.name || 'Agent') + ' \u5DF2\u4E0A\u7DDA';
      if (btnAgent) { btnAgent.style.background = 'var(--purple)'; btnAgent.style.color = '#fff'; btnAgent.style.borderColor = 'var(--purple)'; }
      if (btnAgentTool) { btnAgentTool.style.background = 'var(--purple)'; btnAgentTool.style.color = '#fff'; btnAgentTool.style.borderColor = 'var(--purple)'; }
      if (d.modules) { mods.innerHTML = d.modules.map(function(m) { return '<span class="ap-mod active">' + m + '</span>'; }).join(''); }
      if (d.voice !== undefined) {
        voiceCard.style.display = 'block';
        voiceTxt.textContent = d.voice ? '\u2705 \u5DF2\u9023\u7DDA jt-live-whisper' : '\u23F3 \u7B49\u5F85\u8A9E\u97F3\u9023\u7DDA...';
      }
    } else {
      dot.classList.remove('online');
      txt.textContent = '\u672A\u9023\u7DDA';
      if (btnAgent) { btnAgent.style.background = ''; btnAgent.style.color = ''; btnAgent.style.borderColor = ''; }
      if (btnAgentTool) { btnAgentTool.style.background = ''; btnAgentTool.style.color = ''; btnAgentTool.style.borderColor = ''; }
      mods.innerHTML = '';
      voiceCard.style.display = 'none';
    }
  });
  listeners.push({ ref: ref, event: 'value' });

  var advRef = db.ref('rooms/' + roomId + '/agentAdvice');
  advRef.on('value', function(s) {
    var d = s.val();
    var card = document.getElementById('agentAdviceCard');
    var txt = document.getElementById('agentAdviceText');
    if (d && d.text) {
      card.style.display = 'block';
      card.className = 'ap-card ' + (d.signals && d.signals.some(function(sg) { return sg === 'low_accuracy'; }) ? 'alert' : 'warn');
      txt.textContent = d.text;
    } else {
      card.style.display = 'none';
    }
  });
  listeners.push({ ref: advRef, event: 'value' });
}

// ═══ New Page Links ═══
function openPresenter() {
  var deckId = localStorage.getItem('_deck_' + roomId) || 'university-talk';
  window.open('/classroom/presenter?room=' + roomId + '&deck=' + deckId, '_blank');
}

function openSurvey() { window.open('/classroom/survey?room=' + roomId, '_blank'); }

function startFeedback() {
  if (confirm('\u5207\u63DB\u5230\u8AB2\u5F8C\u56DE\u994B\u6A21\u5F0F\uFF1F\u5B78\u54E1\u5C07\u770B\u5230\u56DE\u994B\u4ECB\u9762\u3002')) {
    db.ref('rooms/' + roomId + '/config/mode').set('feedback');
    window.open('/classroom/feedback?room=' + roomId, '_blank');
  }
}

// ═══ Push Content ═══
function showPushPanel() {
  var p = document.getElementById('pushPanel');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}

function hidePushPanel() {
  document.getElementById('pushPanel').style.display = 'none';
}

function sendPush() {
  if (!roomId) return;
  var type = document.getElementById('pushType').value;
  var title = document.getElementById('pushTitleInput').value.trim();
  var content = document.getElementById('pushContentInput').value.trim();
  if (!title || !content) { showNotification('error', '\u8ACB\u586B\u5BEB\u6A19\u984C\u548C\u5167\u5BB9'); return; }

  var pushData = { type: type, title: title, content: content, ts: firebase.database.ServerValue.TIMESTAMP };

  db.ref('rooms/' + roomId + '/pushContent/current').set(pushData);
  db.ref('rooms/' + roomId + '/pushContent/history').push(pushData);

  var log = document.getElementById('pushLogList');
  var icon = type === 'link' ? '\uD83D\uDD17' : type === 'prompt' ? '\uD83D\uDCDD' : type === 'data' ? '\uD83D\uDCCA' : '\uD83D\uDCAC';
  log.innerHTML = '<div style="padding:3px 0;border-bottom:1px solid #30363d;">' + icon + ' ' + title + '</div>' + log.innerHTML;

  document.getElementById('pushTitleInput').value = '';
  document.getElementById('pushContentInput').value = '';
}

function quickPush(type, title, content) {
  if (!roomId) return;
  var pushData = { type: type, title: title, content: content, ts: firebase.database.ServerValue.TIMESTAMP };
  db.ref('rooms/' + roomId + '/pushContent/current').set(pushData);
  db.ref('rooms/' + roomId + '/pushContent/history').push(pushData);

  var log = document.getElementById('pushLogList');
  var icon = type === 'link' ? '\uD83D\uDD17' : '\uD83D\uDCDD';
  log.innerHTML = '<div style="padding:3px 0;border-bottom:1px solid #30363d;">' + icon + ' ' + title + '</div>' + log.innerHTML;
}

function showFeedbackQROverlay() {
  if (!roomId) return;
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(roomId);
  document.getElementById('qrUrl').textContent = url;
  var el = document.getElementById('qrBox'); var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4 });
  document.getElementById('qrOverlay').classList.add('show');
}

function pushFeedbackQRToPresenter() {
  if (!roomId) return;
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(roomId);
  db.ref('rooms/' + roomId + '/overlay').set({ type: 'feedback-qr', show: true, data: { url: url } });
  showNotification('success', '\u5DF2\u63A8\u9001\u56DE\u994B QR \u5230\u7C21\u5831');
}

function pushFeedbackQRToStudents() {
  if (!roomId) return;
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(roomId);
  var data = { type: 'qr', title: '\u8AB2\u5F8C\u56DE\u994B\u554F\u5377', content: url, ts: firebase.database.ServerValue.TIMESTAMP };
  db.ref('rooms/' + roomId + '/pushContent/current').set(data);
  db.ref('rooms/' + roomId + '/pushContent/history').push(data);
  showNotification('success', '\u5DF2\u63A8\u9001\u56DE\u994B\u9023\u7D50\u7D66\u5B78\u54E1');
}

function pushClassroomQR() {
  if (!roomId) return;
  var url = location.origin + '/classroom/?room=' + encodeURIComponent(roomId);
  var data = { type: 'qr', title: '\u6559\u5BA4\u5165\u53E3', content: url, ts: firebase.database.ServerValue.TIMESTAMP };
  db.ref('rooms/' + roomId + '/pushContent/current').set(data);
  db.ref('rooms/' + roomId + '/pushContent/history').push(data);
  db.ref('rooms/' + roomId + '/overlay').set({ type: 'classroom-qr', show: true, data: { url: url } });
  showNotification('success', '\u5DF2\u63A8\u9001\u6559\u5BA4 QR');
}

// ═══ Agent Action Listener ═══
function initAgentActionListener() {
  if (!roomId) return;
  var ref = db.ref('rooms/' + roomId + '/agentActions/latest');
  ref.on('value', function(s) {
    var d = s.val();
    if (!d || !d.text) return;
    if (d.ts && Date.now() - d.ts < 10000) {
      showNotification('info', d.text);
    }
  });
  listeners.push({ ref: ref, event: 'value' });
}

// ═══ Current Deck Label ═══
window._currentDeckName = '';
window._currentDeckTitle = '';

function initDeckLabel() {
  if (!roomId) return;
  var ref = db.ref('rooms/' + roomId + '/presentation');
  ref.on('value', function(s) {
    var d = s.val();
    var label = document.getElementById('currentDeckLabel');
    if (d && d.deck) {
      var name = d.title || d.deck.replace(/_/g, ' ');
      label.textContent = '\uD83D\uDCDA ' + name;
      label.style.display = 'inline';
      window._currentDeckName = d.deck;
      window._currentDeckTitle = d.title || '';
      if (currentPhase === 'live') {
        var deckEl = document.getElementById('liveStatusDeck');
        if (deckEl) deckEl.textContent = '\uD83D\uDCDA ' + name;
        var pageEl = document.getElementById('liveStatusPage');
        if (pageEl && d.current !== undefined && d.totalSlides) {
          pageEl.textContent = '\u7B2C' + (d.current + 1) + '/' + d.totalSlides + '\u9801';
        }
      }
    } else {
      label.style.display = 'none';
      window._currentDeckName = '';
      window._currentDeckTitle = '';
    }
  });
  listeners.push({ ref: ref, event: 'value' });
}

// ═══ Voice Alias Map ═══
var VOICE_ALIASES = {
  '\u514D\u8CBB': '\u63A8 groq', '\u514D\u8CBB\u7684': '\u63A8 groq', '\u514D\u8CBB\u5E73\u53F0': '\u63A8 groq',
  'groove': '\u63A8 groq', 'grok': '\u63A8 groq', 'grow': '\u63A8 groq', 'groc': '\u63A8 groq',
  '\u5409\u4ED6': '\u63A8 github', 'get hub': '\u63A8 github', 'kit hub': '\u63A8 github',
  'chat gpt': '\u63A8 chatgpt', 'chat gbt': '\u63A8 chatgpt', '\u5DEE gpt': '\u63A8 chatgpt',
  '\u53E4\u5FB7': '\u63A8 claude', 'cloud': '\u63A8 claude', '\u53EF\u6A02\u7684': '\u63A8 claude',
  'ai studio': '\u63A8 gemini', 'ai \u5DE5\u4F5C\u5BA4': '\u63A8 gemini',
  '\u8A66\u7B97\u8868': '\u63A8 sheet', '\u65B0\u8868\u683C': '\u63A8 sheet',
  '\u53CD\u91CD\u529B': '\u63A8 antigravity',
  '\u7B2C\u4E00\u8AB2': '\u6559\u6750 s01', '\u7B2C\u4E8C\u8AB2': '\u6559\u6750 s02', '\u7B2C\u4E09\u8AB2': '\u6559\u6750 s03', '\u7B2C\u56DB\u8AB2': '\u6559\u6750 s04', '\u7B2C\u4E94\u8AB2': '\u6559\u6750 s05',
  '\u7B2C\u4E00\u55AE\u5143': '\u6559\u6750 s01', '\u7B2C\u4E8C\u55AE\u5143': '\u6559\u6750 s02', '\u7B2C\u4E09\u55AE\u5143': '\u6559\u6750 s03', '\u7B2C\u56DB\u55AE\u5143': '\u6559\u6750 s04', '\u7B2C\u4E94\u55AE\u5143': '\u6559\u6750 s05'
};

function applyVoiceAlias(text) {
  var t = text.trim().toLowerCase();
  if (VOICE_ALIASES[t]) return VOICE_ALIASES[t];
  for (var key in VOICE_ALIASES) {
    if (VOICE_ALIASES.hasOwnProperty(key) && t.indexOf(key) !== -1) return VOICE_ALIASES[key];
  }
  return text;
}
