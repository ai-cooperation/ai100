// ClassClaw — backup
// backupToSheets, clearRoomData, exportData, exportRoomData

// ═══ Sheets Backup ═══
async function backupToSheets(rid, title) {
  var gasUrl = localStorage.getItem('_gas_backup_url');
  if (!gasUrl) { showNotification('error', '\u8ACB\u5148\u5728\u5927\u5EF3\u8A2D\u5B9A Sheets \u5099\u4EFD URL'); return; }

  showNotification('info', '\uD83D\uDCE4 \u5099\u4EFD\u4E2D...');

  try {
    var [wallSnap, qaSnap, qaRepliesSnap, feedbackSnap, presSnap, configSnap] = await Promise.all([
      db.ref('rooms/' + rid + '/wall').orderByChild('ts').once('value'),
      db.ref('rooms/' + rid + '/qa').once('value'),
      db.ref('rooms/' + rid + '/qaReplies').once('value'),
      db.ref('rooms/' + rid + '/feedback').once('value'),
      db.ref('rooms/' + rid + '/presence').once('value'),
      db.ref('rooms/' + rid + '/config').once('value')
    ]);

    var cfg = configSnap.val() || {};
    var wallArr = []; wallSnap.forEach(function(c) { wallArr.push(c.val()); });
    var qaArr = []; qaSnap.forEach(function(c) { var v = c.val(); v._id = c.key; qaArr.push(v); });
    var feedbackArr = feedbackSnap.val() ? Object.values(feedbackSnap.val()) : [];

    var cName = title;
    if (cfg.courseId) {
      try {
        var cSnap = await db.ref('courses/' + cfg.courseId + '/config/title').once('value');
        if (cSnap.val()) cName = cSnap.val();
      } catch (e) {}
    }

    var payload = {
      action: 'backup',
      roomId: rid,
      title: title,
      courseName: cName,
      date: rid.substring(0, 8),
      presence: { count: presSnap.numChildren() },
      wall: wallArr,
      qa: qaArr,
      qaReplies: qaRepliesSnap.val() || {},
      feedback: feedbackArr
    };

    var res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    var result = await res.json();

    if (result.success) {
      var msg = '\u2705 \u5099\u4EFD\u5B8C\u6210\n\n' +
        '\uD83D\uDCCA \u56DE\u994B\uFF1A' + (result.feedbackSaved || 0) + ' \u7B46\n' +
        '\uD83D\uDC65 \u5B78\u54E1\uFF1A' + (result.studentsUpserted || 0) + ' \u4EBA\n' +
        '\uD83D\uDCAC \u8A0A\u606F\u7246\uFF1A' + wallArr.length + ' \u5247\n' +
        '\u2753 \u554F\u7B54\uFF1A' + qaArr.length + ' \u5247';
      if (confirm(msg + '\n\n\u8981\u958B\u555F Google Sheet \u67E5\u770B\u55CE\uFF1F')) {
        window.open('https://drive.google.com/open?id=1XyE02dzKVZKx08wXpt4bSdv_HTB0EgzlshEUlreB4LY', '_blank');
      }
    } else {
      showNotification('error', '\u5099\u4EFD\u5931\u6557\uFF1A' + (result.message || result.error || '\u672A\u77E5\u932F\u8AA4'));
    }
  } catch (e) {
    showNotification('error', '\u5099\u4EFD\u5931\u6557\uFF1A' + e.message);
  }
}

function clearRoomData(rid) {
  if (!confirm('\u78BA\u5B9A\u6E05\u7A7A\u6B64\u6559\u5BA4\u7684\u4E92\u52D5\u8CC7\u6599\uFF1F\n\uFF08config\u3001\u6559\u6750\u8A2D\u5B9A\u3001\u554F\u5377\u8A2D\u5B9A\u6703\u4FDD\u7559\uFF09')) return;
  if (!confirm('\u518D\u6B21\u78BA\u8A8D\uFF1A\u6E05\u7A7A\u5F8C\u7121\u6CD5\u5FA9\u539F\uFF0C\u8ACB\u78BA\u8A8D\u5DF2\u5099\u4EFD\u5230 Sheets')) return;

  var updates = {};
  ['wall', 'qa', 'qaUps', 'qaReplies', 'currentVote', 'votes', 'presence', 'feedback', 'feedbackAnalysis', 'voiceCommands', 'agentActions', 'agentAdvice', 'agentStatus'].forEach(function(path) {
    updates['rooms/' + rid + '/' + path] = null;
  });

  db.ref().update(updates).then(function() {
    showNotification('success', '\uD83D\uDDD1 \u5DF2\u6E05\u7A7A\u4E92\u52D5\u8CC7\u6599');
  }).catch(function(e) {
    showNotification('error', '\u6E05\u7A7A\u5931\u6557\uFF1A' + e.message);
  });
}

// ═══ Export ═══
async function exportRoomData(rid, title) {
  var _rid = rid, _title = title;
  var _ws = await db.ref('rooms/' + _rid + '/wall').orderByChild('ts').once('value');
  var _qs = await db.ref('rooms/' + _rid + '/qa').once('value');
  var _fb = await db.ref('rooms/' + _rid + '/feedback').once('value');
  var _ps = await db.ref('rooms/' + _rid + '/presence').once('value');
  var _rps = (await db.ref('rooms/' + _rid + '/qaReplies').once('value')).val() || {};

  var msgs = []; _ws.forEach(function(c) { msgs.push(c.val()); });
  var qas = []; _qs.forEach(function(c) { qas.push({ id: c.key, text: c.val().text, name: c.val().name, ts: c.val().ts, ups: c.val().ups }); });
  qas.sort(function(a, b) { return (b.ups || 0) - (a.ups || 0); });
  var fbEntries = _fb.val() ? Object.values(_fb.val()) : [];

  var ds = new Date().toISOString().slice(0, 10);
  var wH = ''; if (msgs.length) { wH = '<div class="section"><h2>\uD83D\uDCAC \u8A0A\u606F\u7246(' + msgs.length + ')</h2>'; msgs.forEach(function(m) { var r = m.role || 'student'; wH += '<div class="msg ' + r + '"><b class="' + r + '">' + (r === 'ai' ? '\uD83E\uDD16' : r === 'teacher' ? '\uD83D\uDC68\u200D\uD83C\uDFEB' : '') + esc(m.name) + '</b> <small>' + timeStr(m.ts) + '</small><p>' + esc(m.text) + '</p></div>'; }); wH += '</div>'; }
  var qH = ''; if (qas.length) { qH = '<div class="section"><h2>\u2753 \u554F\u7B54(' + qas.length + ')</h2>'; qas.forEach(function(q) { qH += '<div class="qa"><b>\u25B2' + (q.ups || 0) + '</b> ' + esc(q.text) + ' <small>\u2014' + esc(q.name) + '</small>'; var replies = _rps[q.id] ? Object.values(_rps[q.id]).sort(function(a, b) { return a.ts - b.ts; }) : []; replies.forEach(function(r) { qH += '<div class="rp ' + r.role + '"><b>' + (r.role === 'ai' ? '\uD83E\uDD16' : '\uD83D\uDC68\u200D\uD83C\uDFEB') + esc(r.name) + '</b> ' + esc(r.text) + '</div>'; }); qH += '</div>'; }); qH += '</div>'; }

  var fH = ''; if (fbEntries.length) {
    var satS = 0, satC = 0, recS = 0, recC = 0, emails = [];
    fbEntries.forEach(function(e) { if (e.ratings) { if (e.ratings.satisfaction) { satS += e.ratings.satisfaction; satC++; } if (e.ratings.recommend) { recS += e.ratings.recommend; recC++; } } if (e.email) emails.push(e.email); });
    fH = '<div class="section"><h2>\uD83D\uDCCA \u8AB2\u5F8C\u56DE\u994B(' + fbEntries.length + '\u4EBA)</h2>';
    fH += '<p>\u6EFF\u610F\u5EA6\uFF1A' + (satC ? (satS / satC).toFixed(1) : '-') + '/5 \u00B7 \u63A8\u85A6\u5EA6\uFF1A' + (recC ? (recS / recC).toFixed(1) : '-') + '/5</p>';
    if (emails.length) { fH += '<p>\uD83D\uDCE7 Email(' + emails.length + '\u4EBA)\uFF1A</p><ul>'; emails.forEach(function(e) { fH += '<li>' + esc(e) + '</li>'; }); fH += '</ul>'; }
    var sugs = []; fbEntries.forEach(function(e) { if (e.answers && e.answers.suggestion && e.answers.suggestion !== '(\u8DF3\u904E)') sugs.push(e.answers.suggestion); });
    if (sugs.length) { fH += '<p><b>\uD83D\uDCA1 \u5EFA\u8B70\uFF1A</b></p>'; sugs.forEach(function(s) { fH += '<div style="padding:4px 8px;margin:2px 0;background:#f5f5f5;border-radius:6px;border-left:3px solid #7C3AED;">' + esc(s) + '</div>'; }); }
    fH += '</div>';
  }

  var html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + esc(_title) + ' \u6210\u679C</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:\'Noto Sans TC\',system-ui,sans-serif;background:#F5F7FA;color:#1A1A1A;padding:2rem;max-width:900px;margin:0 auto}.hd{background:#0B3C5D;color:#fff;padding:2rem;border-radius:12px;margin-bottom:2rem;text-align:center}.hd h1{color:#FFC857;font-size:1.8rem}.hd .m{color:#D4F0EB;margin-top:0.5rem}.section{background:#fff;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,0.06)}.section h2{color:#0B3C5D;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:2px solid #D4F0EB}.msg{padding:0.5rem 0;border-bottom:1px solid #eee}.msg.ai{background:#EDE9FE;padding:0.5rem;border-radius:6px;margin:0.2rem 0}.msg.teacher{background:#FEF3C7;padding:0.5rem;border-radius:6px;margin:0.2rem 0}.msg b.ai{color:#7C3AED}.msg b.teacher{color:#d4a632}.msg p{margin-top:0.2rem;white-space:pre-wrap}.qa{padding:0.6rem 0;border-bottom:1px solid #eee}.rp{padding:0.4rem 0.6rem;margin:0.3rem 0 0.3rem 2rem;border-radius:6px}.rp.ai{background:#EDE9FE}.rp.teacher{background:#FEF3C7}ul{padding-left:1.5rem}li{margin:0.2rem 0}</style></head><body><div class="hd"><h1>' + esc(_title) + '</h1><div class="m">' + ds + ' \u00B7 ' + _ps.numChildren() + '\u4EBA \u00B7 ' + esc(_rid) + '</div></div>' + wH + qH + fH + '<div style="text-align:center;color:#999;font-size:0.8rem;margin-top:2rem">ClassClaw \u8AB2\u5802\u4E92\u52D5\u6210\u679C\u5831\u544A</div></body></html>';
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = _rid + '.html'; a.click();
}

async function exportData() {
  var ws = await db.ref('rooms/' + roomId + '/wall').orderByChild('ts').once('value');
  var qs = await db.ref('rooms/' + roomId + '/qa').once('value');
  var cvs = await db.ref('rooms/' + roomId + '/currentVote').once('value');
  var ps = await db.ref('rooms/' + roomId + '/presence').once('value');
  var rps = (await db.ref('rooms/' + roomId + '/qaReplies').once('value')).val() || {};
  var vH = ''; var cv = cvs.val();
  if (cv) { var vs = await db.ref('rooms/' + roomId + '/votes/' + cv.id).once('value'); var R = vs.val() || {}, C = {}, T = 0; (cv.options || []).forEach(function(_, i) { C[i] = 0; }); Object.values(R).forEach(function(v) { if (typeof v === 'number') { C[v] = (C[v] || 0) + 1; T++; } }); vH = '<div class="section"><h2>\uD83D\uDCCA ' + esc(cv.question) + '</h2>'; (cv.options || []).forEach(function(o, i) { var p = T ? Math.round(C[i] / T * 100) : 0; vH += '<div class="vr"><span class="vr-l">' + esc(o) + '</span><div class="vr-b"><div class="vr-f" style="width:' + p + '%;background:' + VC[i % 6] + '">' + p + '%</div></div><span class="vr-c">' + C[i] + '</span></div>'; }); vH += '<p class="vr-t">\u5171' + T + '\u4EBA</p></div>'; }
  var msgs = []; ws.forEach(function(c) { msgs.push(c.val()); }); var wH = ''; if (msgs.length) { wH = '<div class="section"><h2>\uD83D\uDCAC \u8A0A\u606F\u7246(' + msgs.length + ')</h2>'; msgs.forEach(function(m) { var r = m.role || 'student'; wH += '<div class="msg ' + r + '"><b class="' + r + '">' + (r === 'ai' ? '\uD83E\uDD16' : r === 'teacher' ? '\uD83D\uDC68\u200D\uD83C\uDFEB' : '') + esc(m.name) + '</b> <small>' + timeStr(m.ts) + '</small><p>' + esc(m.text) + '</p></div>'; }); wH += '</div>'; }
  var qas = []; qs.forEach(function(c) { qas.push({ id: c.key, text: c.val().text, name: c.val().name, ts: c.val().ts, ups: c.val().ups }); }); qas.sort(function(a, b) { return (b.ups || 0) - (a.ups || 0); }); var qH = ''; if (qas.length) { qH = '<div class="section"><h2>\u2753 \u554F\u7B54(' + qas.length + ')</h2>'; qas.forEach(function(q) { qH += '<div class="qa"><b>\u25B2' + (q.ups || 0) + '</b> ' + esc(q.text) + ' <small>\u2014' + esc(q.name) + '</small>'; var replies = rps[q.id] ? Object.values(rps[q.id]).sort(function(a, b) { return a.ts - b.ts; }) : []; replies.forEach(function(r) { qH += '<div class="rp ' + r.role + '"><b>' + (r.role === 'ai' ? '\uD83E\uDD16' : '\uD83D\uDC68\u200D\uD83C\uDFEB') + esc(r.name) + '</b> ' + esc(r.text) + '</div>'; }); qH += '</div>'; }); qH += '</div>'; }
  var ds = new Date().toISOString().slice(0, 10);
  var html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + esc(roomTitle) + ' \u6210\u679C</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:\'Noto Sans TC\',system-ui,sans-serif;background:#F5F7FA;color:#1A1A1A;padding:2rem;max-width:900px;margin:0 auto}.hd{background:#0B3C5D;color:#fff;padding:2rem;border-radius:12px;margin-bottom:2rem;text-align:center}.hd h1{color:#FFC857;font-size:1.8rem}.hd .m{color:#D4F0EB;margin-top:0.5rem}.section{background:#fff;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,0.06)}.section h2{color:#0B3C5D;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:2px solid #D4F0EB}.msg{padding:0.5rem 0;border-bottom:1px solid #eee}.msg.ai{background:#EDE9FE;padding:0.5rem;border-radius:6px;margin:0.2rem 0}.msg.teacher{background:#FEF3C7;padding:0.5rem;border-radius:6px;margin:0.2rem 0}.msg b.ai{color:#7C3AED}.msg b.teacher{color:#d4a632}.msg p{margin-top:0.2rem;white-space:pre-wrap}.vr{display:flex;align-items:center;gap:0.8rem;margin-bottom:0.5rem}.vr-l{min-width:100px;font-weight:700}.vr-b{flex:1;height:24px;background:#eee;border-radius:4px;overflow:hidden}.vr-f{height:100%;border-radius:4px;color:#fff;font-size:0.75rem;display:flex;align-items:center;justify-content:flex-end;padding-right:0.4rem}.vr-c{color:#666}.vr-t{text-align:center;color:#666}.qa{padding:0.6rem 0;border-bottom:1px solid #eee}.rp{padding:0.4rem 0.6rem;margin:0.3rem 0 0.3rem 2rem;border-radius:6px}.rp.ai{background:#EDE9FE}.rp.teacher{background:#FEF3C7}</style></head><body><div class="hd"><h1>' + esc(roomTitle) + '</h1><div class="m">' + ds + ' \u00B7 ' + ps.numChildren() + '\u4EBA \u00B7 ' + esc(roomId) + '</div></div>' + vH + wH + qH + '<div style="text-align:center;color:#999;font-size:0.8rem;margin-top:2rem">AI \u8AB2\u5802\u4E92\u52D5\u6210\u679C</div></body></html>';
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = roomId + '.html'; a.click();
}
