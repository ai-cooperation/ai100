// ClassClaw — course
// Course list, course view, session management, new session form

// ═══ Course List ═══
function loadCourseList() {
  db.ref('courses').orderByChild('config/teacherUid').equalTo(currentUser.uid).on('value', function(snap) {
    var el = document.getElementById('courseListContainer');
    var courses = [];
    var now = new Date();
    var todayStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');

    snap.forEach(function(c) {
      var cfg = c.val().config || {};
      var sessions = c.val().sessions || {};
      var sessionArr = Object.keys(sessions).map(function(sk) {
        var s = sessions[sk];
        return { id: sk, title: s.title || '', date: s.date || '', deckId: s.deckId || '', deckType: s.deckType || '', roomId: s.roomId || '', status: s.status || 'preparing', shareLink: s.shareLink || '', duration: s.duration || 3 };
      });
      sessionArr.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

      var nearestSession = null;
      var nearestDistance = Infinity;
      sessionArr.forEach(function(s) {
        if (s.date >= todayStr) {
          var dist = parseInt(s.date) - parseInt(todayStr);
          if (dist < nearestDistance) { nearestDistance = dist; nearestSession = s; }
        }
      });
      if (!nearestSession && sessionArr.length) {
        nearestSession = sessionArr[sessionArr.length - 1];
        nearestDistance = parseInt(todayStr) - parseInt(nearestSession.date || todayStr);
      }

      var sortKey = nearestSession ? (nearestSession.date >= todayStr ? -nearestDistance : nearestDistance) : 999999;

      courses.push({
        id: c.key,
        title: cfg.title || c.key,
        created: cfg.created || 0,
        sessionCount: sessionArr.length,
        sessions: sessionArr,
        nearestSession: nearestSession,
        sortKey: sortKey,
        nearestMonth: nearestSession ? (function(d) { d = d.replace(/-/g, ''); return d.substring(0, 4) + d.substring(4, 6); })(nearestSession.date) : ''
      });
    });

    courses.sort(function(a, b) { return a.sortKey - b.sortKey; });

    if (!courses.length) { el.innerHTML = '<div class="no-rooms">\u5C1A\u7121\u8AB2\u7A0B\uFF0C\u4E0B\u65B9\u5EFA\u7ACB\u4E00\u500B\u5427</div>'; return; }

    var html = '';
    var lastMonth = '';
    courses.forEach(function(c) {
      var month = c.nearestMonth;
      if (month && month !== lastMonth) {
        lastMonth = month;
        var yr = month.substring(0, 4);
        var mo = parseInt(month.substring(4, 6));
        html += '<div class="month-divider">\u2500\u2500 ' + yr + '\u5E74' + mo + '\u6708 \u2500\u2500</div>';
      }

      var sessionInfo = '';
      if (c.nearestSession) {
        var ns = c.nearestSession;
        var dateDisplay = ns.date ? formatDateDisplay(ns.date) : '';
        sessionInfo = '\u6B21\u56DE\uFF1A' + dateDisplay + ' ' + esc(ns.title || '');
        if (ns.duration) sessionInfo += ' (' + ns.duration + 'hr)';
      } else {
        sessionInfo = c.sessionCount + ' \u5802\u6B21';
      }

      var prepHtml = '';
      if (c.nearestSession) {
        var ns2 = c.nearestSession;
        var hasDeck = !!ns2.deckId;
        var hasShare = !!ns2.shareLink;
        prepHtml = '<div class="cc-prep">';
        prepHtml += '<span class="' + (hasDeck ? 'prep-ok' : 'prep-no') + '">\u6559\u6750 ' + (hasDeck ? '\u2713' : '\u2717') + '</span>  ';
        prepHtml += '<span class="prep-no" id="ccPrep_' + esc(c.id) + '_survey">\u554F\u5377 ...</span>  ';
        prepHtml += '<span class="' + (hasShare ? 'prep-ok' : 'prep-no') + '">\u5206\u4EAB ' + (hasShare ? '\u2713' : '\u2717') + '</span>';
        prepHtml += '</div>';
      }

      html += '<div class="course-card">' +
        '<div class="cc-info" onclick="enterCourseView(\'' + esc(c.id) + '\',\'' + esc(c.title) + '\')"><div class="cc-name">' + esc(c.title) + '</div><div class="cc-meta">' + sessionInfo + '</div>' + prepHtml + '</div>' +
        '<button class="cc-enter" onclick="enterCourseView(\'' + esc(c.id) + '\',\'' + esc(c.title) + '\')">\u9032\u5165</button>' +
        '<button class="cc-del" onclick="event.stopPropagation();deleteCourse(\'' + esc(c.id) + '\',\'' + esc(c.title) + '\')">\u522A\u9664</button>' +
      '</div>';
    });
    el.innerHTML = html;

    // Async check survey configs for nearest sessions
    courses.forEach(function(c) {
      if (c.nearestSession && c.nearestSession.roomId) {
        var prepEl = document.getElementById('ccPrep_' + c.id + '_survey');
        if (!prepEl) return;
        var rid = c.nearestSession.roomId;
        var preOk = false, postOk = false;
        db.ref('rooms/' + rid + '/surveyConfig').once('value', function(s1) {
          preOk = !!(s1.val() && s1.val().questions && s1.val().questions.length);
          db.ref('rooms/' + rid + '/feedbackConfig').once('value', function(s2) {
            postOk = !!(s2.val() && s2.val().questions && s2.val().questions.length);
            var anyOk = preOk || postOk;
            prepEl.className = anyOk ? 'prep-ok' : 'prep-no';
            prepEl.textContent = '\u554F\u5377 ' + (anyOk ? '\u2713' : '\u2717');
          });
        });
      }
    });
  });
}

function createCourse() {
  var name = document.getElementById('inputCourseName').value.trim();
  if (!name) { showNotification('error', '\u8ACB\u8F38\u5165\u8AB2\u7A0B\u540D\u7A31'); return; }
  var courseId = name.replace(/\s+/g, '-');
  db.ref('courses/' + courseId + '/config').once('value').then(function(snap) {
    if (snap.exists()) { showNotification('error', '\u6B64\u8AB2\u7A0B\u540D\u7A31\u5DF2\u5B58\u5728'); return; }
    db.ref('courses/' + courseId + '/config').set({
      title: name,
      teacherUid: currentUser.uid,
      teacherName: currentUser.displayName || currentUser.email,
      created: firebase.database.ServerValue.TIMESTAMP,
      plannedSessions: 0
    });
    document.getElementById('inputCourseName').value = '';
  });
}

function deleteCourse(courseId, title) {
  if (!confirm('\u522A\u9664\u8AB2\u7A0B\u300C' + title + '\u300D\uFF1F\u6240\u6709\u5802\u6B21\u8CC7\u6599\u4E5F\u6703\u6E05\u9664\u3002')) return;
  db.ref('courses/' + courseId + '/sessions').once('value', function(snap) {
    snap.forEach(function(s) {
      var sess = s.val();
      if (sess.roomId) {
        db.ref('rooms/' + sess.roomId).remove();
        db.ref('users/' + currentUser.uid + '/rooms/' + sess.roomId).remove();
      }
    });
    db.ref('courses/' + courseId).remove();
  });
}

// ═══ Course View ═══
function enterCourseView(courseId, title) {
  cvCourseId = courseId;
  cvCourseName = title;
  cvSelectedSessionIdx = null;
  cvSelectedPhase = null;

  // Reset email state to avoid stale data from previous room
  _feedbackRecipients = { wantPdf: [], all: [] };
  var elLink = document.getElementById('emailLink');
  var elBody = document.getElementById('emailBody');
  var elDeck = document.getElementById('emailDeckSelect');
  if (elLink) elLink.value = '';
  if (elBody) elBody.value = '';
  if (elDeck) { elDeck.innerHTML = '<option value="">\u2014 \u9078\u64C7\u6559\u6750 \u2014</option>'; }

  document.getElementById('lobby').classList.remove('active');
  document.getElementById('courseView').classList.add('active');
  document.getElementById('cvCourseName').textContent = title;

  setPhaseCardsEnabled(false);
  loadCourseSessions();
}

function backToCourseList() {
  cvListeners.forEach(function(l) { l.ref.off(l.event); });
  cvListeners = [];
  cvCourseId = null; cvCourseName = ''; cvSessions = []; cvSelectedSessionIdx = null; cvSelectedPhase = null;

  _feedbackRecipients = { wantPdf: [], all: [] };
  var elLink = document.getElementById('emailLink');
  var elBody = document.getElementById('emailBody');
  var elDeck = document.getElementById('emailDeckSelect');
  if (elLink) elLink.value = '';
  if (elBody) elBody.value = '';
  if (elDeck) { elDeck.innerHTML = '<option value="">\u2014 \u9078\u64C7\u6559\u6750 \u2014</option>'; }

  document.getElementById('courseView').classList.remove('active');
  document.getElementById('lobby').classList.add('active');
}

function loadCourseSessions() {
  var ref = db.ref('courses/' + cvCourseId + '/sessions');
  ref.on('value', function(snap) {
    cvSessions = [];
    snap.forEach(function(c) {
      var s = c.val();
      cvSessions.push({ id: c.key, title: s.title || '', date: s.date || '', deckId: s.deckId || '', deckType: s.deckType || '', duration: s.duration || 3, roomId: s.roomId || '', status: s.status || 'preparing', shareLink: s.shareLink || '' });
    });
    cvSessions.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    document.getElementById('cvSessionCount').textContent = cvSessions.length + ' \u5802\u6B21';
    renderSessionList();
  });
  cvListeners.push({ ref: ref, event: 'value' });
}

function renderSessionList() {
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\uD83D\uDCC5 \u8AB2\u7A0B\u6392\u7A0B \u2014 ' + cvCourseName;
  document.getElementById('cvOnline').textContent = '';

  var statusLabels = { preparing: '\u6E96\u5099\u4E2D', live: '\u4E0A\u8AB2\u4E2D', 'post-class': '\u5DF2\u5B8C\u6210', completed: '\u5DF2\u5B8C\u6210' };
  var html = '';

  if (!cvSessions.length) {
    html += '<div style="text-align:center;padding:3rem;color:var(--dim)"><p style="font-size:1.2rem;margin-bottom:0.5rem">\u5C1A\u7121\u5802\u6B21</p><p>\u9EDE\u64CA\u4E0B\u65B9\u300C\u65B0\u589E\u5802\u6B21\u300D\u958B\u59CB\u898F\u5283</p></div>';
  } else {
    html += '<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:1rem">';
    cvSessions.forEach(function(s, idx) {
      var isActive = cvSelectedSessionIdx === idx;
      var dateDisplay = s.date ? formatDateDisplay(s.date) : '\u672A\u8A2D\u5B9A';
      var statusClass = s.status || 'preparing';
      if (statusClass === 'completed') statusClass = 'post-class';
      html += '<div class="session-row' + (isActive ? ' active' : '') + '" onclick="selectSession(' + idx + ')">';
      html += '<div class="sr-num">' + (idx + 1) + '</div>';
      html += '<div class="sr-info"><div class="sr-title">' + esc(s.title || '\u672A\u547D\u540D') + '</div><div class="sr-meta">' + dateDisplay + (s.duration ? ' \u00B7 ' + s.duration + 'hr' : '') + '</div></div>';
      if (s.deckId) { html += '<span class="sr-deck">' + esc(s.deckId) + '</span>'; }
      html += '<span class="sr-status ' + statusClass + '">' + esc(statusLabels[s.status] || s.status) + '</span>';
      html += '<button onclick="event.stopPropagation();editSession(' + idx + ')" style="padding:0.2rem 0.5rem;border-radius:4px;font-size:0.7rem;background:none;color:var(--dim);border:1px solid var(--border);cursor:pointer">\u7DE8\u8F2F</button>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<button class="btn-add-session" onclick="showNewSessionForm()"><span style="font-size:1.2rem">\uFF0B</span> \u65B0\u589E\u5802\u6B21</button>';
  body.innerHTML = html;
}

function selectSession(idx) {
  cvSelectedSessionIdx = idx;
  setPhaseCardsEnabled(true);
  renderSessionList();

  // Unified entry: always land on the prepare phase regardless of session
  // status, so the teacher can always see the material and start / restart
  // the class. (live / post are still reachable via the phase cards.)
  selectCoursePhase('prepare');
}

function editSession(idx) {
  var sess = cvSessions[idx];
  if (!sess) return;
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\u7DE8\u8F2F\u5802\u6B21 \u2014 ' + esc(sess.title || '');
  var dateVal = sess.date ? (sess.date.length === 8 ? sess.date.substring(0, 4) + '-' + sess.date.substring(4, 6) + '-' + sess.date.substring(6, 8) : sess.date) : '';

  // Work out the current material type so the picker opens on the right tab.
  var dt = sess.deckType || '';
  var matType;
  if (dt === 'external') matType = 'external';
  else if (dt === 'pptx-slides' || dt === 'pptx') matType = 'pptx';
  else if (dt === 'none') matType = 'none';
  else if (dt === 'slides') matType = 'builtin';
  else matType = /^https?:\/\//.test(sess.deckId || '') ? 'external' : 'builtin'; // legacy sessions without deckType

  // Material picker \u2014 same element IDs as showNewSessionForm() so selectNsMaterial() works as-is.
  function mkRadio(type, label, sub) {
    var on = matType === type;
    return '<div class="nsf-radio' + (on ? ' selected' : '') + '" onclick="selectNsMaterial(this,\'' + type + '\')">'
      + '<input type="radio" name="nsMat" value="' + type + '"' + (on ? ' checked' : '') + '>'
      + '<div><div class="nr-label">' + label + '</div><div class="nr-sub">' + sub + '</div></div></div>';
  }

  var h = '<div class="new-session-form">';
  h += '<h3>\u7DE8\u8F2F\u5802\u6B21</h3>';
  h += '<div class="nsf-field"><label>\u65E5\u671F</label><input type="date" id="editSessDate" value="' + esc(dateVal) + '"></div>';
  h += '<div class="nsf-field"><label>\u4E3B\u984C</label><input type="text" id="editSessTitle" value="' + esc(sess.title || '') + '"></div>';
  h += '<div class="nsf-field"><label>\u6642\u9577\uFF08\u5C0F\u6642\uFF09</label><input type="number" id="editSessDuration" value="' + (sess.duration || 3) + '" min="1" max="8"></div>';
  h += '<div class="nsf-field"><label>\u6559\u6750</label>';
  h += '<div class="nsf-radio-group" id="nsMaterialRadios">';
  h += mkRadio('builtin', '\u5167\u5EFA\u6559\u6750', '\u5F9E\u88DC\u5145\u55AE\u5143\u9078\u64C7');
  h += mkRadio('pptx', '\u5DF2\u8F49\u6A94 PPTX', '\u5F9E\u5DF2\u4E0A\u50B3\u7684\u7C21\u5831\u9078\u64C7');
  h += mkRadio('external', '\u5916\u90E8\u9023\u7D50', '\u8CBC\u4E0A\u5916\u90E8\u7C21\u5831\u9023\u7D50');
  h += mkRadio('none', '\u81EA\u884C\u6295\u5F71', '\u4E0D\u9700\u9059\u63A7\u7C21\u5831');
  h += '</div></div>';
  // Builtin deck select
  h += '<div class="nsf-field" id="nsBuiltinField"' + (matType === 'builtin' ? '' : ' style="display:none"') + '><label>\u9078\u64C7\u5167\u5EFA\u6559\u6750</label><select id="nsBuiltinDeck">';
  deckOptions.forEach(function(d) { h += '<option value="' + d.name + '"' + (matType === 'builtin' && d.name === sess.deckId ? ' selected' : '') + '>' + d.label + '</option>'; });
  h += '</select></div>';
  // PPTX select (built-in + custom)
  h += '<div class="nsf-field" id="nsPptxField"' + (matType === 'pptx' ? '' : ' style="display:none"') + '><label>\u9078\u64C7\u5DF2\u8F49\u6A94\u7C21\u5831</label><select id="nsPptxDeck">';
  h += '<option value="university-talk"' + (matType === 'pptx' && sess.deckId === 'university-talk' ? ' selected' : '') + '>\u5927\u5B78\u6F14\u8B1B</option>';
  h += '<option value="demo"' + (matType === 'pptx' && sess.deckId === 'demo' ? ' selected' : '') + '>Demo</option>';
  customMaterials.forEach(function(cm) { if (cm.type === 'pptx' && cm.deck) { h += '<option value="' + esc(cm.deck) + '"' + (matType === 'pptx' && sess.deckId === cm.deck ? ' selected' : '') + '>' + esc(cm.title) + '</option>'; } });
  h += '</select></div>';
  // External link
  h += '<div class="nsf-field" id="nsExternalField"' + (matType === 'external' ? '' : ' style="display:none"') + '><label>\u5916\u90E8\u9023\u7D50</label><input type="url" id="nsExternalUrl" placeholder="https://..." value="' + esc(matType === 'external' ? (sess.deckId || '') : '') + '"></div>';
  h += '<button class="nsf-submit" onclick="saveSessionEdit(' + idx + ')">\u5132\u5B58</button>';
  h += '<button class="nsf-cancel" onclick="renderSessionList()">\u53D6\u6D88</button>';
  h += '</div>';
  body.innerHTML = h;
}

function saveSessionEdit(idx) {
  var sess = cvSessions[idx];
  if (!sess || !cvCourseId) return;
  var date = (document.getElementById('editSessDate').value || '').replace(/-/g, '');
  var title = document.getElementById('editSessTitle').value.trim();
  var duration = parseInt(document.getElementById('editSessDuration').value) || 3;
  if (!title) { showNotification('error', '\u8ACB\u586B\u5BEB\u4E3B\u984C'); return; }

  // Read the material the same way submitNewSession() does, so deckId and
  // deckType stay consistent \u2014 never overwrite an external URL with a deck name.
  var matRadio = document.querySelector('input[name="nsMat"]:checked');
  var matType = matRadio ? matRadio.value : 'builtin';
  var deckId = '', deckType = '';
  if (matType === 'builtin') {
    deckId = document.getElementById('nsBuiltinDeck').value;
    deckType = 'slides';
  } else if (matType === 'pptx') {
    deckId = document.getElementById('nsPptxDeck').value;
    deckType = 'pptx-slides';
  } else if (matType === 'external') {
    deckId = document.getElementById('nsExternalUrl').value.trim();
    deckType = 'external';
  } else if (matType === 'none') {
    deckType = 'none';
  }

  var updates = {};
  updates['courses/' + cvCourseId + '/sessions/' + sess.id + '/date'] = date;
  updates['courses/' + cvCourseId + '/sessions/' + sess.id + '/title'] = title;
  updates['courses/' + cvCourseId + '/sessions/' + sess.id + '/duration'] = duration;
  updates['courses/' + cvCourseId + '/sessions/' + sess.id + '/deckId'] = deckId;
  updates['courses/' + cvCourseId + '/sessions/' + sess.id + '/deckType'] = deckType;
  if (sess.roomId) {
    updates['rooms/' + sess.roomId + '/config/title'] = title;
    updates['rooms/' + sess.roomId + '/config/deck'] = deckId || null;
    updates['rooms/' + sess.roomId + '/config/deckType'] = deckType || null;
    // Only pre-write presentation for deck-style materials; external/none get
    // their presentation set at startClass() time (or not at all).
    if (deckId && (deckType === 'slides' || deckType === 'pptx-slides')) {
      var deckTitle = deckId.replace(/_/g, ' ');
      deckOptions.forEach(function(d) { if (d.name === deckId) deckTitle = d.label; });
      updates['rooms/' + sess.roomId + '/presentation/deck'] = deckId;
      updates['rooms/' + sess.roomId + '/presentation/title'] = deckTitle;
      updates['rooms/' + sess.roomId + '/presentation/mode'] = deckType === 'pptx-slides' ? 'pptx-slides' : 'slides';
    }
  }
  db.ref().update(updates).then(function() {
    showNotification('success', '\u5802\u6B21\u5DF2\u66F4\u65B0');
    renderSessionList();
  }).catch(function(e) { showNotification('error', '\u66F4\u65B0\u5931\u6557\uFF1A' + e.message); });
}

function setPhaseCardsEnabled(enabled) {
  ['cvPhase1', 'cvPhase2', 'cvPhase3', 'cvPhase4'].forEach(function(id) {
    document.getElementById(id).classList.toggle('disabled', !enabled);
  });
  if (!enabled) {
    ['cvPhase1', 'cvPhase2', 'cvPhase3', 'cvPhase4'].forEach(function(id) {
      document.getElementById(id).classList.remove('active');
    });
  }
}

function selectCoursePhase(phase) {
  cvSelectedPhase = phase;
  document.getElementById('cvPhase1').classList.toggle('active', phase === 'prepare');
  document.getElementById('cvPhase2').classList.toggle('active', phase === 'live');
  document.getElementById('cvPhase3').classList.toggle('active', phase === 'post');
  document.getElementById('cvPhase4').classList.toggle('active', phase === 'report');

  var sess = cvSessions[cvSelectedSessionIdx];
  if (!sess) return;

  if (phase === 'prepare') {
    renderCVPrepare(sess);
  } else if (phase === 'live') {
    // Only drop straight into the live dashboard if the class is actually
    // live; otherwise route through prepare (the unified entry) so the
    // teacher never lands on an empty live dashboard.
    if (sess.status === 'live') {
      enterSessionRoom(sess, 'live');
    } else {
      selectCoursePhase('prepare');
    }
  } else if (phase === 'post') {
    renderCVPost(sess);
  } else if (phase === 'report') {
    renderCVReport(sess);
  }
}

function copyCVPresenterLink(roomId) {
  var url = location.origin + '/classroom/presenter?room=' + encodeURIComponent(roomId);
  navigator.clipboard.writeText(url).then(function() {
    showNotification('success', '已複製簡報連結');
  });
}

function renderCVPrepare(sess) {
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\uD83D\uDCCB \u8AB2\u524D\u6E96\u5099 \u2014 ' + esc(sess.title || '');

  var studentUrl = sess.roomId ? location.origin + '/classroom/?room=' + encodeURIComponent(sess.roomId) : '(\u5EFA\u7ACB\u5802\u6B21\u5F8C\u751F\u6210)';
  var presenterUrl = sess.roomId ? location.origin + '/classroom/presenter?room=' + encodeURIComponent(sess.roomId) : '';
  var deckLabel = sess.deckId || '\u672A\u9078\u64C7';

  var html = '';
  html += '<div class="step-card"><div class="step-title"><span class="step-num">1</span>\u6559\u6750</div>';
  html += '<div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap">';
  html += '<div style="font-size:0.9rem;color:var(--text);flex:1">' + esc(deckLabel) + '</div>';
  html += '<button onclick="editSession(' + cvSelectedSessionIdx + ')" style="padding:0.35rem 0.8rem;background:var(--bg);color:var(--pri);border:1px solid var(--pri);border-radius:6px;font-size:0.8rem;cursor:pointer">\u66F4\u63DB\u6559\u6750</button>';
  html += '</div>';
  if (sess.shareLink) { html += '<div style="font-size:0.8rem;color:var(--dim);margin-top:0.3rem">\u5206\u4EAB\u9023\u7D50\uFF1A<a href="' + esc(sess.shareLink) + '" target="_blank">' + esc(sess.shareLink) + '</a></div>'; }
  html += '</div>';

  html += '<div class="step-card"><div class="step-title"><span class="step-num">2</span>\u6559\u5BA4\u5165\u53E3</div>';
  if (sess.roomId) {
    html += '<div style="font-size:0.72rem;color:var(--dim);margin-bottom:1px">\u5B78\u54E1\u9023\u7D50</div>';
    html += '<div style="font-size:0.8rem;color:var(--dim);margin-bottom:0.5rem;word-break:break-all">' + esc(studentUrl) + '</div>';
    html += '<div style="display:flex;gap:0.5rem"><div class="qr-small" id="cvQrStudent" style="max-width:120px"></div><div class="qr-small" id="cvQrRemote" style="max-width:120px"></div></div>';
    html += '<div style="font-size:0.72rem;color:var(--dim);margin:0.7rem 0 1px">\u7C21\u5831\u756B\u9762\uFF08\u7DDA\u4E0A / \u96FB\u8166\u5B78\u54E1\u770B\u7C21\u5831\u7528\uFF09</div>';
    html += '<div style="font-size:0.8rem;color:var(--text);word-break:break-all">' + esc(presenterUrl) + '</div>';
    html += '<button onclick="copyCVPresenterLink(\'' + esc(sess.roomId) + '\')" style="margin-top:0.4rem;padding:0.35rem 0.8rem;background:var(--pri);color:#fff;border:none;border-radius:6px;font-size:0.8rem;cursor:pointer">\uD83D\uDCCB \u8907\u88FD\u7C21\u5831\u9023\u7D50</button>';
  } else {
    html += '<div style="font-size:0.85rem;color:var(--dim)">\u6559\u5BA4\u5C07\u5728\u5EFA\u7ACB\u5802\u6B21\u6642\u81EA\u52D5\u751F\u6210</div>';
  }
  html += '</div>';

  html += '<div class="step-card"><div class="step-title"><span class="step-num">3</span>\u8AB2\u524D\u554F\u5377\uFF08\u9078\u586B\uFF09</div>';
  if (sess.roomId) {
    html += '<div class="survey-status" id="cvPreSurveyStatus"><span class="ss-label ss-no" id="cvPreSurveyLabel">\u8F09\u5165\u4E2D...</span>';
    html += '<button onclick="openSurveyEditor(\'pre\',\'' + esc(sess.roomId) + '\')">\u8A2D\u5B9A</button>';
    html += '<button onclick="previewSurveyConfig(\'pre\',\'' + esc(sess.roomId) + '\')">\u9810\u89BD</button></div>';
  } else {
    html += '<div style="font-size:0.85rem;color:var(--dim)">\u9700\u5148\u5EFA\u7ACB\u6559\u5BA4</div>';
  }
  html += '</div>';

  html += '<div class="step-card"><div class="step-title"><span class="step-num">4</span>\u8AB2\u5F8C\u554F\u5377\uFF08\u9078\u586B\uFF09</div>';
  if (sess.roomId) {
    html += '<div class="survey-status" id="cvPostSurveyStatus"><span class="ss-label ss-no" id="cvPostSurveyLabel">\u8F09\u5165\u4E2D...</span>';
    html += '<button onclick="openSurveyEditor(\'post\',\'' + esc(sess.roomId) + '\')">\u8A2D\u5B9A</button>';
    html += '<button onclick="previewSurveyConfig(\'post\',\'' + esc(sess.roomId) + '\')">\u9810\u89BD</button></div>';
  } else {
    html += '<div style="font-size:0.85rem;color:var(--dim)">\u9700\u5148\u5EFA\u7ACB\u6559\u5BA4</div>';
  }
  html += '</div>';

  if (sess.roomId) {
    // Unified entry \u2014 always open the room on the prepare phase, whatever the
    // session status. From there the teacher can start (or restart) the class.
    var enterLabel = (sess.status === 'live') ? '\u25B6 \u9032\u5165\u6559\u5BA4\uFF08\u4E0A\u8AB2\u4E2D \u00B7 \u53EF\u91CD\u65B0\u6574\u7406\uFF09'
                   : (sess.status === 'post-class' || sess.status === 'completed') ? '\u25B6 \u9032\u5165\u6559\u5BA4\uFF08\u5DF2\u7D50\u675F \u00B7 \u53EF\u91CD\u65B0\u4E0A\u8AB2\uFF09'
                   : '\u25B6 \u9032\u5165\u6559\u5BA4\u6E96\u5099\u4E0A\u8AB2';
    var enterStyle = (sess.status === 'preparing' || !sess.status) ? '' : ' style="background:var(--gold);color:var(--navy)"';
    html += '<button class="btn-start-class"' + enterStyle + ' onclick="enterSessionRoom(cvSessions[' + cvSelectedSessionIdx + '],\'preparing\')">' + enterLabel + '</button>';
  }

  body.innerHTML = html;

  if (sess.roomId) {
    setTimeout(function() {
      makeQR('cvQrStudent', location.origin + '/classroom/?room=' + encodeURIComponent(sess.roomId));
      makeQR('cvQrRemote', location.origin + '/classroom/remote?room=' + encodeURIComponent(sess.roomId));
    }, 50);

    loadSurveyConfig(sess.roomId, 'pre', function(config) {
      var label = document.getElementById('cvPreSurveyLabel');
      if (!label) return;
      if (config && config.questions && config.questions.length) {
        label.textContent = '\u2713 \u5DF2\u8A2D\u5B9A\uFF08' + config.questions.length + ' \u984C\uFF09';
        label.className = 'ss-label ss-ok';
      } else {
        label.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
        label.className = 'ss-label ss-no';
      }
    });
    loadSurveyConfig(sess.roomId, 'post', function(config) {
      var label = document.getElementById('cvPostSurveyLabel');
      if (!label) return;
      if (config && config.questions && config.questions.length) {
        label.textContent = '\u2713 \u5DF2\u8A2D\u5B9A\uFF08' + config.questions.length + ' \u984C\uFF09';
        label.className = 'ss-label ss-ok';
      } else {
        label.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
        label.className = 'ss-label ss-no';
      }
    });
  }
}

function renderCVPost(sess) {
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\uD83D\uDCCA \u8AB2\u5F8C\u6536\u5C3E \u2014 ' + esc(sess.title || '');

  if (!sess.roomId) {
    body.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--dim)">\u6B64\u5802\u6B21\u5C1A\u672A\u5EFA\u7ACB\u6559\u5BA4</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--dim)">\u8F09\u5165\u4E2D...</div>';

  db.ref('rooms/' + sess.roomId + '/feedback').once('value', function(snap) {
    var data = snap.val();
    var entries = data ? Object.values(data) : [];
    var total = entries.length;
    var satSum = 0, satCount = 0, recSum = 0, recCount = 0;
    var emailList = [], wantPdfCount = 0;
    entries.forEach(function(e) {
      if (e.ratings) {
        if (e.ratings.satisfaction) { satSum += e.ratings.satisfaction; satCount++; }
        if (e.ratings.recommend) { recSum += e.ratings.recommend; recCount++; }
      }
      if (e.email) { emailList.push({ email: e.email, name: e.name || '' }); if (e.wantPdf) wantPdfCount++; }
    });
    var satAvg = satCount ? (satSum / satCount).toFixed(1) : '-';
    var recAvg = recCount ? (recSum / recCount).toFixed(1) : '-';

    var h = '';
    h += '<div class="kpi-grid">';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--pri)">' + total + '</div><div class="kpi-label">\u586B\u5BEB\u4EBA\u6578</div></div>';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--gold)">' + satAvg + '</div><div class="kpi-label">\u6EFF\u610F\u5EA6 /5</div></div>';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:#1A73E8">' + recAvg + '</div><div class="kpi-label">\u63A8\u85A6\u5EA6 /5</div></div>';
    h += '</div>';

    h += '<div class="post-section" style="margin-top:1rem">';
    h += '<h3>\uD83D\uDCDD \u8AB2\u5F8C\u554F\u5377\u7BA1\u7406</h3>';
    h += '<div class="survey-status"><span class="ss-label ss-no" id="cvPostMgmtLabel">\u8F09\u5165\u4E2D...</span>';
    h += '<button onclick="openSurveyEditor(\'post\',\'' + esc(sess.roomId) + '\')">\u7DE8\u8F2F</button>';
    h += '<button onclick="previewSurveyConfig(\'post\',\'' + esc(sess.roomId) + '\')">\u9810\u89BD</button></div>';
    h += '<div id="cvPostMgmtCount" style="font-size:0.8rem;color:var(--dim);margin-top:0.4rem">\u5DF2\u6536\u5230 ' + total + ' \u4EFD\u56DE\u994B</div>';
    h += '</div>';

    h += '<div class="post-section" style="margin-top:1rem">';
    h += '<h3>\uD83D\uDCE7 \u5BC4\u9001\u6559\u6750</h3>';
    h += '<div style="margin-bottom:0.6rem">';
    h += '<label style="font-size:0.8rem;color:var(--dim);display:block;margin-bottom:4px;">\u6559\u6750\u9023\u7D50</label>';
    h += '<input id="cvPostShareLink" placeholder="Google Drive / PDF \u9023\u7D50" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.85rem;" value="' + esc(sess.shareLink || '') + '">';
    h += '</div>';
    h += '<div style="margin-bottom:0.6rem">';
    h += '<label style="font-size:0.8rem;color:var(--dim);display:block;margin-bottom:4px;">\u5206\u4EAB\u8A0A\u606F</label>';
    h += '<textarea id="cvPostEmailMsg" rows="3" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.85rem;resize:vertical;font-family:inherit;line-height:1.5;">\u611F\u8B1D\u53C3\u52A0\u8AB2\u7A0B\uFF01\u4EE5\u4E0B\u662F\u8AB2\u7A0B\u6559\u6750\u9023\u7D50\uFF0C\u6B61\u8FCE\u8907\u7FD2\u56DE\u9867\u3002</textarea>';
    h += '</div>';
    h += '<div style="margin-bottom:0.6rem">';
    h += '<label style="font-size:0.8rem;color:var(--dim);display:block;margin-bottom:4px;">\u5BC4\u9001\u6A21\u5F0F</label>';
    h += '<div style="display:flex;gap:1rem;align-items:center;">';
    h += '<label style="font-size:0.85rem;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="cvPostEmailMode" value="auto" style="accent-color:var(--pri);"> \u81EA\u52D5\uFF08\u586B\u5B8C\u554F\u5377\u5373\u5BC4\uFF09</label>';
    h += '<label style="font-size:0.85rem;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="cvPostEmailMode" value="manual" checked style="accent-color:var(--pri);"> \u624B\u52D5\uFF08\u8B1B\u5E2B\u78BA\u8A8D\u5F8C\u5BC4\uFF09</label>';
    h += '</div>';
    h += '</div>';
    h += '<button onclick="saveCVPostEmailConfig(\'' + esc(sess.roomId) + '\')" style="width:100%;padding:0.6rem;background:var(--pri);color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer;margin-bottom:0.8rem">\uD83D\uDCBE \u5132\u5B58\u8A2D\u5B9A</button>';

    h += '<div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border)">';
    h += '<div style="font-size:0.8rem;color:var(--dim);margin-bottom:0.4rem">\uD83D\uDCE7 \u6536\u4EF6\u4EBA\uFF08' + emailList.length + ' \u4EBA\uFF0C' + wantPdfCount + ' \u4EBA\u8981 PDF\uFF09</div>';
    if (emailList.length) {
      h += '<div style="max-height:120px;overflow-y:auto;background:var(--bg);border-radius:8px;padding:0.5rem">';
      emailList.forEach(function(r) {
        h += '<div style="font-size:0.8rem;color:var(--text);padding:2px 0">' + esc(r.email) + (r.name ? ' <span style="color:var(--dim)">' + esc(r.name) + '</span>' : '') + '</div>';
      });
      h += '</div>';
    } else {
      h += '<div style="font-size:0.8rem;color:var(--dim)">\u5C1A\u7121\u4EBA\u7559 email</div>';
    }
    h += '</div>';
    h += '</div>';

    var _rid = esc(sess.roomId);
    h += '<div class="post-section" style="margin-top:1rem">';
    h += '<h3>\uD83D\uDCCB \u56DE\u994B\u554F\u5377</h3>';
    h += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">';
    h += '<button onclick="cvShowFeedbackQR(\'' + _rid + '\')" style="padding:0.5rem 1rem;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.85rem;cursor:pointer">\u986F\u793A QR</button>';
    h += '<button onclick="cvPushFeedbackToPresenter(\'' + _rid + '\')" style="padding:0.5rem 1rem;background:var(--purple);color:#fff;border:none;border-radius:8px;font-size:0.85rem;cursor:pointer">\u63A8\u9001\u5230\u7C21\u5831</button>';
    h += '<button onclick="cvPushFeedbackToStudents(\'' + _rid + '\')" style="padding:0.5rem 1rem;background:var(--pri);color:#fff;border:none;border-radius:8px;font-size:0.85rem;cursor:pointer">\u63A8\u9001\u5230\u5B78\u54E1</button>';
    h += '</div></div>';

    h += '<div class="post-section" style="margin-top:1rem">';
    h += '<h3>\uD83D\uDCBE \u8CC7\u6599\u5099\u4EFD</h3>';
    h += '<p style="font-size:0.8rem;color:var(--dim);margin-bottom:0.5rem">\u5099\u4EFD\u56DE\u994B\u3001\u8A0A\u606F\u7246\u3001\u554F\u7B54\u5230 Google Sheets</p>';
    h += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">';
    h += '<button onclick="backupToSheets(\'' + esc(sess.roomId) + '\',\'' + esc(sess.title || '') + '\')">\uD83D\uDCE4 \u5099\u4EFD\u5230 Sheets</button>';
    h += '<button onclick="clearRoomData(\'' + esc(sess.roomId) + '\')" style="color:var(--red);border-color:var(--red)">\uD83D\uDDD1 \u6E05\u7A7A\u4E92\u52D5\u8CC7\u6599</button>';
    h += '</div></div>';

    h += '<div class="post-actions">';
    h += '<button onclick="enterSessionRoom(cvSessions[' + cvSelectedSessionIdx + '],\'post-class\')">\u9032\u5165\u6559\u5BA4\u67E5\u770B\u8A73\u60C5</button>';
    h += '</div>';

    body.innerHTML = h;

    loadSurveyConfig(sess.roomId, 'post', function(config) {
      var label = document.getElementById('cvPostMgmtLabel');
      if (!label) return;
      if (config && config.questions && config.questions.length) {
        var tmplName = config.templateName ? (SURVEY_TEMPLATES[config.templateName] ? SURVEY_TEMPLATES[config.templateName].name : config.templateName) : '\u81EA\u8A02';
        label.textContent = tmplName + '\uFF08' + config.questions.length + ' \u984C\uFF09';
        label.className = 'ss-label ss-ok';
      } else {
        label.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
        label.className = 'ss-label ss-no';
      }
    });

    db.ref('rooms/' + sess.roomId + '/emailConfig').once('value', function(ecSnap) {
      var ec = ecSnap.val();
      if (ec) {
        var linkEl = document.getElementById('cvPostShareLink');
        var msgEl = document.getElementById('cvPostEmailMsg');
        if (ec.shareLink && linkEl) linkEl.value = ec.shareLink;
        if (ec.message && msgEl) msgEl.value = ec.message;
        if (ec.mode) {
          var radios = document.querySelectorAll('input[name="cvPostEmailMode"]');
          radios.forEach(function(r) { r.checked = (r.value === ec.mode); });
        }
      }
    });
  });
}

function saveCVPostEmailConfig(rid) {
  var shareLink = (document.getElementById('cvPostShareLink') || {}).value || '';
  var message = (document.getElementById('cvPostEmailMsg') || {}).value || '';
  var modeRadio = document.querySelector('input[name="cvPostEmailMode"]:checked');
  var mode = modeRadio ? modeRadio.value : 'manual';

  var config = {
    mode: mode,
    shareLink: shareLink.trim(),
    message: message.trim(),
    subject: 'AI 100 \u8B1B \u2014 \u8AB2\u7A0B\u6559\u6750',
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  };

  db.ref('rooms/' + rid + '/emailConfig').set(config).then(function() {
    showNotification('success', '\u5BC4\u9001\u8A2D\u5B9A\u5DF2\u5132\u5B58');
  }).catch(function(e) {
    showNotification('error', '\u5132\u5B58\u5931\u6557\uFF1A' + e.message);
  });
}

function cvShowFeedbackQR(rid) {
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(rid);
  document.getElementById('qrUrl').textContent = url;
  var el = document.getElementById('qrBox'); var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4 });
  document.getElementById('qrOverlay').classList.add('show');
}

function cvPushFeedbackToPresenter(rid) {
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(rid);
  db.ref('rooms/' + rid + '/overlay').set({ type: 'feedback-qr', show: true, data: { url: url } });
  showNotification('success', '\u5DF2\u63A8\u9001\u56DE\u994B QR \u5230\u7C21\u5831');
}

function cvPushFeedbackToStudents(rid) {
  var url = location.origin + '/classroom/feedback?room=' + encodeURIComponent(rid);
  var data = { type: 'qr', title: '\u8AB2\u5F8C\u56DE\u994B\u554F\u5377', content: url, ts: firebase.database.ServerValue.TIMESTAMP };
  db.ref('rooms/' + rid + '/pushContent/current').set(data);
  db.ref('rooms/' + rid + '/pushContent/history').push(data);
  showNotification('success', '\u5DF2\u63A8\u9001\u56DE\u994B\u9023\u7D50\u7D66\u5B78\u54E1');
}

function renderCVReport(sess) {
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\uD83D\uDCC8 \u6559\u5B78\u5831\u544A \u2014 ' + esc(sess.title || '');

  if (!sess.roomId) {
    body.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--dim)">\u6B64\u5802\u6B21\u5C1A\u672A\u5EFA\u7ACB\u6559\u5BA4</div>';
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--dim)">\u8F09\u5165\u4E2D...</div>';

  Promise.all([
    db.ref('rooms/' + sess.roomId + '/presence').once('value'),
    db.ref('rooms/' + sess.roomId + '/wall').once('value'),
    db.ref('rooms/' + sess.roomId + '/qa').once('value'),
    db.ref('rooms/' + sess.roomId + '/votes').once('value'),
    db.ref('rooms/' + sess.roomId + '/feedback').once('value')
  ]).then(function(results) {
    var presCount = results[0].numChildren();
    var wallCount = results[1].numChildren();
    var qaCount = results[2].numChildren();
    var voteCount = results[3].numChildren();
    var feedbackData = results[4].val();
    var feedbackEntries = feedbackData ? Object.values(feedbackData) : [];
    var feedbackCount = feedbackEntries.length;

    var satSum = 0, satCount = 0, recSum = 0, recCount = 0;
    var emailCount = 0;
    feedbackEntries.forEach(function(e) {
      if (e.ratings) {
        if (e.ratings.satisfaction) { satSum += e.ratings.satisfaction; satCount++; }
        if (e.ratings.recommend) { recSum += e.ratings.recommend; recCount++; }
      }
      if (e.email) emailCount++;
    });
    var satAvg = satCount ? (satSum / satCount).toFixed(1) : '-';
    var recAvg = recCount ? (recSum / recCount).toFixed(1) : '-';

    var h = '';
    h += '<div class="kpi-grid" style="grid-template-columns:1fr 1fr">';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--pri)">' + presCount + '</div><div class="kpi-label">\u51FA\u5E2D\u4EBA\u6578</div></div>';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--gold)">' + wallCount + '</div><div class="kpi-label">\u8A0A\u606F\u7246\u7559\u8A00</div></div>';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--purple)">' + qaCount + '</div><div class="kpi-label">\u63D0\u554F\u6578</div></div>';
    h += '<div class="kpi-card"><div class="kpi-val" style="color:#06B6D4">' + voteCount + '</div><div class="kpi-label">\u6295\u7968\u6578</div></div>';
    h += '</div>';

    if (feedbackCount > 0) {
      h += '<div class="kpi-grid" style="margin-top:1rem">';
      h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--pri)">' + feedbackCount + '</div><div class="kpi-label">\u56DE\u994B\u4EBA\u6578</div></div>';
      h += '<div class="kpi-card"><div class="kpi-val" style="color:var(--gold)">' + satAvg + '</div><div class="kpi-label">\u6EFF\u610F\u5EA6 /5</div></div>';
      h += '<div class="kpi-card"><div class="kpi-val" style="color:#1A73E8">' + recAvg + '</div><div class="kpi-label">\u63A8\u85A6\u5EA6 /5</div></div>';
      h += '</div>';
      if (emailCount > 0) {
        h += '<p style="color:var(--dim);font-size:0.85rem;text-align:center;margin-top:0.5rem">\uD83D\uDCE7 \u6536\u96C6\u5230 ' + emailCount + ' \u500B email</p>';
      }
    } else {
      h += '<p style="color:var(--dim);font-size:0.85rem;text-align:center;margin-top:1rem">\u5C1A\u7121\u56DE\u994B\u8CC7\u6599</p>';
    }

    h += '<p style="color:var(--border);font-size:0.7rem;text-align:center;margin-top:1rem">Room: ' + esc(sess.roomId) + '</p>';

    h += '<div style="margin-top:1rem;text-align:center">';
    h += '<button class="act-btn" style="margin:0.5rem" onclick="exportRoomData(\'' + esc(sess.roomId) + '\',\'' + esc(sess.title || sess.roomId) + '\')">\u532F\u51FA\u5B8C\u6574 HTML \u5831\u544A</button>';
    h += '<a href="/classroom/history" class="act-btn" style="margin:0.5rem;display:inline-block;text-decoration:none">\uD83D\uDCCB \u6B77\u53F2\u7D00\u9304\u67E5\u770B\u5B8C\u6574\u8CC7\u6599</a>';
    h += '</div>';

    body.innerHTML = h;
  });
}

function enterSessionRoom(sess, phaseOverride) {
  if (!sess || !sess.roomId) return;
  cvFromCourse = true;
  document.getElementById('courseView').classList.remove('active');
  enterRoom(sess.roomId, sess.title || sess.roomId, phaseOverride);
}

// ═══ New Session Form ═══
function showNewSessionForm() {
  var body = document.getElementById('cvMainBody');
  document.getElementById('cvMainTitle').textContent = '\uFF0B \u65B0\u589E\u5802\u6B21';

  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  var html = '<div class="new-session-form">';
  html += '<h3>\u65B0\u589E\u5802\u6B21</h3>';

  html += '<div class="nsf-field"><label>\u65E5\u671F</label><input type="date" id="nsDate" value="' + todayStr + '"></div>';
  html += '<div class="nsf-field"><label>\u4E3B\u984C</label><input type="text" id="nsTitle" placeholder="\u4F8B\uFF1A\u78B3\u76E4\u67E5\u5BE6\u52D9"></div>';
  html += '<div class="nsf-field"><label>\u6642\u9577\uFF08\u5C0F\u6642\uFF09</label><input type="number" id="nsDuration" value="3" min="1" max="8"></div>';

  html += '<div class="nsf-field"><label>\u6559\u6750</label>';
  html += '<div class="nsf-radio-group" id="nsMaterialRadios">';
  html += '<div class="nsf-radio selected" onclick="selectNsMaterial(this,\'builtin\')"><input type="radio" name="nsMat" value="builtin" checked><div><div class="nr-label">\u5167\u5EFA\u6559\u6750</div><div class="nr-sub">\u5F9E\u88DC\u5145\u55AE\u5143\u9078\u64C7</div></div></div>';
  html += '<div class="nsf-radio" onclick="selectNsMaterial(this,\'pptx\')"><input type="radio" name="nsMat" value="pptx"><div><div class="nr-label">\u5DF2\u8F49\u6A94 PPTX</div><div class="nr-sub">\u5F9E\u5DF2\u4E0A\u50B3\u7684\u7C21\u5831\u9078\u64C7</div></div></div>';
  html += '<div class="nsf-radio" onclick="selectNsMaterial(this,\'external\')"><input type="radio" name="nsMat" value="external"><div><div class="nr-label">\u5916\u90E8\u9023\u7D50</div><div class="nr-sub">\u8CBC\u4E0A\u5916\u90E8\u7C21\u5831\u9023\u7D50</div></div></div>';
  html += '<div class="nsf-radio" onclick="selectNsMaterial(this,\'none\')"><input type="radio" name="nsMat" value="none"><div><div class="nr-label">\u81EA\u884C\u6295\u5F71</div><div class="nr-sub">\u4E0D\u9700\u9059\u63A7\u7C21\u5831</div></div></div>';
  html += '</div>';
  html += '</div>';

  html += '<div class="nsf-field" id="nsBuiltinField"><label>\u9078\u64C7\u5167\u5EFA\u6559\u6750</label><select id="nsBuiltinDeck">';
  deckOptions.forEach(function(d) { html += '<option value="' + d.name + '">' + d.label + '</option>'; });
  html += '</select></div>';

  html += '<div class="nsf-field" id="nsPptxField" style="display:none"><label>\u9078\u64C7\u5DF2\u8F49\u6A94\u7C21\u5831</label><select id="nsPptxDeck"><option value="university-talk">\u5927\u5B78\u6F14\u8B1B</option><option value="demo">Demo</option>';
  customMaterials.forEach(function(cm) { if (cm.type === 'pptx' && cm.deck) { html += '<option value="' + esc(cm.deck) + '">' + esc(cm.title) + '</option>'; } });
  html += '</select></div>';

  html += '<div class="nsf-field" id="nsExternalField" style="display:none"><label>\u5916\u90E8\u9023\u7D50</label><input type="url" id="nsExternalUrl" placeholder="https://..."></div>';

  html += '<div class="nsf-field"><label>\u8AB2\u5F8C\u5206\u4EAB\u9023\u7D50\uFF08\u9078\u586B\uFF09</label><input type="url" id="nsShareLink" placeholder="Google Drive \u9023\u7D50"></div>';

  html += '<div class="nsf-field"><label>\u5BC4\u9001\u6A21\u5F0F</label>';
  html += '<div style="display:flex;gap:1rem;align-items:center;margin-top:0.3rem">';
  html += '<label style="font-size:0.85rem;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="nsEmailMode" value="auto" style="accent-color:var(--pri);"> \u81EA\u52D5\uFF08\u586B\u5B8C\u554F\u5377\u5373\u5BC4\uFF09</label>';
  html += '<label style="font-size:0.85rem;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="nsEmailMode" value="manual" checked style="accent-color:var(--pri);"> \u624B\u52D5\uFF08\u8B1B\u5E2B\u78BA\u8A8D\u5F8C\u5BC4\uFF09</label>';
  html += '</div></div>';

  html += '<button class="nsf-submit" onclick="submitNewSession()">\u5EFA\u7ACB\u5802\u6B21</button>';
  html += '<button class="nsf-cancel" onclick="renderSessionList()">\u53D6\u6D88</button>';
  html += '</div>';

  body.innerHTML = html;
}

function selectNsMaterial(el, type) {
  document.querySelectorAll('#nsMaterialRadios .nsf-radio').forEach(function(r) { r.classList.remove('selected'); });
  el.classList.add('selected');
  el.querySelector('input[type="radio"]').checked = true;
  document.getElementById('nsBuiltinField').style.display = type === 'builtin' ? '' : 'none';
  document.getElementById('nsPptxField').style.display = type === 'pptx' ? '' : 'none';
  document.getElementById('nsExternalField').style.display = type === 'external' ? '' : 'none';
}

function submitNewSession() {
  var date = document.getElementById('nsDate').value.replace(/-/g, '');
  var title = document.getElementById('nsTitle').value.trim();
  var duration = parseInt(document.getElementById('nsDuration').value) || 3;
  var shareLink = document.getElementById('nsShareLink').value.trim();
  var emailModeRadio = document.querySelector('input[name="nsEmailMode"]:checked');
  var emailMode = emailModeRadio ? emailModeRadio.value : 'manual';

  if (!title) { showNotification('error', '\u8ACB\u586B\u5BEB\u4E3B\u984C'); return; }
  if (!date) { showNotification('error', '\u8ACB\u9078\u64C7\u65E5\u671F'); return; }

  var matType = document.querySelector('input[name="nsMat"]:checked').value;
  var deckId = '', deckType = '';
  if (matType === 'builtin') {
    deckId = document.getElementById('nsBuiltinDeck').value;
    deckType = 'slides';
  } else if (matType === 'pptx') {
    deckId = document.getElementById('nsPptxDeck').value;
    deckType = 'pptx-slides';
  } else if (matType === 'external') {
    deckId = document.getElementById('nsExternalUrl').value.trim();
    deckType = 'external';
  }

  var simpleName = cvCourseName.replace(/\s+/g, '').substring(0, 20);
  var roomIdNew = date + '-' + simpleName;
  var sessionId = date + '-' + title.replace(/\s+/g, '').substring(0, 20);

  db.ref('rooms/' + roomIdNew + '/config').once('value').then(function(snap) {
    if (snap.exists()) {
      roomIdNew = roomIdNew + '-' + Math.random().toString(36).substring(2, 6);
      sessionId = sessionId + '-' + Math.random().toString(36).substring(2, 6);
    }

    var updates = {};
    updates['courses/' + cvCourseId + '/sessions/' + sessionId] = {
      title: title,
      date: date,
      deckId: deckId,
      deckType: deckType,
      duration: duration,
      roomId: roomIdNew,
      status: 'preparing',
      shareLink: shareLink
    };
    updates['rooms/' + roomIdNew + '/config'] = {
      title: title,
      mode: 'wall',
      status: 'preparing',
      created: firebase.database.ServerValue.TIMESTAMP,
      hostUid: currentUser.uid,
      hostName: currentUser.displayName || currentUser.email,
      courseId: cvCourseId,
      sessionId: sessionId,
      deck: deckId || null,
      deckType: deckType || null
    };
    if (shareLink || emailMode !== 'manual') {
      updates['rooms/' + roomIdNew + '/emailConfig'] = {
        mode: emailMode,
        shareLink: shareLink,
        message: '\u611F\u8B1D\u53C3\u52A0\u8AB2\u7A0B\uFF01\u4EE5\u4E0B\u662F\u8AB2\u7A0B\u6559\u6750\u9023\u7D50\uFF0C\u6B61\u8FCE\u8907\u7FD2\u56DE\u9867\u3002',
        subject: 'AI 100 \u8B1B \u2014 \u8AB2\u7A0B\u6559\u6750'
      };
    }
    updates['users/' + currentUser.uid + '/rooms/' + roomIdNew] = {
      title: title,
      created: firebase.database.ServerValue.TIMESTAMP,
      courseId: cvCourseId
    };

    db.ref().update(updates).then(function() {
      renderSessionList();
    });
  });
}

// ═══ Course Settings ═══
function openCourseSettings() {
  if (!cvCourseId) return;
  var newTitle = prompt('\u4FEE\u6539\u8AB2\u7A0B\u540D\u7A31\uFF1A', cvCourseName);
  if (newTitle && newTitle.trim() && newTitle.trim() !== cvCourseName) {
    db.ref('courses/' + cvCourseId + '/config/title').set(newTitle.trim());
    cvCourseName = newTitle.trim();
    document.getElementById('cvCourseName').textContent = cvCourseName;
  }
}

// ═══ Room List (standalone rooms only) ═══
function loadRoomList() {
  db.ref('users/' + currentUser.uid + '/rooms').on('value', function(snap) {
    var el = document.getElementById('roomListContainer');
    var section = document.getElementById('standaloneRoomSection');
    var rooms = [];
    snap.forEach(function(c) {
      var val = c.val();
      if (!val.courseId) {
        rooms.push({ id: c.key, title: val.title, created: val.created });
      }
    });
    rooms.sort(function(a, b) { return (b.created || 0) - (a.created || 0); });
    if (!rooms.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    el.innerHTML = rooms.map(function(r) {
      return '<div class="room-card">' +
        '<div class="rc-info" onclick="enterRoom(\'' + r.id + '\',\'' + esc(r.title || r.id) + '\')"><div class="rc-name">' + esc(r.title || r.id) + '</div><div class="rc-meta">' + r.id + '</div></div>' +
        '<button class="rc-enter" onclick="enterRoom(\'' + r.id + '\',\'' + esc(r.title || r.id) + '\')">\u9032\u5165</button>' +
        '<button class="rc-del" onclick="event.stopPropagation();deleteRoom(\'' + r.id + '\')">\u522A\u9664</button>' +
      '</div>';
    }).join('');
  });
}

// ═══ Today's Classes ═══
function loadTodayClasses() {
  var today = new Date();
  var todayStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
  db.ref('users/' + currentUser.uid + '/rooms').once('value', function(snap) {
    var section = document.getElementById('todayClassSection');
    var list = document.getElementById('todayClassList');
    var todayRooms = [];
    snap.forEach(function(c) {
      if (c.key.startsWith(todayStr)) {
        todayRooms.push({ id: c.key, title: c.val().title, created: c.val().created, courseId: c.val().courseId });
      }
    });
    if (!todayRooms.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = todayRooms.map(function(r) {
      return '<div style="background:var(--surface);border:2px solid var(--gold);border-radius:12px;padding:1rem 1.2rem;margin-bottom:0.6rem;display:flex;align-items:center;gap:1rem;">' +
        '<span style="font-size:1.5rem">\uD83C\uDF93</span>' +
        '<div style="flex:1"><div style="font-weight:700;color:var(--gold);font-size:1rem">' + esc(r.title || r.id) + '</div><div style="font-size:0.75rem;color:var(--dim)">' + r.id + (r.courseId ? ' \u00B7 \u5DF2\u6392\u8AB2' : '') + '</div></div>' +
        '<button onclick="enterRoom(\'' + r.id + '\',\'' + esc(r.title || r.id) + '\')" style="padding:0.5rem 1.2rem;background:var(--gold);color:var(--navy);border:none;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer">\u9032\u5165\u6559\u5BA4</button>' +
      '</div>';
    }).join('');
  });
}

function createRoom() {
  var prefix = document.getElementById('datePrefix').textContent;
  var suffix = document.getElementById('inputSuffix').value.trim();
  if (!suffix) { showNotification('error', '\u8ACB\u8F38\u5165\u6559\u5BA4\u540D\u7A31'); return; }
  roomId = prefix + suffix;
  roomTitle = suffix;
  db.ref('rooms/' + roomId + '/config').once('value').then(function(snap) {
    if (snap.exists()) { showNotification('error', '\u6B64\u6559\u5BA4\u4EE3\u78BC\u5DF2\u5B58\u5728\uFF0C\u8ACB\u63DB\u4E00\u500B'); return; }
    db.ref('rooms/' + roomId + '/config').set({ title: roomTitle, mode: 'wall', created: firebase.database.ServerValue.TIMESTAMP, hostUid: currentUser.uid, hostName: currentUser.displayName || currentUser.email });
    db.ref('users/' + currentUser.uid + '/rooms/' + roomId).set({ title: roomTitle, created: firebase.database.ServerValue.TIMESTAMP });
    document.getElementById('inputSuffix').value = '';
    enterRoom(roomId, roomTitle);
  });
}

function deleteRoom(rid) {
  if (!confirm('\u522A\u9664\u6559\u5BA4\u300C' + rid + '\u300D\uFF1F\u8CC7\u6599\u4E5F\u6703\u6E05\u9664\u3002')) return;
  db.ref('rooms/' + rid).remove();
  db.ref('users/' + currentUser.uid + '/rooms/' + rid).remove();
}
