// ClassClaw — survey
// Survey templates, editor, preview, config helpers

// ═══ Survey Templates ═══
var SURVEY_TEMPLATES = {
  'post-general': {
    name: '\u901A\u7528\u8AB2\u5F8C\u554F\u5377',
    questions: [
      { id: 'satisfaction', text: '\u6574\u9AD4\u6EFF\u610F\u5EA6', type: 'rating', required: true },
      { id: 'recommend', text: '\u63A8\u85A6\u7D66\u670B\u53CB\u7684\u610F\u9858', type: 'rating', required: true },
      { id: 'helpful', text: '\u6700\u6709\u5E6B\u52A9\u7684\u90E8\u5206', type: 'single', options: ['\u5BE6\u4F5C\u7DF4\u7FD2', '\u6848\u4F8B\u5206\u6790', '\u8B1B\u5E2B\u8B1B\u89E3', '\u4E92\u52D5\u8A0E\u8AD6', '\u6559\u6750\u5167\u5BB9'], required: true },
      { id: 'unclear', text: '\u4E0D\u6E05\u695A\u7684\u5730\u65B9', type: 'text', required: false },
      { id: 'pacing', text: '\u8AB2\u7A0B\u7BC0\u594F', type: 'single', options: ['\u592A\u5FEB', '\u525B\u597D', '\u592A\u6162'], required: true },
      { id: 'suggestion', text: '\u5EFA\u8B70\u8207\u56DE\u994B', type: 'text', required: false },
      { id: 'email', text: 'Email\uFF08\u6536\u6559\u6750\u7528\uFF09', type: 'email', required: false },
      { id: 'wantPdf', text: '\u662F\u5426\u8981\u7C21\u5831 PDF', type: 'boolean', required: false }
    ]
  },
  'post-tech': {
    name: '\u6280\u8853\u8AB2\u7A0B\u554F\u5377',
    questions: [
      { id: 'satisfaction', text: '\u6574\u9AD4\u6EFF\u610F\u5EA6', type: 'rating', required: true },
      { id: 'difficulty', text: '\u8AB2\u7A0B\u96E3\u5EA6', type: 'single', options: ['\u592A\u7C21\u55AE', '\u9069\u4E2D', '\u504F\u96E3', '\u592A\u96E3'], required: true },
      { id: 'helpful', text: '\u6700\u6709\u5E6B\u52A9\u7684\u90E8\u5206', type: 'single', options: ['Live Demo', '\u5BE6\u4F5C\u7DF4\u7FD2', '\u7A0B\u5F0F\u78BC\u7BC4\u4F8B', '\u5DE5\u5177\u4ECB\u7D39', 'Q&A \u8A0E\u8AD6'], required: true },
      { id: 'apply', text: '\u9810\u8A08\u5982\u4F55\u61C9\u7528\u5728\u5DE5\u4F5C\u4E2D', type: 'text', required: false },
      { id: 'suggestion', text: '\u5EFA\u8B70', type: 'text', required: false },
      { id: 'email', text: 'Email', type: 'email', required: false },
      { id: 'wantPdf', text: '\u662F\u5426\u8981\u7C21\u5831 PDF', type: 'boolean', required: false }
    ]
  },
  'pre-general': {
    name: '\u901A\u7528\u8AB2\u524D\u554F\u5377',
    questions: [
      { id: 'background', text: '\u4F60\u7684\u80CC\u666F', type: 'single', options: ['\u5B78\u751F', '\u4E0A\u73ED\u65CF', '\u81EA\u7531\u5DE5\u4F5C\u8005', '\u4E3B\u7BA1', '\u5176\u4ED6'], required: true },
      { id: 'experience', text: '\u76F8\u95DC\u7D93\u9A57', type: 'single', options: ['\u5B8C\u5168\u6C92\u6709', '\u7565\u6709\u4E86\u89E3', '\u6709\u4E00\u4E9B\u7D93\u9A57', '\u5F88\u719F\u6089'], required: true },
      { id: 'expect', text: '\u6700\u60F3\u5B78\u5230\u4EC0\u9EBC', type: 'text', required: true },
      { id: 'concern', text: '\u6700\u64D4\u5FC3\u4EC0\u9EBC', type: 'text', required: false }
    ]
  }
};

// ═══ Survey Config Firebase Helpers ═══
function loadSurveyConfig(roomIdParam, type, callback) {
  var path = type === 'pre' ? 'surveyConfig' : 'feedbackConfig';
  db.ref('rooms/' + roomIdParam + '/' + path).once('value', function(snap) {
    callback(snap.val());
  });
}

function saveSurveyConfig(roomIdParam, type, config) {
  var path = type === 'pre' ? 'surveyConfig' : 'feedbackConfig';
  return db.ref('rooms/' + roomIdParam + '/' + path).set(config);
}

// ═══ Survey Editor State ═══
var _seQuestions = [];
var _seType = '';
var _seRoomId = '';
var _seTemplateName = '';

function openSurveyEditor(type, editorRoomId) {
  _seType = type;
  _seRoomId = editorRoomId;
  if (!editorRoomId) { showNotification('error', '\u8ACB\u5148\u5EFA\u7ACB\u6559\u5BA4'); return; }

  // Load existing config or default template
  loadSurveyConfig(editorRoomId, type, function(existing) {
    if (existing && existing.questions) {
      _seQuestions = JSON.parse(JSON.stringify(existing.questions));
      _seTemplateName = existing.templateName || '';
    } else {
      // Pick default template
      var defaultKey = type === 'pre' ? 'pre-general' : 'post-general';
      var tmpl = SURVEY_TEMPLATES[defaultKey];
      _seQuestions = JSON.parse(JSON.stringify(tmpl.questions));
      _seTemplateName = defaultKey;
    }
    renderSurveyEditor();
  });
}

function renderSurveyEditor() {
  // Render into the appropriate area based on context
  var target = null;
  var prepareEl = document.getElementById('phasePrepare');
  if (prepareEl && prepareEl.classList.contains('active')) {
    target = prepareEl.querySelector('.main');
  }
  var cvBody = document.getElementById('cvMainBody');
  if (!target && cvBody && document.getElementById('courseView').classList.contains('active')) {
    target = cvBody;
  }
  var postEl = document.getElementById('phasePost');
  if (!target && postEl && postEl.classList.contains('active')) {
    target = postEl.querySelector('.main');
  }
  if (!target) {
    target = document.querySelector('#phasePrepare .main');
  }
  if (!target) return;

  var typeLabel = _seType === 'pre' ? '\u8AB2\u524D\u554F\u5377' : '\u8AB2\u5F8C\u554F\u5377';
  var typeTemplates = _seType === 'pre' ? ['pre-general'] : ['post-general', 'post-tech'];

  var html = '<div class="survey-editor">';
  html += '<div class="se-header">';
  html += '<h2>' + typeLabel + ' \u7DE8\u8F2F\u5668</h2>';
  html += '<select id="seTemplateSelect" onchange="applySurveyTemplate(this.value)">';
  html += '<option value="">\u2014 \u5957\u7528\u6A21\u677F \u2014</option>';
  typeTemplates.forEach(function(key) {
    var sel = _seTemplateName === key ? ' selected' : '';
    html += '<option value="' + key + '"' + sel + '>' + esc(SURVEY_TEMPLATES[key].name) + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Questions
  _seQuestions.forEach(function(q, idx) {
    html += '<div class="se-question" data-idx="' + idx + '">';
    html += '<div class="se-q-header">';
    html += '<span class="se-q-num">' + (idx + 1) + '</span>';
    html += '<input class="se-q-text" value="' + esc(q.text) + '" onchange="updateSeQuestion(' + idx + ',\'text\',this.value)">';
    html += '<button class="se-q-del" onclick="deleteSeQuestion(' + idx + ')">\u522A\u9664</button>';
    html += '</div>';
    html += '<div class="se-q-row">';
    html += '<select onchange="updateSeQuestion(' + idx + ',\'type\',this.value);renderSurveyEditor()">';
    ['rating', 'single', 'text', 'email', 'boolean'].forEach(function(t) {
      html += '<option value="' + t + '"' + (q.type === t ? ' selected' : '') + '>' + getTypeLabel(t) + '</option>';
    });
    html += '</select>';
    html += '<label><input type="checkbox"' + (q.required ? ' checked' : '') + ' onchange="updateSeQuestion(' + idx + ',\'required\',this.checked)"> \u5FC5\u586B</label>';
    html += '<span class="se-type-badge">' + getTypeLabel(q.type) + '</span>';
    html += '</div>';

    // Options for 'single' type
    if (q.type === 'single') {
      var opts = q.options || [];
      html += '<div class="se-options">';
      opts.forEach(function(o, oi) {
        html += '<div class="se-opt-row">';
        html += '<input value="' + esc(o) + '" onchange="updateSeOption(' + idx + ',' + oi + ',this.value)" placeholder="\u9078\u9805 ' + (oi + 1) + '">';
        if (opts.length > 2) {
          html += '<button onclick="removeSeOption(' + idx + ',' + oi + ')">\u2715</button>';
        } else {
          html += '<button style="visibility:hidden">\u2715</button>';
        }
        html += '</div>';
      });
      html += '<button class="se-add-opt" onclick="addSeOption(' + idx + ')">+ \u65B0\u589E\u9078\u9805</button>';
      html += '</div>';
    }

    html += '</div>';
  });

  html += '<button class="se-add-q" onclick="addSeQuestion()">+ \u65B0\u589E\u554F\u984C</button>';

  html += '<div class="se-actions">';
  html += '<button class="se-btn-back" onclick="closeSurveyEditor()">\u2190 \u8FD4\u56DE</button>';
  html += '<button class="se-btn-preview" onclick="previewSurveyFromEditor()">\u9810\u89BD</button>';
  html += '<button class="se-btn-save" onclick="saveSurveyFromEditor()">\u5132\u5B58</button>';
  html += '</div>';
  html += '</div>';

  target.innerHTML = html;
}

function getTypeLabel(type) {
  var labels = { rating: '1-5 \u661F\u8A55\u5206', single: '\u55AE\u9078', text: '\u81EA\u7531\u6587\u5B57', email: 'Email \u6B04\u4F4D', boolean: '\u662F/\u5426' };
  return labels[type] || type;
}

function updateSeQuestion(idx, field, value) {
  if (_seQuestions[idx]) {
    _seQuestions[idx] = Object.assign({}, _seQuestions[idx]);
    _seQuestions[idx][field] = value;
  }
}

function deleteSeQuestion(idx) {
  _seQuestions = _seQuestions.filter(function(_, i) { return i !== idx; });
  renderSurveyEditor();
}

function addSeQuestion() {
  _seQuestions = _seQuestions.concat([{
    id: 'q' + Date.now(),
    text: '\u65B0\u554F\u984C',
    type: 'text',
    required: false
  }]);
  renderSurveyEditor();
}

function updateSeOption(qIdx, optIdx, value) {
  if (_seQuestions[qIdx] && _seQuestions[qIdx].options) {
    var newOpts = _seQuestions[qIdx].options.slice();
    newOpts[optIdx] = value;
    _seQuestions[qIdx] = Object.assign({}, _seQuestions[qIdx], { options: newOpts });
  }
}

function removeSeOption(qIdx, optIdx) {
  if (_seQuestions[qIdx] && _seQuestions[qIdx].options) {
    var newOpts = _seQuestions[qIdx].options.filter(function(_, i) { return i !== optIdx; });
    _seQuestions[qIdx] = Object.assign({}, _seQuestions[qIdx], { options: newOpts });
    renderSurveyEditor();
  }
}

function addSeOption(qIdx) {
  if (_seQuestions[qIdx]) {
    var newOpts = (_seQuestions[qIdx].options || []).concat(['']);
    _seQuestions[qIdx] = Object.assign({}, _seQuestions[qIdx], { options: newOpts });
    renderSurveyEditor();
  }
}

function applySurveyTemplate(key) {
  if (!key || !SURVEY_TEMPLATES[key]) return;
  if (_seQuestions.length > 0 && !confirm('\u5957\u7528\u6A21\u677F\u5C07\u8986\u84CB\u76EE\u524D\u7684\u554F\u984C\uFF0C\u78BA\u5B9A\uFF1F')) {
    document.getElementById('seTemplateSelect').value = _seTemplateName || '';
    return;
  }
  _seTemplateName = key;
  _seQuestions = JSON.parse(JSON.stringify(SURVEY_TEMPLATES[key].questions));
  renderSurveyEditor();
}

function saveSurveyFromEditor() {
  if (!_seRoomId) { showNotification('error', '\u7121\u6CD5\u5132\u5B58\uFF1A\u7F3A\u5C11 roomId'); return; }
  var config = {
    questions: _seQuestions,
    templateName: _seTemplateName,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  };
  saveSurveyConfig(_seRoomId, _seType, config).then(function() {
    showNotification('success', (_seType === 'pre' ? '\u8AB2\u524D' : '\u8AB2\u5F8C') + '\u554F\u5377\u5DF2\u5132\u5B58\uFF08' + _seQuestions.length + ' \u984C\uFF09');
    closeSurveyEditor();
  }).catch(function(e) {
    showNotification('error', '\u5132\u5B58\u5931\u6557\uFF1A' + e.message);
  });
}

function closeSurveyEditor() {
  if (currentPhase === 'preparing') {
    renderPreparingPhase();
  } else if (currentPhase === 'post-class') {
    renderPostClassPhase();
  } else if (document.getElementById('courseView').classList.contains('active')) {
    try {
      if (cvSelectedSessionIdx !== null && cvSessions[cvSelectedSessionIdx]) {
        if (cvSelectedPhase === 'prepare') {
          renderCVPrepare(cvSessions[cvSelectedSessionIdx]);
        } else if (cvSelectedPhase === 'post') {
          renderCVPost(cvSessions[cvSelectedSessionIdx]);
        } else {
          renderSessionList();
        }
      } else {
        renderSessionList();
      }
    } catch (e) {
      console.warn('closeSurveyEditor fallback:', e);
      renderSessionList();
    }
  } else {
    if (document.getElementById('courseView').classList.contains('active')) {
      renderSessionList();
    }
  }
}

// ═══ Survey Preview ═══
function previewSurveyConfig(type, previewRoomId) {
  if (!previewRoomId) { showNotification('error', '\u8ACB\u5148\u5EFA\u7ACB\u6559\u5BA4'); return; }
  loadSurveyConfig(previewRoomId, type, function(config) {
    var questions = [];
    if (config && config.questions) {
      questions = config.questions;
    } else {
      var defaultKey = type === 'pre' ? 'pre-general' : 'post-general';
      questions = SURVEY_TEMPLATES[defaultKey].questions;
    }
    renderSurveyPreview(questions, type);
  });
}

function previewSurveyFromEditor() {
  renderSurveyPreview(_seQuestions, _seType);
}

function renderSurveyPreview(questions, type) {
  var target = null;
  var prepareEl = document.getElementById('phasePrepare');
  if (prepareEl && prepareEl.classList.contains('active')) {
    target = prepareEl.querySelector('.main');
  }
  var cvBody = document.getElementById('cvMainBody');
  if (!target && cvBody && document.getElementById('courseView').classList.contains('active')) {
    target = cvBody;
  }
  var postEl = document.getElementById('phasePost');
  if (!target && postEl && postEl.classList.contains('active')) {
    target = postEl.querySelector('.main');
  }
  if (!target) target = document.querySelector('#phasePrepare .main');
  if (!target) return;

  var typeLabel = type === 'pre' ? '\u8AB2\u524D\u554F\u5377' : '\u8AB2\u5F8C\u554F\u5377';

  var html = '<div style="max-width:700px;margin:0 auto;padding:1rem">';
  html += '<div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:1rem">';
  html += '<button class="se-btn-back" onclick="closeSurveyPreview()" style="padding:0.4rem 0.8rem;border-radius:6px;font-size:0.85rem;background:var(--bg);color:var(--dim);border:1px solid var(--border);cursor:pointer">\u2190 \u8FD4\u56DE</button>';
  html += '<h2 style="font-size:1rem;color:var(--gold)">' + typeLabel + ' \u9810\u89BD</h2>';
  html += '<span style="font-size:0.8rem;color:var(--dim)">\uFF08\u5B78\u54E1\u8996\u89D2\uFF09</span>';
  html += '</div>';

  html += '<div class="survey-preview">';
  html += '<h3>' + typeLabel + '</h3>';

  questions.forEach(function(q, idx) {
    html += '<div class="sp-question">';
    html += '<div class="sp-label">' + (idx + 1) + '. ' + esc(q.text);
    if (q.required) html += '<span class="sp-req">*</span>';
    html += '</div>';

    if (q.type === 'rating') {
      html += '<div class="sp-stars">';
      for (var s = 1; s <= 5; s++) {
        html += '<span>&#9734;</span>';
      }
      html += '</div>';
    } else if (q.type === 'single') {
      html += '<div class="sp-radio-group">';
      (q.options || []).forEach(function(opt, oi) {
        html += '<label class="sp-radio"><input type="radio" name="preview_q' + idx + '" disabled> ' + esc(opt) + '</label>';
      });
      html += '</div>';
    } else if (q.type === 'text') {
      html += '<textarea class="sp-text" rows="2" disabled placeholder="\u5B78\u54E1\u8F38\u5165..."></textarea>';
    } else if (q.type === 'email') {
      html += '<input class="sp-email" type="email" disabled placeholder="name@example.com">';
    } else if (q.type === 'boolean') {
      html += '<div class="sp-boolean">';
      html += '<label><input type="radio" name="preview_q' + idx + '" disabled> \u662F</label>';
      html += '<label><input type="radio" name="preview_q' + idx + '" disabled> \u5426</label>';
      html += '</div>';
    }

    html += '</div>';
  });

  html += '</div>';
  html += '</div>';

  target.innerHTML = html;
}

function closeSurveyPreview() {
  if (_seQuestions.length > 0 && _seRoomId) {
    renderSurveyEditor();
    return;
  }
  closeSurveyEditor();
}

// ═══ Survey Status Helpers ═══
function refreshSurveyStatuses() {
  if (!roomId) return;
  loadSurveyConfig(roomId, 'pre', function(config) {
    var label = document.getElementById('preSurveyLabel');
    if (!label) return;
    if (config && config.questions && config.questions.length) {
      label.textContent = '\u2713 \u5DF2\u8A2D\u5B9A\uFF08' + config.questions.length + ' \u984C\uFF09';
      label.className = 'ss-label ss-ok';
    } else {
      label.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
      label.className = 'ss-label ss-no';
    }
  });
  loadSurveyConfig(roomId, 'post', function(config) {
    var label = document.getElementById('postSurveyLabel');
    if (!label) return;
    if (config && config.questions && config.questions.length) {
      label.textContent = '\u2713 \u5DF2\u8A2D\u5B9A\uFF08' + config.questions.length + ' \u984C\uFF09';
      label.className = 'ss-label ss-ok';
    } else {
      label.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
      label.className = 'ss-label ss-no';
    }
    var mgmtLabel = document.getElementById('postSurveyMgmtLabel');
    if (mgmtLabel) {
      if (config && config.questions && config.questions.length) {
        var tmplName = config.templateName ? (SURVEY_TEMPLATES[config.templateName] ? SURVEY_TEMPLATES[config.templateName].name : config.templateName) : '\u81EA\u8A02';
        mgmtLabel.textContent = tmplName + '\uFF08' + config.questions.length + ' \u984C\uFF09';
        mgmtLabel.className = 'ss-label ss-ok';
      } else {
        mgmtLabel.textContent = '\u5C1A\u672A\u8A2D\u5B9A';
        mgmtLabel.className = 'ss-label ss-no';
      }
    }
  });
}

function refreshPostSurveyMgmtCount() {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/feedback').once('value', function(snap) {
    var count = snap.numChildren();
    var el = document.getElementById('postSurveyMgmtCount');
    if (el) {
      el.textContent = count > 0 ? '\u5DF2\u6536\u5230 ' + count + ' \u4EFD\u56DE\u994B' : '\u5C1A\u7121\u56DE\u994B';
    }
  });
}
