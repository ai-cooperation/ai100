/**
 * ClassClaw — GAS Sheets Backup
 *
 * 課堂資料備份到 Google Sheets：學員名冊、課堂摘要、課後回饋。
 * host.html 結束課堂時 POST 整包資料過來，這裡拆寫三個 tab。
 *
 * 部署方式（一次）：
 * 1. 開一個 Google Sheets（作為備份資料庫）
 * 2. 「擴充功能」→「Apps Script」→ 貼上此程式碼
 * 3. 「部署」→「新增部署」→「網頁應用程式」
 *    - 執行身分：我
 *    - 存取權限：任何人
 * 4. 複製部署 URL，貼到 host.html 設定面板
 *
 * POST /exec  → 備份課堂資料
 * GET  /exec?action=history  → 歷史總覽（sessions + feedback）
 * GET  /exec?action=students → 學員名冊（可加 &course=xxx 篩選）
 */

// ── Tab 定義 ──────────────────────────────────────────────

var TABS = {
  students:  { name: 'Students',  headers: ['email','name','wantPdf','courseName','sessionDate','addedAt'] },
  sessions:  { name: 'Sessions',  headers: ['roomId','date','title','courseName','presenceCount','wallCount','qaCount','feedbackCount','avgSatisfaction','avgRecommend','emailCount','backedUpAt'] },
  feedback:  { name: 'Feedback',  headers: ['roomId','date','name','email','wantPdf','satisfaction','recommend','helpful','pacing','unclear','suggestion'] }
};

// ── POST：接收備份 ────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action !== 'backup') {
      return jsonRes({ success: false, message: 'Unknown action: ' + data.action });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var roomId     = data.roomId || '';
    var date       = data.date || '';
    var title      = data.title || '';
    var courseName = data.courseName || '';
    var wall       = data.wall || [];
    var qa         = data.qa || [];
    var feedbacks  = data.feedback || [];
    var presence   = data.presence || {};
    var now        = new Date().toISOString();

    // ── Sessions tab ──
    var avgSat = avg(feedbacks, function(f) { return f.ratings && f.ratings.satisfaction; });
    var avgRec = avg(feedbacks, function(f) { return f.ratings && f.ratings.recommend; });
    var emailCount = feedbacks.filter(function(f) { return f.email; }).length;

    appendRow(ss, 'sessions', [
      roomId, date, title, courseName,
      presence.count || 0,
      wall.length, qa.length, feedbacks.length,
      avgSat, avgRec, emailCount, now
    ]);

    // ── Feedback tab ──
    feedbacks.forEach(function(f) {
      var r = f.ratings || {};
      var a = f.answers || {};
      appendRow(ss, 'feedback', [
        roomId, date,
        f.name || '', f.email || '', f.wantPdf ? 'TRUE' : 'FALSE',
        r.satisfaction || '', r.recommend || '',
        a.helpful || '', a.pacing || '', a.unclear || '', a.suggestion || ''
      ]);
    });

    // ── Students tab（dedup by email）──
    var studentSheet = getOrCreateSheet(ss, 'students');
    var existingData = studentSheet.getDataRange().getValues();
    var emailIndex = {};
    // row 0 is header, build email → row map
    for (var i = 1; i < existingData.length; i++) {
      emailIndex[existingData[i][0]] = i + 1; // 1-based sheet row
    }

    feedbacks.forEach(function(f) {
      if (!f.email) return;
      var row = [f.email, f.name || '', f.wantPdf ? 'TRUE' : 'FALSE', courseName, date, now];
      var existingRow = emailIndex[f.email];
      if (existingRow) {
        // Update courseName, sessionDate, addedAt (cols 4-6)
        studentSheet.getRange(existingRow, 4, 1, 3).setValues([[courseName, date, now]]);
      } else {
        studentSheet.appendRow(row);
        emailIndex[f.email] = studentSheet.getLastRow();
      }
    });

    return jsonRes({
      success: true,
      sessionsSaved: 1,
      feedbackSaved: feedbacks.length,
      studentsUpserted: emailCount
    });

  } catch (err) {
    return jsonRes({ success: false, message: err.message });
  }
}

// ── GET：查詢資料 ─────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'history') {
      return jsonRes({
        success: true,
        sessions: sheetToObjects(ss, 'sessions'),
        feedback: sheetToObjects(ss, 'feedback')
      });
    }

    if (action === 'students') {
      var students = sheetToObjects(ss, 'students');
      var course = e.parameter.course || '';
      if (course) {
        students = students.filter(function(s) { return s.courseName === course; });
      }
      return jsonRes({ success: true, students: students });
    }

    return jsonRes({ success: true, usage: 'GET ?action=history | ?action=students[&course=xxx]' });
  } catch (err) {
    return jsonRes({ success: false, message: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────

/** 取得或建立 tab，自動加 header */
function getOrCreateSheet(ss, tabKey) {
  var def = TABS[tabKey];
  var sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.appendRow(def.headers);
    sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(def.headers);
    sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  }
  return sheet;
}

/** Append a row to a named tab */
function appendRow(ss, tabKey, values) {
  var sheet = getOrCreateSheet(ss, tabKey);
  sheet.appendRow(values);
}

/** Read entire sheet as array of objects (header-keyed) */
function sheetToObjects(ss, tabKey) {
  var sheet = getOrCreateSheet(ss, tabKey);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

/** Compute average from array using accessor, ignoring falsy values */
function avg(arr, accessor) {
  var sum = 0, count = 0;
  arr.forEach(function(item) {
    var val = accessor(item);
    if (val && !isNaN(val)) {
      sum += Number(val);
      count++;
    }
  });
  return count > 0 ? Math.round(sum / count * 100) / 100 : 0;
}

/** JSON response helper */
function jsonRes(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
