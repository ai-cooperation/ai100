// ClassClaw — live
// Wall, Vote, QA, mode switching, AI listener, voice control

// ═══ AI Listener (batched: collect 10s, respond once) ═══
var aiBatchWall = [], aiBatchQa = [], aiBatchTimer = null;
var AI_BATCH_INTERVAL = 10000;
var AI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

function startAIListener() {
  var aiReady = false;
  setTimeout(function() { aiReady = true; console.log('[AI] listener ready'); }, 3000);

  db.ref('rooms/' + roomId + '/wall').on('child_added', function(s) {
    if (!aiReady || !aiEnabled) return;
    var d = s.val();
    if (d.role === 'ai' || d.role === 'teacher') return;
    aiBatchWall.push({ text: d.text, name: d.name });
    scheduleAIBatch();
  });
  db.ref('rooms/' + roomId + '/qa').on('child_added', function(s) {
    if (!aiReady || !aiEnabled) return;
    var d = s.val();
    if (d.role === 'ai' || d.role === 'teacher') return;
    aiBatchQa.push({ text: d.text, name: d.name, id: s.key });
    scheduleAIBatch();
  });
}

function scheduleAIBatch() {
  if (aiBatchTimer) return;
  console.log('[AI] batch scheduled, waiting 10s...');
  aiBatchTimer = setTimeout(function() {
    aiBatchTimer = null;
    processAIBatch();
  }, AI_BATCH_INTERVAL);
}

async function processAIBatch() {
  var wallItems = [].concat(aiBatchWall), qaItems = [].concat(aiBatchQa);
  aiBatchWall = []; aiBatchQa = [];
  if (!wallItems.length && !qaItems.length) return;
  var apiKey = localStorage.getItem('_ai_key');
  if (!apiKey) return;

  console.log('[AI] processing batch: ' + wallItems.length + ' wall, ' + qaItems.length + ' qa');
  document.getElementById('aiStatus').style.display = 'block';
  document.getElementById('aiError').style.display = 'none';

  try {
    if (wallItems.length) {
      var prompt = '\u4EE5\u4E0B\u662F\u5B78\u54E1\u5728\u8A0A\u606F\u7246\u7684\u65B0\u8A0A\u606F\uFF1A\n\n';
      wallItems.forEach(function(m) { prompt += m.name + '\uFF1A' + m.text + '\n'; });
      prompt += '\n\u8ACB\u7528\u4E00\u5247\u56DE\u8986\u7D71\u4E00\u56DE\u61C9\u3002\u53EF\u4EE5\u5206\u6BB5\u56DE\u61C9\u4E0D\u540C\u4EBA\u3002\u5982\u679C\u5168\u90E8\u90FD\u662F\u4E0D\u9700\u8981\u56DE\u7B54\u7684\u9592\u804A\uFF0C\u56DE [SKIP]\u3002';
      var answer = await callGemini(apiKey, prompt);
      if (answer && !answer.includes('[SKIP]')) {
        await db.ref('rooms/' + roomId + '/wall').push({ text: answer.trim(), name: 'AI \u52A9\u6559', role: 'ai', ts: firebase.database.ServerValue.TIMESTAMP });
      }
    }

    if (qaItems.length) {
      for (var qi = 0; qi < qaItems.length; qi++) {
        var q = qaItems[qi];
        var prompt2 = '\u5B78\u54E1 ' + q.name + ' \u63D0\u554F\uFF1A' + q.text + '\n\n\u8ACB\u56DE\u7B54\u9019\u500B\u554F\u984C\u3002\u5982\u679C\u4E0D\u9700\u8981\u56DE\u7B54\uFF0C\u56DE [SKIP]\u3002';
        var answer2 = await callGemini(apiKey, prompt2);
        if (answer2 && !answer2.includes('[SKIP]')) {
          await db.ref('rooms/' + roomId + '/qaReplies/' + q.id).push({ text: answer2.trim(), name: 'AI \u52A9\u6559', role: 'ai', ts: firebase.database.ServerValue.TIMESTAMP });
        }
      }
    }
    console.log('[AI] batch posted');
  } catch (e) {
    console.error('[AI] batch error:', e);
    var errEl = document.getElementById('aiError');
    errEl.textContent = 'AI \u932F\u8AA4\uFF1A' + e.message; errEl.style.display = 'block';
    setTimeout(function() { errEl.style.display = 'none'; }, 5000);
  }
  document.getElementById('aiStatus').style.display = 'none';
}

async function buildContext() {
  var wallSnap = await db.ref('rooms/' + roomId + '/wall').orderByChild('ts').limitToLast(100).once('value');
  var qaSnap = await db.ref('rooms/' + roomId + '/qa').orderByChild('ts').limitToLast(50).once('value');
  var repliesSnap = await db.ref('rooms/' + roomId + '/qaReplies').once('value');
  var presSnap = await db.ref('rooms/' + roomId + '/presence').once('value');
  var studentCount = presSnap.numChildren();
  var replies = repliesSnap.val() || {};

  var ctx = '\u3010\u6559\u5BA4\u72C0\u6CC1\u3011' + studentCount + ' \u4F4D\u5B78\u54E1\u5728\u7DDA\n\n';

  var msgs = [];
  wallSnap.forEach(function(c) { msgs.push(c.val()); });
  if (msgs.length) {
    ctx += '\u3010\u6700\u8FD1\u7684\u8A0A\u606F\u7246\u5C0D\u8A71\u3011\n';
    msgs.forEach(function(m) {
      var role = m.role === 'teacher' ? '\uD83D\uDC68\u200D\uD83C\uDFEB\u8001\u5E2B' : m.role === 'ai' ? '\uD83E\uDD16AI\u52A9\u6559' : '\u5B78\u54E1' + m.name;
      ctx += role + '\uFF1A' + m.text + '\n';
    });
    ctx += '\n';
  }

  var qas = [];
  qaSnap.forEach(function(c) { qas.push({ id: c.key, text: c.val().text, name: c.val().name, ups: c.val().ups }); });
  if (qas.length) {
    ctx += '\u3010\u5B78\u54E1\u63D0\u554F\u5340\u3011\n';
    qas.forEach(function(q) {
      ctx += '[' + (q.ups || 0) + '\u7968] ' + q.name + '\u554F\uFF1A' + q.text + '\n';
      var r = replies[q.id];
      if (r) Object.values(r).forEach(function(rp) { ctx += '  \u2192 ' + (rp.role === 'teacher' ? '\u8001\u5E2B' : 'AI') + '\u56DE\u8986\uFF1A' + rp.text + '\n'; });
    });
  }
  return ctx;
}

async function callGemini(apiKey, question) {
  var context = await buildContext();
  var sysPrompt = '\u4F60\u662F\u300C\u5C0F\u52A9\u300D\uFF0C' + (currentUser.displayName || '\u8001\u5E2B') + '\u7684\u8AB2\u5802 AI \u52A9\u6559\u3002\u8AB2\u7A0B\uFF1A' + roomTitle + '\u3002\n\n\u4F60\u7684\u98A8\u683C\u50CF\u4E00\u500B\u5F88\u6703\u6559\u7684\u5B78\u9577\u59D0 \u2014 \u71B1\u60C5\u3001\u5E7D\u9ED8\u3001\u6709\u6599\u3002\u4F60\u6703\u7528\u6BD4\u55BB\u3001\u8209\u751F\u6D3B\u5316\u7684\u4F8B\u5B50\u3001\u751A\u81F3\u958B\u500B\u5C0F\u73A9\u7B11\u8B93\u8AB2\u5802\u6C23\u6C1B\u6D3B\u6F51\u3002\u4F60\u4E0D\u662F\u7DAD\u57FA\u767E\u79D1\uFF0C\u4F60\u662F\u4E00\u500B\u6709\u6EAB\u5EA6\u7684\u52A9\u6559\u3002\n\n\u56DE\u7B54\u6642\uFF1A\n- \u5148\u80AF\u5B9A\u63D0\u554F\uFF08\u300C\u597D\u554F\u984C\uFF01\u300D\u300C\u9019\u500B\u5F88\u591A\u4EBA\u641E\u6DF7\u300D\u300C\u54E6\u9019\u984C\u6709\u610F\u601D\u300D\uFF09\n- \u7528\u767D\u8A71\u6587\u89E3\u91CB\uFF0C\u50CF\u8DDF\u670B\u53CB\u804A\u5929\u4E00\u6A23\n- \u8209\u5177\u9AD4\u4F8B\u5B50\u6216\u6BD4\u55BB\uFF08\u300C\u60F3\u50CF\u4F60\u5728\u9EDE\u5916\u9001...\u300D\u300C\u5C31\u50CF\u4F60\u7528 Google Maps...\u300D\uFF09\n- \u5982\u679C\u5C0D\u8A71\u7D00\u9304\u88E1\u8001\u5E2B\u525B\u8B1B\u904E\u76F8\u95DC\u7684\uFF0C\u5F15\u7528\u8001\u5E2B\u7684\u8A71\uFF08\u300C\u525B\u525B\u8001\u5E2B\u6709\u63D0\u5230...\u300D\uFF09\n- \u5982\u679C\u591A\u4EBA\u554F\u985E\u4F3C\u554F\u984C\uFF0C\u6B78\u7D0D\u8D77\u4F86\u4E00\u8D77\u7B54\n- \u56DE\u7B54\u5B8C\u53EF\u4EE5\u53CD\u554F\u4E00\u53E5\u5E36\u52D5\u4E92\u52D5\uFF08\u300C\u5927\u5BB6\u89BA\u5F97\u5462\uFF1F\u300D\u300C\u6709\u6C92\u6709\u4EBA\u9047\u904E\u985E\u4F3C\u7684\uFF1F\u300D\uFF09\n\n\u9577\u5EA6\uFF1A\u653E\u5FC3\u5BEB\uFF0C200-500\u5B57\u90FD\u53EF\u4EE5\uFF0C\u91CD\u8981\u7684\u662F\u8B1B\u6E05\u695A\u3001\u8B1B\u5F97\u6709\u8DA3\u3002\u4E0D\u8981\u60DC\u5B57\u5982\u91D1\u3002\n\n\u53EA\u6709\u4E00\u7A2E\u60C5\u6CC1\u56DE [SKIP]\uFF1A\u8A0A\u606F\u5B8C\u5168\u4E0D\u9700\u8981\u56DE\u61C9\uFF08\u7D14\u7CB9\u7684\u300COK\u300D\u300C\u6536\u5230\u300D\u300C+1\u300D\u300C\u54C8\u54C8\u300D\uFF09\u3002\u5176\u4ED6\u90FD\u76E1\u91CF\u56DE\u61C9\uFF0C\u54EA\u6015\u53EA\u662F\u63A5\u500B\u8A71\u804A\u5169\u53E5\u3002\n\n\u7528\u7E41\u9AD4\u4E2D\u6587\u3002\n\n\u4EE5\u4E0B\u662F\u76EE\u524D\u6559\u5BA4\u7684\u5C0D\u8A71\u7D00\u9304\uFF0C\u8B93\u4F60\u4E86\u89E3\u4E0A\u8AB2\u8108\u7D61\uFF1A\n' + context;

  for (var mi = 0; mi < AI_MODELS.length; mi++) {
    var model = AI_MODELS[mi];
    console.log('[AI] trying ' + model + '...');
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: [{ parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.9 }
      })
    });
    if (res.status === 429) { console.log('[AI] ' + model + ' 429, fallback...'); continue; }
    if (!res.ok) { var err = await res.text(); throw new Error(model + ' HTTP ' + res.status + ': ' + err.slice(0, 100)); }
    var data = await res.json();
    var answer = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : null;
    console.log('[AI] ' + model + ' response:', (answer || '').slice(0, 50));
    return answer;
  }
  throw new Error('\u6240\u6709\u6A21\u578B\u90FD\u8D85\u904E\u901F\u7387\u9650\u5236\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66');
}

async function handleAIRequest(question, source, qaId) {
  var apiKey = localStorage.getItem('_ai_key');
  if (!apiKey || !question) { console.log('[AI] skip: no key or empty question'); return; }
  document.getElementById('aiStatus').style.display = 'block';
  document.getElementById('aiError').style.display = 'none';
  try {
    var answer = await callGemini(apiKey, question);
    if (!answer || answer.trim() === '[SKIP]' || answer.includes('[SKIP]')) { document.getElementById('aiStatus').style.display = 'none'; return; }
    if (source === 'wall') {
      await db.ref('rooms/' + roomId + '/wall').push({ text: answer, name: 'AI \u52A9\u6559', role: 'ai', ts: firebase.database.ServerValue.TIMESTAMP });
    } else if (source === 'qa' && qaId) {
      await db.ref('rooms/' + roomId + '/qaReplies/' + qaId).push({ text: answer, name: 'AI \u52A9\u6559', role: 'ai', ts: firebase.database.ServerValue.TIMESTAMP });
    }
    console.log('[AI] response posted');
  } catch (e) {
    console.error('[AI] error:', e);
    var errEl = document.getElementById('aiError');
    errEl.textContent = 'AI \u932F\u8AA4\uFF1A' + e.message; errEl.style.display = 'block';
    setTimeout(function() { errEl.style.display = 'none'; }, 5000);
  }
  document.getElementById('aiStatus').style.display = 'none';
}

// ═══ Mode ═══
function setMode(m) { db.ref('rooms/' + roomId + '/config/mode').set(m); }
function renderContent() {
  listeners.forEach(function(l) { l.ref.off(l.event); }); listeners = [];
  var el = document.getElementById('mainContent');
  document.getElementById('hostWallBar').classList.toggle('hidden', currentMode !== 'wall');
  if (currentMode === 'wall') renderWall(el);
  else if (currentMode === 'vote') renderVoteHost(el);
  else if (currentMode === 'qa') renderQA(el);
  else if (currentMode === 'info') renderInfo(el);
  else if (currentMode === 'feedback') el.innerHTML = '<div class="pause-display"><div class="icon" style="animation:none">\uD83D\uDCAC</div><p style="color:var(--purple);margin-top:1rem;font-weight:700">\u8AB2\u5F8C\u56DE\u994B\u9032\u884C\u4E2D</p><p style="color:var(--dim);font-size:0.85rem;margin-top:0.5rem">\u5B78\u54E1\u6B63\u5728\u9032\u884C AI \u5C0D\u8A71\u5F0F\u56DE\u994B</p><button class="act-btn" style="margin-top:1rem" onclick="window.open(\'/classroom/feedback?room=\'+roomId,\'_blank\')">\u67E5\u770B\u56DE\u994B\u9801</button></div>';
  else el.innerHTML = '<div class="pause-display"><div class="icon">\u23F8</div><p style="color:var(--dim);margin-top:1rem">\u5B78\u54E1\u770B\u5230\u300C\u8001\u5E2B\u6E96\u5099\u4E2D\u300D</p></div>';
}

// ═══ Wall ═══
function renderWall(el) {
  el.innerHTML = '';
  var ref = db.ref('rooms/' + roomId + '/wall').orderByChild('ts').limitToLast(200);
  ref.on('child_added', function(s) {
    var d = s.val(), r = d.role || 'student';
    var div = document.createElement('div'); div.className = 'wall-msg ' + r;
    var icon = r === 'ai' ? '\uD83E\uDD16 ' : r === 'teacher' ? '\uD83D\uDC68\u200D\uD83C\uDFEB ' : '';
    div.innerHTML = '<span class="wm-name ' + r + '">' + icon + esc(d.name) + '</span> <span class="wm-time">' + timeStr(d.ts) + '</span><div class="wm-text">' + esc(d.text) + '</div>';
    el.appendChild(div); el.scrollTop = el.scrollHeight;
  });
  listeners.push({ ref: ref, event: 'child_added' });
}

function sendTeacherWall() {
  var i = document.getElementById('hostWallText'), t = i.value.trim();
  if (!t) return; i.value = '';
  db.ref('rooms/' + roomId + '/wall').push({ text: t, name: currentUser.displayName || '\u8001\u5E2B', role: 'teacher', ts: firebase.database.ServerValue.TIMESTAMP });
}

// ═══ Vote ═══
function renderVoteHost(el) {
  var ref = db.ref('rooms/' + roomId + '/currentVote');
  ref.on('value', function(s) { s.val() ? renderVR(el, s.val()) : renderVF(el); });
  listeners.push({ ref: ref, event: 'value' });
}

function renderVR(el, data) {
  var id = data.id, opts = data.options || [];
  var ref = db.ref('rooms/' + roomId + '/votes/' + id);
  ref.on('value', function(s) {
    var R = s.val() || {}, C = {}, T = 0;
    opts.forEach(function(_, i) { C[i] = 0; });
    Object.values(R).forEach(function(v) { if (typeof v === 'number') { C[v] = (C[v] || 0) + 1; T++; } });
    var mx = Math.max.apply(null, Object.values(C).concat([1]));
    var h = '<div class="vote-panel"><div class="vote-q">' + esc(data.question) + '</div>';
    opts.forEach(function(o, i) {
      var p = T ? Math.round(C[i] / T * 100) : 0, w = Math.round(C[i] / mx * 100);
      h += '<div class="vote-row"><div class="vote-label">' + esc(o) + '</div><div class="vote-bar-outer"><div class="vote-bar-fill" style="width:' + w + '%;background:' + VC[i % 6] + '"><span>' + p + '%</span></div></div><div class="vote-count">' + C[i] + '</div></div>';
    });
    h += '<div class="vote-total">\u5171 ' + T + ' \u4EBA</div><div style="text-align:center;margin-top:1rem"><button class="act-btn" onclick="endVote()" style="padding:0.5rem 1.5rem">\u7D50\u675F\u6295\u7968</button></div></div>';
    el.innerHTML = h;
  });
  listeners.push({ ref: ref, event: 'value' });
}

function renderVF(el) { voteOpts = ['', '']; el.innerHTML = buildVF(); }
function buildVF() {
  var h = '<div class="vote-form"><h3>\u5EFA\u7ACB\u65B0\u6295\u7968</h3><input type="text" id="voteQuestion" placeholder="\u554F\u984C">';
  voteOpts.forEach(function(o, i) {
    h += '<div class="opt-row"><input type="text" class="voi" data-idx="' + i + '" placeholder="\u9078\u9805' + (i + 1) + '" value="' + esc(o) + '" oninput="voteOpts[' + i + ']=this.value">' + (voteOpts.length > 2 ? '<button onclick="removeOpt(' + i + ')">\u2715</button>' : '<button style="visibility:hidden">\u2715</button>') + '</div>';
  });
  return h + '<button class="btn-add-opt" onclick="addOpt()">+ \u65B0\u589E</button><button class="btn-start-vote" onclick="startVote()">\u958B\u59CB\u6295\u7968</button></div>';
}
function addOpt() { voteOpts.push(''); document.getElementById('mainContent').innerHTML = buildVF(); }
function removeOpt(i) { voteOpts.splice(i, 1); document.getElementById('mainContent').innerHTML = buildVF(); }
function startVote() {
  document.querySelectorAll('.voi').forEach(function(i) { voteOpts[+i.dataset.idx] = i.value; });
  var q = document.getElementById('voteQuestion').value.trim(), o = voteOpts.map(function(x) { return x.trim(); }).filter(function(x) { return x; });
  if (!q || o.length < 2) { showNotification('error', '\u9700\u8981\u554F\u984C\u548C\u81F3\u5C11\u5169\u500B\u9078\u9805'); return; }
  db.ref('rooms/' + roomId + '/currentVote').set({ question: q, options: o, id: 'v' + Date.now() });
}
function endVote() { db.ref('rooms/' + roomId + '/currentVote').remove(); }

// ═══ QA ═══
function renderQA(el) {
  el.innerHTML = '';
  var ref = db.ref('rooms/' + roomId + '/qa');
  ref.on('value', function(snap) {
    var items = [];
    snap.forEach(function(c) { items.push({ id: c.key, text: c.val().text, name: c.val().name, ts: c.val().ts, ups: c.val().ups, role: c.val().role }); });
    items.sort(function(a, b) { return (b.ups || 0) - (a.ups || 0); });

    if (!items.length) { el.innerHTML = '<div class="pause-display"><p style="color:var(--dim)">\u7B49\u5F85\u5B78\u54E1\u63D0\u554F...</p></div>'; return; }
    db.ref('rooms/' + roomId + '/qaReplies').once('value').then(function(rs) {
      var allR = rs.val() || {};
      el.innerHTML = items.map(function(q) {
        var replies = allR[q.id] ? Object.values(allR[q.id]).sort(function(a, b) { return a.ts - b.ts; }) : [];
        var rh = replies.map(function(r) { return '<div class="qa-reply ' + r.role + '"><div class="rp-name ' + r.role + '">' + (r.role === 'ai' ? '\uD83E\uDD16 AI' : '\uD83D\uDC68\u200D\uD83C\uDFEB ' + (r.name || '\u8001\u5E2B')) + '</div>' + esc(r.text) + '</div>'; }).join('');
        return '<div class="qa-card"><div class="qa-top"><div class="qa-votes"><div class="num">' + (q.ups || 0) + '</div><div class="lbl">\u7968</div></div>' +
          '<div style="flex:1"><div class="q-text">' + esc(q.text) + '</div><div class="q-meta">' + esc(q.name) + ' \u00B7 ' + timeStr(q.ts) + '</div><button class="btn-reply" onclick="showReply(\'' + q.id + '\')">\u56DE\u8986</button></div>' +
        '</div>' + (rh ? '<div class="qa-replies">' + rh + '</div>' : '') + '<div class="reply-box hidden" id="rb-' + q.id + '"><input id="ri-' + q.id + '" placeholder="\u56DE\u8986..." onkeydown="if(event.key===\'Enter\')replyQ(\'' + q.id + '\')"><button onclick="replyQ(\'' + q.id + '\')">\u9001\u51FA</button></div></div>';
      }).join('');
    });
  });
  listeners.push({ ref: ref, event: 'value' });
}

function showReply(qid) { document.getElementById('rb-' + qid).classList.toggle('hidden'); document.getElementById('ri-' + qid).focus(); }
function replyQ(qid) {
  var i = document.getElementById('ri-' + qid), t = i.value.trim();
  if (!t) return; i.value = '';
  db.ref('rooms/' + roomId + '/qaReplies/' + qid).push({ text: t, name: currentUser.displayName || '\u8001\u5E2B', role: 'teacher', ts: firebase.database.ServerValue.TIMESTAMP });
}
var replyToQA = replyQ;

// ═══ Info/Materials ═══
function renderInfoPanel() {
  var studentUrl = location.origin + '/classroom/?room=' + encodeURIComponent(roomId);
  var remoteUrl = location.origin + '/classroom/remote?room=' + encodeURIComponent(roomId);
  var html = '<div class="info-panel">' +
    '<div class="info-card"><h3>\uD83D\uDCF1 \u5B78\u54E1 QR Code</h3><div class="qr-small" id="qrStudent"></div><div class="url-text">' + studentUrl + '</div></div>' +
    '<div class="info-card"><h3>\uD83C\uDFAE \u8001\u5E2B\u624B\u6A5F\u9059\u63A7</h3><div class="qr-small" id="qrRemote"></div><div class="url-text">' + remoteUrl + '</div></div>' +
  '</div>';
  html += '<div class="mat-list"><h3 style="font-size:0.85rem;color:var(--pri);margin-bottom:0.5rem">\u6559\u6750\uFF08\u9EDE\u64CA\u5728\u65B0\u8996\u7A97\u958B\u555F\uFF0C\u81EA\u52D5\u9023\u7D50\u9059\u63A7\uFF09</h3>';
  materials.forEach(function(m, idx) {
    html += '<div class="mat-item" onclick="openMaterial(' + idx + ')"><span class="mat-icon">' + m.icon + '</span><span class="mat-title">' + m.title + '</span><span class="mat-open">\u958B\u555F \u2197</span></div>';
  });
  html += '</div>';
  return html;
}

// ═══ Voice Control ═══
var voiceRecognition = null;
var voiceActive = false;

function toggleVoice() {
  if (voiceActive) { stopVoice(); return; }

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showNotification('error', '\u6B64\u700F\u89BD\u5668\u4E0D\u652F\u63F4\u8A9E\u97F3\u8FA8\u8B58\uFF0C\u8ACB\u7528 Chrome'); return; }

  voiceRecognition = new SR();
  voiceRecognition.lang = 'zh-TW';
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;

  voiceRecognition.onstart = function() {
    voiceActive = true;
    document.getElementById('btnVoice').style.background = 'var(--red)';
    document.getElementById('btnVoice').style.color = '#fff';
    document.getElementById('btnVoice').style.borderColor = 'var(--red)';
    document.getElementById('voiceStatus').style.display = 'inline';
    document.getElementById('voiceStatus').textContent = '\uD83D\uDD34 \u76E3\u807D\u4E2D...';
  };

  voiceRecognition.onresult = function(e) {
    for (var i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        var text = e.results[i][0].transcript.trim();
        if (text.length < 2) continue;

        var processed = applyVoiceAlias(text);
        console.log('[voice]', text, processed !== text ? '\u2192 ' + processed : '');
        document.getElementById('voiceStatus').textContent = '\uD83C\uDFA4 ' + (processed !== text ? processed + ' (' + text + ')' : text);

        if (roomId) {
          db.ref('rooms/' + roomId + '/voiceCommands').push({
            text: processed,
            ts: firebase.database.ServerValue.TIMESTAMP
          });
        }
      }
    }
  };

  voiceRecognition.onerror = function(e) {
    console.error('[voice] error:', e.error);
    if (e.error === 'not-allowed') {
      showNotification('error', '\u8ACB\u5141\u8A31\u9EA5\u514B\u98A8\u6B0A\u9650');
      stopVoice();
    }
  };

  voiceRecognition.onend = function() {
    if (voiceActive) {
      setTimeout(function() { try { voiceRecognition.start(); } catch (e) {} }, 300);
    }
  };

  try {
    voiceRecognition.start();
  } catch (e) {
    showNotification('error', '\u7121\u6CD5\u555F\u52D5\u8A9E\u97F3\uFF1A' + e.message);
  }
}

function stopVoice() {
  voiceActive = false;
  if (voiceRecognition) { try { voiceRecognition.stop(); } catch (e) {} }
  document.getElementById('btnVoice').style.background = '';
  document.getElementById('btnVoice').style.color = '';
  document.getElementById('btnVoice').style.borderColor = '';
  document.getElementById('voiceStatus').style.display = 'none';
}
