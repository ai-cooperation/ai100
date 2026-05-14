// ClassClaw — room
// enterRoom, backToLobby, room listeners, phase management, preparing/post rendering

function enterRoom(rid, title, phaseOverride) {
  roomId = rid; roomTitle = title || rid;
  roomCourseId = null; roomSessionId = null; roomDeck = null; roomDeckType = null;
  selectedMaterialIdx = null;
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('dash').classList.add('active');
  document.getElementById('dispRoom').textContent = roomTitle;
  loadSettings();
  // Read room config for planner integration and phase detection
  db.ref('rooms/' + roomId + '/config').once('value', function(s) {
    var cfg = s.val() || {};
    roomCourseId = cfg.courseId || null;
    roomSessionId = cfg.sessionId || null;
    roomDeck = cfg.deck || null;
    roomDeckType = cfg.deckType || null;

    // Sync presentation with config deck
    if (roomDeck) {
      db.ref('rooms/' + roomId + '/presentation').once('value', function(presSnap) {
        var pres = presSnap.val() || {};
        if (pres.deck !== roomDeck) {
          var deckTitle = roomDeck.replace(/_/g, ' ');
          deckOptions.forEach(function(d) { if (d.name === roomDeck) deckTitle = d.label; });
          db.ref('rooms/' + roomId + '/presentation').update({
            deck: roomDeck,
            title: deckTitle,
            mode: roomDeckType || 'slides',
            ts: firebase.database.ServerValue.TIMESTAMP
          });
        }
      });
    }

    // Unified entry: default to the prepare phase. live / post-class are only
    // shown when an explicit phaseOverride asks for them (the course-view phase
    // cards), so no entry door can strand the teacher on a dead-end phase.
    var status = phaseOverride || 'preparing';
    if (status === 'live') {
      showPhase('live');
    } else if (status === 'post-class' || status === 'completed') {
      showPhase('post-class');
    } else {
      showPhase('preparing');
    }
  });
  // Online
  db.ref('rooms/' + roomId + '/presence').on('value', function(s) { document.getElementById('dispOnline').textContent = s.numChildren() + ' \u4EBA'; });
  // Mode
  var lastMode = null;
  db.ref('rooms/' + roomId + '/config/mode').on('value', function(s) {
    var m = s.val() || 'wall';
    if (m === lastMode) return; lastMode = m; currentMode = m;
    document.querySelectorAll('.mode-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === m); });
    document.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === m); });
    if (currentPhase === 'live') {
      renderContent();
      updateLiveStatusBar();
    }
  });
  // AI
  db.ref('rooms/' + roomId + '/config/aiEnabled').on('value', function(s) {
    aiEnabled = !!s.val();
    var btnAITool = document.getElementById('btnAITool');
    if (btnAITool) {
      btnAITool.textContent = aiEnabled ? 'AI\u52A9\u6559 ON' : 'AI\u52A9\u6559 OFF';
      btnAITool.classList.toggle('ai-on', aiEnabled);
    }
    var btnAI = document.getElementById('btnAI');
    if (btnAI) {
      btnAI.classList.toggle('ai-on', aiEnabled);
      btnAI.textContent = aiEnabled ? '\uD83E\uDD16ON' : '\uD83E\uDD16';
    }
  });
  // Keyboard
  document.getElementById('hostWallText').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); sendTeacherWall(); } });
  // Check service status
  checkServiceStatus();
  // Start AI listener
  startAIListener();
  // Start Agent panel
  initAgentPanel();
  // Start deck label + action toast
  initDeckLabel();
  initAgentActionListener();
}

function backToLobby() {
  listeners.forEach(function(l) { l.ref.off(l.event); }); listeners = [];
  db.ref('rooms/' + roomId).off();
  document.getElementById('dash').classList.remove('active');

  if (cvFromCourse && cvCourseId) {
    cvFromCourse = false;
    document.getElementById('courseView').classList.add('active');
    renderSessionList();
  } else {
    document.getElementById('lobby').classList.add('active');
  }

  document.getElementById('phasePrepare').classList.remove('active');
  document.getElementById('phaseLive').classList.remove('active');
  document.getElementById('phasePost').classList.remove('active');
  roomId = ''; roomCourseId = null; roomSessionId = null; roomDeck = null; roomDeckType = null;
  selectedMaterialIdx = null;
  currentPhase = 'preparing';
  if (voiceActive) stopVoice();
}

// ═══ Phase Management ═══
function showPhase(phase) {
  currentPhase = phase;
  document.getElementById('phasePrepare').classList.toggle('active', phase === 'preparing');
  document.getElementById('phaseLive').classList.toggle('active', phase === 'live');
  document.getElementById('phasePost').classList.toggle('active', phase === 'post-class');

  var btnBack = document.getElementById('btnBack');
  var btnVoice = document.getElementById('btnVoice');
  var voiceStatus = document.getElementById('voiceStatus');

  if (phase === 'preparing') {
    btnBack.textContent = cvFromCourse ? '\u2190 \u8FD4\u56DE\u8AB2\u7A0B' : '\u2190 \u8FD4\u56DE\u5927\u5EF3';
    btnVoice.style.display = 'none';
    voiceStatus.style.display = 'none';
    renderPreparingPhase();
  } else if (phase === 'live') {
    btnBack.textContent = cvFromCourse ? '\u2190 \u8FD4\u56DE\u8AB2\u7A0B' : '\u2190 \u8FD4\u56DE';
    btnVoice.style.display = '';
    renderContent();
    updateLiveStatusBar();
  } else if (phase === 'post-class') {
    btnBack.textContent = cvFromCourse ? '\u2190 \u8FD4\u56DE\u8AB2\u7A0B' : '\u2190 \u8FD4\u56DE\u5927\u5EF3';
    btnVoice.style.display = 'none';
    voiceStatus.style.display = 'none';
    renderPostClassPhase();
  }
}

// ═══ Preparing Phase Rendering ═══
function renderPreparingPhase() {
  var list = document.getElementById('prepareMaterialList');
  var all = getAllMaterials();
  var sessionMat = getSessionMaterial();
  var html = '';
  // The session may already have a deck chosen at creation time \u2014 show it first,
  // pre-selected, so the teacher isn't forced to re-pick from the library.
  if (sessionMat) {
    if (selectedMaterialIdx === null) selectedMaterialIdx = 'session';
    var ssel = selectedMaterialIdx === 'session';
    html += '<div class="mat-cat-header">\u2500\u2500 \u672C\u5802\u8AB2\u6559\u6750 \u2500\u2500</div>';
    html += '<label class="mat-radio' + (ssel ? ' selected' : '') + '" onclick="selectPrepareMaterial(\'session\')">';
    html += '<input type="radio" name="prepareMat" ' + (ssel ? 'checked' : '') + ' value="session">';
    html += '<span class="mat-icon">' + sessionMat.icon + '</span>';
    html += '<div class="mat-info"><div class="mat-title">' + esc(sessionMat.title) + '</div><div class="mat-desc">' + esc(sessionMat.desc || '') + '</div></div>';
    html += '</label>';
    html += '<div class="mat-cat-header">\u2500\u2500 \u66F4\u63DB\u70BA\u5176\u4ED6\u6559\u6750 \u2500\u2500</div>';
  }
  var hasBuiltin = all.some(function(m) { return m._builtin; });
  var hasCustom = all.some(function(m) { return m._custom; });
  if (hasBuiltin && hasCustom && !sessionMat) { html += '<div class="mat-cat-header">\u2500\u2500 \u5167\u5EFA\u6559\u6750 \u2500\u2500</div>'; }
  all.forEach(function(m, idx) {
    if (hasBuiltin && hasCustom && m._custom && idx > 0 && all[idx - 1]._builtin) {
      html += '<div class="mat-cat-header">\u2500\u2500 \u6211\u7684\u6559\u6750 \u2500\u2500</div>';
    }
    var sel = selectedMaterialIdx === idx;
    html += '<label class="mat-radio' + (sel ? ' selected' : '') + '" onclick="selectPrepareMaterial(' + idx + ')">';
    html += '<input type="radio" name="prepareMat" ' + (sel ? 'checked' : '') + ' value="' + idx + '">';
    html += '<span class="mat-icon">' + m.icon + '</span>';
    html += '<div class="mat-info"><div class="mat-title">' + esc(m.title) + '</div><div class="mat-desc">' + (m.desc || '') + '</div></div>';
    html += '</label>';
  });
  list.innerHTML = html;

  var studentUrl = location.origin + '/classroom/?room=' + encodeURIComponent(roomId);
  var hostUrl = location.origin + '/classroom/host';
  var remoteUrl = location.origin + '/classroom/remote?room=' + encodeURIComponent(roomId);
  document.getElementById('prepareHostUrl').textContent = hostUrl;
  document.getElementById('prepareStudentUrl').textContent = studentUrl;
  document.getElementById('prepareRemoteUrl').textContent = remoteUrl;
  setTimeout(function() {
    makeQR('qrHostPrepare', studentUrl);
  }, 50);

  updateStartButton();
  refreshSurveyStatuses();
}

function selectPrepareMaterial(idx) {
  selectedMaterialIdx = idx;
  // Match by the input's value (string compare) so the 'session' sentinel works.
  var radios = document.querySelectorAll('#prepareMaterialList .mat-radio');
  radios.forEach(function(r) {
    var inp = r.querySelector('input[type="radio"]');
    var on = inp ? String(idx) === inp.value : false;
    r.classList.toggle('selected', on);
    if (inp) inp.checked = on;
  });
  updateStartButton();
}

function updateStartButton() {
  var btn = document.getElementById('btnStartClassPrepare');
  var hint = document.getElementById('startClassHint');
  if (selectedMaterialIdx === 'session') {
    var sm = getSessionMaterial();
    btn.disabled = false;
    hint.textContent = sm ? ('教材：' + sm.title) : '本堂課教材';
    hint.style.color = 'var(--pri)';
    return;
  }
  if (selectedMaterialIdx !== null) {
    var all = getAllMaterials();
    var m = all[selectedMaterialIdx];
    if (!m) { btn.disabled = true; hint.textContent = '\u8ACB\u5148\u9078\u64C7\u6559\u6750'; hint.style.color = 'var(--dim)'; return; }
    btn.disabled = false;
    hint.textContent = '\u6559\u6750\uFF1A' + m.title + ' (' + getMaterialTypeLabel(m) + ')';
    hint.style.color = 'var(--pri)';
  } else {
    btn.disabled = true;
    hint.textContent = '\u8ACB\u5148\u9078\u64C7\u6559\u6750';
    hint.style.color = 'var(--dim)';
  }
}

function copyStudentLink() {
  var url = location.origin + '/classroom/?room=' + encodeURIComponent(roomId);
  navigator.clipboard.writeText(url).then(function() {
    showNotification('success', '\u5DF2\u8907\u88FD\u5B78\u54E1\u9023\u7D50');
  });
}

// ═══ Live Phase Status Bar ═══
function updateLiveStatusBar() {
  var deckEl = document.getElementById('liveStatusDeck');
  if (window._currentDeckName) {
    deckEl.textContent = '\uD83D\uDCDA ' + (window._currentDeckTitle || window._currentDeckName);
  } else if (selectedMaterialIdx === 'session') {
    var _sm = getSessionMaterial();
    deckEl.textContent = '\uD83D\uDCDA ' + (_sm ? _sm.title : '\u672C\u5802\u8AB2\u6559\u6750');
  } else if (selectedMaterialIdx !== null) {
    var _allMats = getAllMaterials();
    deckEl.textContent = '\uD83D\uDCDA ' + (_allMats[selectedMaterialIdx] ? _allMats[selectedMaterialIdx].title : '\u672A\u9078\u64C7\u6559\u6750');
  } else {
    deckEl.textContent = '\uD83D\uDCDA \u672A\u9078\u64C7\u6559\u6750';
  }

  var modeLabels = { wall: '\u8A0A\u606F\u7246', vote: '\u6295\u7968', qa: '\u554F\u7B54', pause: '\u66AB\u505C', feedback: '\u8AB2\u5F8C\u56DE\u994B' };
  document.getElementById('liveStatusMode').textContent = modeLabels[currentMode] || currentMode;
}

// ═══ Start / End Class ═══
function startClass() {
  if (!roomId) return;
  var updates = {};
  updates['rooms/' + roomId + '/config/status'] = 'live';

  var matIdx = selectedMaterialIdx;
  var openUrl = null;

  if (matIdx !== null && matIdx !== 'session') {
    var allMats = getAllMaterials();
    var m = allMats[matIdx];
    var deckId = null;
    if (m.queryExtra) {
      var match = m.queryExtra.match(/deck=([^&]+)/);
      if (match) deckId = match[1];
    }

    if (m.hasSlideControl) {
      var deckType = deckId ? 'slides' : 'html';
      updates['rooms/' + roomId + '/presentation'] = {
        mode: deckType,
        deck: deckId || m.url,
        current: 0,
        title: m.title,
        ts: firebase.database.ServerValue.TIMESTAMP
      };
    }

    if (m.url === '/classroom/presenter' && deckId) {
      openUrl = '/classroom/presenter?room=' + encodeURIComponent(roomId) + '&deck=' + encodeURIComponent(deckId);
    } else if (m.hasSlideControl && m.url !== '/classroom/presenter') {
      openUrl = m.url + '?room=' + encodeURIComponent(roomId) + (m.queryExtra || '');
    } else if (!m.hasSlideControl) {
      openUrl = m.url;
    } else {
      openUrl = '/classroom/presenter?room=' + encodeURIComponent(roomId);
    }
  } else {
    // Session-configured material (chosen at session creation, or the 'session'
    // sentinel selected in the preparing phase): external link / PPTX / built-in
    // slides / self-projection.
    if (roomDeckType === 'external') {
      if (roomDeck) {
        // External link → load through presenter's webpage iframe mode so the
        // room shares one synced view. (Raw new-tab open isn't room-aware and
        // students can't follow it; presenter reads presentation/ from Firebase
        // and renders p.url in its iframe when mode === 'webpage'.)
        updates['rooms/' + roomId + '/presentation'] = {
          mode: 'webpage',
          url: roomDeck,
          deck: roomDeck,
          current: 0,
          title: roomTitle,
          ts: firebase.database.ServerValue.TIMESTAMP
        };
        openUrl = '/classroom/presenter?room=' + encodeURIComponent(roomId);
      }
    } else if (roomDeckType === 'none') {
      // Self-projection — no remote-controlled slides, nothing to open.
      openUrl = null;
    } else if (roomDeck) {
      var _deckMode = roomDeckType || 'slides';
      updates['rooms/' + roomId + '/presentation'] = {
        mode: _deckMode,
        deck: roomDeck,
        current: 0,
        title: roomDeck.replace(/_/g, ' '),
        ts: firebase.database.ServerValue.TIMESTAMP
      };
      if (_deckMode === 'slides' || _deckMode === 'html-slides') {
        openUrl = '/slides/supplements/' + roomDeck + '.html?room=' + encodeURIComponent(roomId);
      } else {
        openUrl = '/classroom/presenter?room=' + encodeURIComponent(roomId) + '&deck=' + encodeURIComponent(roomDeck);
      }
    }
  }

  if (roomCourseId && roomSessionId) {
    updates['courses/' + roomCourseId + '/sessions/' + roomSessionId + '/status'] = 'live';
  }

  db.ref().update(updates).then(function() {
    if (openUrl) window.open(openUrl, '_blank');
    showPhase('live');
  });
}

function endClass() {
  if (!roomId) return;
  if (!confirm('\u78BA\u5B9A\u7D50\u675F\u8AB2\u7A0B\uFF1F\u5C07\u5207\u63DB\u5230\u8AB2\u5F8C\u56DE\u994B\u6A21\u5F0F\u3002')) return;

  var feedbackUrl = location.origin + '/classroom/feedback?room=' + encodeURIComponent(roomId);
  var updates = {};
  updates['rooms/' + roomId + '/config/status'] = 'post-class';
  updates['rooms/' + roomId + '/config/mode'] = 'feedback';
  updates['rooms/' + roomId + '/overlay'] = { type: 'feedback-qr', show: true, data: { url: feedbackUrl } };

  if (roomCourseId && roomSessionId) {
    updates['courses/' + roomCourseId + '/sessions/' + roomSessionId + '/status'] = 'post-class';
  }

  db.ref().update(updates).then(function() {
    showPhase('post-class');
  });
}
