// ClassClaw — post
// Post-class phase, feedback report, email panel, email history

// ═══ Post-class Phase Rendering ═══
function renderPostClassPhase() {
  if (!roomId) return;

  var sel = document.getElementById('postDeckSelect');
  if (sel.options.length <= 1) {
    deckOptions.forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.label;
      if (d.name === window._currentDeckName) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  db.ref('rooms/' + roomId + '/emailConfig').once('value', function(ecSnap) {
    var ec = ecSnap.val();
    if (ec) {
      var linkEl = document.getElementById('postDeckLink');
      if (ec.shareLink && linkEl) linkEl.value = ec.shareLink;
    }
  });

  refreshSurveyStatuses();
  refreshPostSurveyMgmtCount();

  db.ref('rooms/' + roomId + '/feedback').once('value', function(snap) {
    var data = snap.val();
    if (!data) {
      document.getElementById('postKpiCount').textContent = '0';
      document.getElementById('postKpiSat').textContent = '-';
      document.getElementById('postKpiRec').textContent = '-';
      document.getElementById('postHelpful').style.display = 'none';
      document.getElementById('postSuggestions').style.display = 'none';
      return;
    }

    var entries = Object.values(data);
    var total = entries.length;
    var satSum = 0, satCount = 0, recSum = 0, recCount = 0;
    var helpful = {};
    var suggestions = [];
    var postEmailList = [], postWantPdfCount = 0;

    entries.forEach(function(e) {
      if (e.ratings) {
        if (e.ratings.satisfaction) { satSum += e.ratings.satisfaction; satCount++; }
        if (e.ratings.recommend) { recSum += e.ratings.recommend; recCount++; }
      }
      if (e.email) { postEmailList.push({ email: e.email, name: e.name || '' }); if (e.wantPdf) postWantPdfCount++; }
      if (e.answers) {
        if (e.answers.helpful) {
          var h = e.answers.helpful;
          helpful[h] = (helpful[h] || 0) + 1;
        }
        if (e.answers.suggestion && e.answers.suggestion !== '(\u8DF3\u904E)') {
          suggestions.push(e.answers.suggestion);
        }
      }
    });

    document.getElementById('postKpiCount').textContent = total;
    document.getElementById('postKpiSat').textContent = satCount ? (satSum / satCount).toFixed(1) : '-';
    document.getElementById('postKpiRec').textContent = recCount ? (recSum / recCount).toFixed(1) : '-';

    var helpfulSorted = Object.entries(helpful).sort(function(a, b) { return b[1] - a[1]; });
    var helpSection = document.getElementById('postHelpful');
    var helpList = document.getElementById('postHelpfulList');
    if (helpfulSorted.length) {
      helpSection.style.display = 'block';
      helpList.innerHTML = helpfulSorted.slice(0, 5).map(function(h) {
        return '<div class="post-item"><span>' + esc(h[0]) + '</span><span class="count">' + h[1] + ' \u4EBA</span></div>';
      }).join('');
    } else {
      helpSection.style.display = 'none';
    }

    var sugSection = document.getElementById('postSuggestions');
    var sugList = document.getElementById('postSuggestionsList');
    if (suggestions.length) {
      sugSection.style.display = 'block';
      sugList.innerHTML = suggestions.map(function(s) {
        return '<div class="post-suggestion">' + esc(s) + '</div>';
      }).join('');
    } else {
      sugSection.style.display = 'none';
    }

    var emailSection = document.getElementById('postEmailList');
    if (emailSection) {
      if (postEmailList.length) {
        var eHtml = '<h3>\uD83D\uDCE7 \u6536\u4EF6\u4EBA\uFF08' + postEmailList.length + ' \u4EBA\uFF0C' + postWantPdfCount + ' \u4EBA\u8981 PDF\uFF09</h3>';
        eHtml += '<div style="max-height:150px;overflow-y:auto;background:var(--bg);border-radius:8px;padding:0.5rem;margin-top:0.5rem">';
        postEmailList.forEach(function(r) {
          eHtml += '<div style="font-size:0.85rem;color:var(--text);padding:3px 0">' + esc(r.email) + (r.name ? ' <span style="color:var(--dim)">' + esc(r.name) + '</span>' : '') + '</div>';
        });
        eHtml += '</div>';
        emailSection.innerHTML = eHtml;
        emailSection.style.display = 'block';
      } else {
        emailSection.innerHTML = '<h3>\uD83D\uDCE7 \u6536\u4EF6\u4EBA</h3><div style="font-size:0.85rem;color:var(--dim);margin-top:0.3rem">\u5C1A\u7121\u4EBA\u7559 email</div>';
        emailSection.style.display = 'block';
      }
    }
  });
}

function postUpdateDeckLink() {
  var deck = document.getElementById('postDeckSelect').value;
  if (deck) {
    document.getElementById('postDeckLink').value = 'https://ai100.cooperation.tw/slides/pdf/' + deck + '.pdf';
  }
}

function postOpenEmailPanel() {
  showReport();
  switchReportTab('email');
}

function copyEmails() {
  if (window._reportEmails && window._reportEmails.length) {
    navigator.clipboard.writeText(window._reportEmails.join('\n')).then(function() {
      showNotification('success', '\u5DF2\u8907\u88FD ' + window._reportEmails.length + ' \u500B email');
    });
  }
}

// ═══ Report Panel Tabs ═══
function switchReportTab(tab) {
  document.getElementById('reportContent').style.display = tab === 'report' ? 'block' : 'none';
  document.getElementById('emailContent').style.display = tab === 'email' ? 'block' : 'none';
  document.getElementById('historyContent').style.display = tab === 'history' ? 'block' : 'none';
  var activeStyle = 'padding:6px 14px;border-radius:6px;font-size:0.85rem;font-weight:700;cursor:pointer;border:none;';
  document.getElementById('tabReport').style.cssText = activeStyle + (tab === 'report' ? 'background:#0F9D8A;color:#fff;' : 'background:#0d1117;color:#7d8590;border:1px solid #30363d;');
  document.getElementById('tabEmail').style.cssText = activeStyle + (tab === 'email' ? 'background:#1A73E8;color:#fff;' : 'background:#0d1117;color:#7d8590;border:1px solid #30363d;');
  document.getElementById('tabHistory').style.cssText = activeStyle + (tab === 'history' ? 'background:#7C3AED;color:#fff;' : 'background:#0d1117;color:#7d8590;border:1px solid #30363d;');
  if (tab === 'email') initEmailPanel();
  if (tab === 'history') loadEmailHistory();
}

// ═══ Email Panel ═══
var _feedbackRecipients = { wantPdf: [], all: [] };

function initEmailPanel() {
  if (!roomId) return;
  var sel = document.getElementById('emailDeckSelect');
  if (sel.options.length <= 1) {
    deckOptions.forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.label;
      if (d.name === window._currentDeckName) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  db.ref('rooms/' + roomId + '/emailConfig').once('value', function(ecSnap) {
    var ec = ecSnap.val();
    if (ec) {
      var linkEl = document.getElementById('emailLink');
      if (ec.shareLink && linkEl && !linkEl.value) linkEl.value = ec.shareLink;
      if (ec.subject) {
        var subEl = document.getElementById('emailSubject');
        if (subEl) subEl.value = ec.subject;
      }
      if (ec.message) {
        var bodyEl = document.getElementById('emailBody');
        if (bodyEl && !bodyEl.value.trim()) bodyEl.value = ec.message;
      }
    }
  });

  db.ref('rooms/' + roomId + '/feedback').once('value', function(snap) {
    var data = snap.val();
    _feedbackRecipients = { wantPdf: [], all: [] };
    if (data) {
      Object.values(data).forEach(function(e) {
        if (e.email) {
          _feedbackRecipients.all.push({ email: e.email, name: e.name || '' });
          if (e.wantPdf) _feedbackRecipients.wantPdf.push({ email: e.email, name: e.name || '' });
        }
      });
    }
    updateEmailCount();
  });

  var body = document.getElementById('emailBody');
  if (!body.value.trim()) {
    body.value = 'Hi {name}\uFF0C\n\n\u611F\u8B1D\u4F60\u53C3\u52A0\u8AB2\u7A0B\uFF01\n\n\uD83D\uDCCE \u7C21\u5831\u9023\u7D50\uFF1A{link}\n\n\u26A0\uFE0F \u6B64\u70BA\u8AB2\u7A0B\u6559\u6750\uFF0C\u8ACB\u4FDD\u8B77\u7248\u6B0A\uFF0C\u52FF\u516C\u958B\u6563\u5E03\u3002\n\u5982\u6709\u554F\u984C\u6B61\u8FCE\u56DE\u4FE1\u3002\n\n\u2014 AI 100 \u8B1B \u8B1B\u5E2B';
  }
}

function updateEmailCount() {
  var target = document.querySelector('input[name="emailTarget"]:checked').value;
  var list = _feedbackRecipients[target] || [];
  document.getElementById('emailCount').textContent = list.length + ' \u4EBA';
}

function updateEmailLink() {
  var deck = document.getElementById('emailDeckSelect').value;
  if (deck) {
    document.getElementById('emailLink').value = 'https://ai100.cooperation.tw/slides/pdf/' + deck + '.pdf';
  }
}

function getEmailRecipients() {
  var target = document.querySelector('input[name="emailTarget"]:checked').value;
  return _feedbackRecipients[target] || [];
}

function buildEmailHtml(bodyText, link) {
  var lines = bodyText.replace(/\{link\}/g, link ? '<a href="' + link + '" style="color:#0F9D8A;">' + link + '</a>' : '\uFF08\u672A\u8A2D\u5B9A\u9023\u7D50\uFF09');
  return '<div style="font-family:Noto Sans TC,sans-serif;max-width:600px;margin:0 auto;padding:20px;">'
    + '<div style="background:#0B3C5D;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">'
    + '<h1 style="margin:0;font-size:1.3rem;">AI 100 \u8B1B</h1>'
    + '<p style="margin:5px 0 0;color:#FFC857;">\u8AB2\u7A0B\u7C21\u5831</p></div>'
    + '<div style="background:#F8F9FA;padding:24px;border-radius:0 0 12px 12px;">'
    + '<div style="font-size:1rem;line-height:1.8;white-space:pre-wrap;">' + lines.replace(/\n/g, '<br>') + '</div>'
    + '</div></div>';
}

function previewEmail() {
  var body = document.getElementById('emailBody').value;
  var link = document.getElementById('emailLink').value;
  var html = buildEmailHtml(body, link).replace(/\{name\}/g, '\u5C0F\u660E');
  var el = document.getElementById('emailPreview');
  el.innerHTML = html;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function sendEmail() {
  var gasUrl = localStorage.getItem('_gas_url');
  if (!gasUrl) {
    showNotification('error', '\u8ACB\u5148\u8A2D\u5B9A GAS URL');
    return;
  }
  var recipients = getEmailRecipients();
  if (!recipients.length) { showNotification('error', '\u6C92\u6709\u6536\u4EF6\u4EBA'); return; }

  var subject = document.getElementById('emailSubject').value.trim();
  var bodyText = document.getElementById('emailBody').value;
  var link = document.getElementById('emailLink').value;
  if (!subject) { showNotification('error', '\u8ACB\u586B\u5BEB\u4E3B\u984C'); return; }
  if (!confirm('\u78BA\u5B9A\u767C\u9001\u7D66 ' + recipients.length + ' \u4EBA\uFF1F')) return;

  var htmlBody = buildEmailHtml(bodyText, link);
  var btn = document.getElementById('btnSendEmail');
  var status = document.getElementById('emailStatus');
  btn.disabled = true;
  btn.textContent = '\u23F3 \u5BC4\u9001\u4E2D...';
  status.textContent = '';

  fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      recipients: recipients,
      subject: subject,
      body: htmlBody,
      senderName: 'AI 100 \u8B1B'
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    btn.disabled = false;
    if (d.success) {
      btn.textContent = '\u2705 \u5BC4\u9001\u5B8C\u6210';
      status.textContent = '\u6210\u529F ' + d.sent + ' \u5C01' + (d.failed ? '\uFF0C\u5931\u6557 ' + d.failed + ' \u5C01' : '');
      status.style.color = '#0F9D8A';
      var deck = document.getElementById('emailDeckSelect').value;
      db.ref('rooms/' + roomId + '/emailHistory').push({
        deck: deck || '(\u81EA\u8A02)',
        subject: subject,
        link: link,
        recipientCount: recipients.length,
        sent: d.sent,
        failed: d.failed || 0,
        ts: firebase.database.ServerValue.TIMESTAMP
      });
    } else {
      btn.textContent = '\uD83D\uDCE7 \u91CD\u8A66';
      status.textContent = '\u274C ' + d.message;
      status.style.color = '#DC2626';
    }
  })
  .catch(function(e) {
    btn.disabled = false;
    btn.textContent = '\uD83D\uDCE7 \u91CD\u8A66';
    status.textContent = '\u274C \u7DB2\u8DEF\u932F\u8AA4: ' + e.message;
    status.style.color = '#DC2626';
  });
}

// ═══ Email History ═══
function loadEmailHistory() {
  if (!roomId) return;
  var el = document.getElementById('historyContent');
  db.ref('rooms/' + roomId + '/emailHistory').orderByChild('ts').once('value', function(snap) {
    var data = snap.val();
    if (!data) { el.innerHTML = '<p style="color:#7d8590;text-align:center;padding:2rem;">\u5C1A\u7121\u5BC4\u9001\u7D00\u9304</p>'; return; }
    var entries = Object.values(data).sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
    var html = '';
    entries.forEach(function(e) {
      var d = e.ts ? new Date(e.ts) : null;
      var dateStr = d ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') : '';
      var statusIcon = e.failed ? '\u26A0\uFE0F' : '\u2705';
      html += '<div style="padding:8px;background:#0d1117;border-radius:8px;margin-bottom:6px;border:1px solid #30363d;">';
      html += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;">';
      html += '<span style="color:#e6edf3;font-weight:700;">' + statusIcon + ' ' + (e.deck || '') + '</span>';
      html += '<span style="color:#7d8590;">' + dateStr + '</span></div>';
      html += '<div style="font-size:0.8rem;color:#7d8590;margin-top:4px;">';
      html += e.sent + '/' + e.recipientCount + ' \u5C01\u6210\u529F';
      if (e.link) html += ' \u00B7 <a href="' + e.link + '" target="_blank" style="color:#0F9D8A;">\u9023\u7D50</a>';
      html += '</div></div>';
    });
    el.innerHTML = html;
  });
}

// ═══ Feedback Report ═══
function showReport() {
  var p = document.getElementById('reportPanel');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
  if (p.style.display === 'flex') loadReport();
}

function hideReport() {
  document.getElementById('reportPanel').style.display = 'none';
}

function loadReport() {
  if (!roomId) return;
  db.ref('rooms/' + roomId + '/feedback').once('value', function(snap) {
    var data = snap.val();
    var el = document.getElementById('reportContent');
    if (!data) { el.innerHTML = '<p style="color:#7d8590;text-align:center;padding:2rem;">\u5C1A\u7121\u56DE\u994B\u8CC7\u6599</p>'; return; }

    var entries = Object.values(data);
    var total = entries.length;
    var satSum = 0, satCount = 0;
    var recSum = 0, recCount = 0;
    var emails = [];
    var wantPdfCount = 0;
    var helpful = {};
    var suggestions = [];

    entries.forEach(function(e) {
      if (e.ratings) {
        if (e.ratings.satisfaction) { satSum += e.ratings.satisfaction; satCount++; }
        if (e.ratings.recommend) { recSum += e.ratings.recommend; recCount++; }
      }
      if (e.email) emails.push(e.email);
      if (e.wantPdf) wantPdfCount++;
      if (e.answers) {
        if (e.answers.helpful) {
          var h = e.answers.helpful;
          helpful[h] = (helpful[h] || 0) + 1;
        }
        if (e.answers.suggestion && e.answers.suggestion !== '(\u8DF3\u904E)') {
          suggestions.push(e.answers.suggestion);
        }
      }
    });

    var satAvg = satCount ? (satSum / satCount).toFixed(1) : '-';
    var recAvg = recCount ? (recSum / recCount).toFixed(1) : '-';
    var helpfulSorted = Object.entries(helpful).sort(function(a, b) { return b[1] - a[1]; });

    var html = '';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">';
    html += '<div style="background:#0d1117;border-radius:10px;padding:12px;text-align:center;border:1px solid #30363d;"><div style="font-size:1.8rem;font-weight:900;color:#0F9D8A;">' + total + '</div><div style="font-size:0.75rem;color:#7d8590;">\u586B\u5BEB\u4EBA\u6578</div></div>';
    html += '<div style="background:#0d1117;border-radius:10px;padding:12px;text-align:center;border:1px solid #30363d;"><div style="font-size:1.8rem;font-weight:900;color:#FFC857;">' + satAvg + '</div><div style="font-size:0.75rem;color:#7d8590;">\u6EFF\u610F\u5EA6 /5</div></div>';
    html += '<div style="background:#0d1117;border-radius:10px;padding:12px;text-align:center;border:1px solid #30363d;"><div style="font-size:1.8rem;font-weight:900;color:#1A73E8;">' + recAvg + '</div><div style="font-size:0.75rem;color:#7d8590;">\u63A8\u85A6\u5EA6 /5</div></div>';
    html += '</div>';

    if (helpfulSorted.length) {
      html += '<div style="margin-bottom:12px;"><p style="font-size:0.85rem;color:#e6edf3;font-weight:700;margin-bottom:6px;">\uD83D\uDC4D \u6700\u6709\u5E6B\u52A9\u7684\u90E8\u5206</p>';
      helpfulSorted.slice(0, 5).forEach(function(kv) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:#0d1117;border-radius:6px;margin-bottom:3px;font-size:0.8rem;"><span style="color:#e6edf3;">' + kv[0] + '</span><span style="color:#0F9D8A;font-weight:700;">' + kv[1] + '\u4EBA</span></div>';
      });
      html += '</div>';
    }

    if (suggestions.length) {
      html += '<div style="margin-bottom:12px;"><p style="font-size:0.85rem;color:#e6edf3;font-weight:700;margin-bottom:6px;">\uD83D\uDCA1 \u5B78\u54E1\u5EFA\u8B70</p>';
      suggestions.forEach(function(s) {
        html += '<div style="padding:6px 8px;background:#0d1117;border-radius:6px;margin-bottom:3px;font-size:0.8rem;color:#e6edf3;border-left:3px solid #7C3AED;">' + s + '</div>';
      });
      html += '</div>';
    }

    html += '<div style="margin-bottom:12px;"><p style="font-size:0.85rem;color:#e6edf3;font-weight:700;margin-bottom:6px;">\uD83D\uDCE7 Email \u540D\u55AE (' + emails.length + '\u4EBA\uFF0C' + wantPdfCount + '\u4EBA\u8981PDF)</p>';
    if (emails.length) {
      html += '<div style="background:#0d1117;border-radius:8px;padding:8px;font-size:0.8rem;">';
      emails.forEach(function(e) {
        html += '<div style="padding:2px 0;color:#e6edf3;">' + e + '</div>';
      });
      html += '</div>';
      html += '<button onclick="copyEmails()" style="margin-top:6px;padding:6px 12px;background:#1A73E8;color:#fff;border:none;border-radius:6px;font-size:0.8rem;cursor:pointer;">\uD83D\uDCCB \u8907\u88FD\u5168\u90E8 Email</button>';
    } else {
      html += '<p style="font-size:0.8rem;color:#7d8590;">\u5C1A\u7121\u4EBA\u7559 email</p>';
    }
    html += '</div>';

    if (wantPdfCount > 0) {
      html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #30363d;">';
      html += '<button onclick="switchReportTab(\'email\')" style="width:100%;padding:10px;background:#1A73E8;color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:700;cursor:pointer;">\uD83D\uDCE7 \u5BC4\u9001\u6559\u6750\u7D66 ' + wantPdfCount + ' \u4EBA \u2192</button>';
      html += '</div>';
    }

    el.innerHTML = html;
    window._reportEmails = emails;
  });
}
