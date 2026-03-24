/**
 * AI Classroom — GAS Email 系統
 *
 * 功能：
 * 1. 從 Firebase 讀取回饋資料 + email 名單 → 存到 Sheet
 * 2. 從 Google Drive 讀預生成 PDF → 寄給學員
 * 3. 批次發送課程通知
 *
 * 設定方式：
 * 1. 在 Google Sheet 建立新的 Apps Script 專案
 * 2. 貼上此程式碼
 * 3. 設定 Script Properties：
 *    - FIREBASE_URL: https://ai-classroom-70a97-default-rtdb.firebaseio.com
 *    - PDF_FOLDER_ID: Google Drive 資料夾 ID（放 PDF 的地方）
 *    - SENDER_NAME: 寄件人名稱（例：AI 100 講 講師）
 */

// ═══ 設定 ═══
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    firebaseUrl: props.getProperty('FIREBASE_URL') || 'https://ai-classroom-70a97-default-rtdb.firebaseio.com',
    pdfFolderId: props.getProperty('PDF_FOLDER_ID') || '',
    senderName: props.getProperty('SENDER_NAME') || 'AI 100 講'
  };
}

// ═══ 1. 從 Firebase 同步回饋到 Sheet ═══
function syncFeedbackToSheet(roomId) {
  if (!roomId) {
    var ui = SpreadsheetApp.getUi();
    var result = ui.prompt('輸入教室代碼', '例：20260324-ai100', ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return;
    roomId = result.getResponseText().trim();
  }

  var config = getConfig();
  var url = config.firebaseUrl + '/rooms/' + roomId + '/feedback.json';
  var response = UrlFetchApp.fetch(url);
  var data = JSON.parse(response.getContentText());

  if (!data) {
    SpreadsheetApp.getActiveSpreadsheet().toast('此教室尚無回饋資料', '提示', 3);
    return;
  }

  // 取得或建立工作表
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = '回饋-' + roomId;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // 標題列
    sheet.getRange(1, 1, 1, 9).setValues([[
      '學員', '滿意度', '推薦度', '最有幫助', '不清楚的', '節奏', '建議', 'Email', '要PDF'
    ]]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#0B3C5D').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  // 寫入資料
  var rows = [];
  var entries = Object.values(data);
  entries.forEach(function(e) {
    rows.push([
      e.name || '',
      (e.ratings && e.ratings.satisfaction) || '',
      (e.ratings && e.ratings.recommend) || '',
      (e.answers && e.answers.helpful) || '',
      (e.answers && e.answers.unclear) || '',
      (e.answers && e.answers.pacing) || '',
      (e.answers && e.answers.suggestion) || '',
      e.email || '',
      e.wantPdf ? '是' : ''
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '已同步 ' + rows.length + ' 筆回饋到「' + sheetName + '」',
    '完成', 5
  );

  return { sheetName: sheetName, count: rows.length };
}

// ═══ 2. 同步到名單總表 ═══
function syncToMasterList(roomId) {
  var config = getConfig();
  var url = config.firebaseUrl + '/rooms/' + roomId + '/feedback.json';
  var response = UrlFetchApp.fetch(url);
  var data = JSON.parse(response.getContentText());
  if (!data) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSheet = ss.getSheetByName('名單總表');
  if (!masterSheet) {
    masterSheet = ss.insertSheet('名單總表');
    masterSheet.getRange(1, 1, 1, 5).setValues([[
      'Email', '姓名', '來源教室', '日期', '要PDF'
    ]]);
    masterSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0F9D8A').setFontColor('#FFFFFF');
    masterSheet.setFrozenRows(1);
  }

  // 取得現有 email（去重）
  var existingData = masterSheet.getDataRange().getValues();
  var existingEmails = {};
  for (var i = 1; i < existingData.length; i++) {
    existingEmails[existingData[i][0]] = true;
  }

  var newRows = [];
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  Object.values(data).forEach(function(e) {
    if (e.email && !existingEmails[e.email]) {
      newRows.push([e.email, e.name || '', roomId, today, e.wantPdf ? '是' : '']);
      existingEmails[e.email] = true;
    }
  });

  if (newRows.length > 0) {
    var lastRow = masterSheet.getLastRow();
    masterSheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '新增 ' + newRows.length + ' 個 email 到名單總表（已去重）',
    '完成', 5
  );
}

// ═══ 3. 寄送簡報 PDF ═══
function sendPdfToStudents(roomId, deckName) {
  var config = getConfig();

  if (!roomId) {
    var ui = SpreadsheetApp.getUi();
    var result = ui.prompt('輸入教室代碼', '例：20260324-ai100', ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return;
    roomId = result.getResponseText().trim();
  }

  if (!deckName) {
    var ui = SpreadsheetApp.getUi();
    var result = ui.prompt('簡報名稱', '例：S01_GAS_Automation', ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return;
    deckName = result.getResponseText().trim();
  }

  // 找 PDF 檔案
  var pdfFile = null;
  if (config.pdfFolderId) {
    var folder = DriveApp.getFolderById(config.pdfFolderId);
    var files = folder.getFilesByName(deckName + '.pdf');
    if (files.hasNext()) pdfFile = files.next();
  }

  if (!pdfFile) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      '找不到 ' + deckName + '.pdf，請確認 PDF_FOLDER_ID 設定',
      '錯誤', 5
    );
    return;
  }

  // 讀取 email 名單
  var url = config.firebaseUrl + '/rooms/' + roomId + '/feedback.json';
  var response = UrlFetchApp.fetch(url);
  var data = JSON.parse(response.getContentText());
  if (!data) {
    SpreadsheetApp.getActiveSpreadsheet().toast('此教室尚無回饋資料', '提示', 3);
    return;
  }

  var sentCount = 0;
  var failCount = 0;

  Object.values(data).forEach(function(e) {
    if (e.email && e.wantPdf) {
      try {
        GmailApp.sendEmail(e.email,
          '📚 ' + config.senderName + ' — 課程簡報',
          '', // 純文字版（fallback）
          {
            name: config.senderName,
            htmlBody: buildEmailHtml(e.name || '同學', deckName),
            attachments: [pdfFile.getAs(MimeType.PDF)]
          }
        );
        sentCount++;
        Utilities.sleep(1000); // 避免 rate limit
      } catch (err) {
        Logger.log('寄送失敗: ' + e.email + ' - ' + err.message);
        failCount++;
      }
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    '寄送完成：成功 ' + sentCount + ' 封，失敗 ' + failCount + ' 封',
    '完成', 5
  );
}

// ═══ Email HTML 模板 ═══
function buildEmailHtml(name, deckName) {
  return '<div style="font-family:Noto Sans TC,sans-serif;max-width:600px;margin:0 auto;padding:20px;">'
    + '<div style="background:#0B3C5D;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">'
    + '<h1 style="margin:0;font-size:1.3rem;">AI 100 講</h1>'
    + '<p style="margin:5px 0 0;color:#FFC857;">課程簡報</p>'
    + '</div>'
    + '<div style="background:#F8F9FA;padding:24px;border-radius:0 0 12px 12px;">'
    + '<p style="font-size:1rem;">Hi ' + name + '，</p>'
    + '<p style="font-size:1rem;line-height:1.8;">感謝你參加課程！附件是本次的簡報 PDF。</p>'
    + '<p style="font-size:1rem;line-height:1.8;">簡報內容：<strong>' + deckName.replace(/_/g, ' ') + '</strong></p>'
    + '<div style="margin:20px 0;padding:16px;background:#E6F4F1;border-radius:8px;border-left:4px solid #0F9D8A;">'
    + '<p style="margin:0;font-size:0.95rem;">💡 更多學習資源：<a href="https://ai100.cooperation.tw" style="color:#0F9D8A;">ai100.cooperation.tw</a></p>'
    + '</div>'
    + '<p style="font-size:0.85rem;color:#5F6368;">— AI 100 講 講師團隊</p>'
    + '</div>'
    + '</div>';
}

// ═══ 4. 批次發送課程通知 ═══
function sendCourseNotification() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('課程通知', '輸入通知內容（會發給名單總表所有人）', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var message = result.getResponseText().trim();
  if (!message) return;

  var config = getConfig();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSheet = ss.getSheetByName('名單總表');
  if (!masterSheet) {
    ui.alert('請先同步回饋資料建立名單總表');
    return;
  }

  var data = masterSheet.getDataRange().getValues();
  var sentCount = 0;

  for (var i = 1; i < data.length; i++) {
    var email = data[i][0];
    var name = data[i][1] || '同學';
    if (!email) continue;

    try {
      GmailApp.sendEmail(email,
        '📢 ' + config.senderName + ' — 課程通知',
        message,
        {
          name: config.senderName,
          htmlBody: '<div style="font-family:Noto Sans TC,sans-serif;max-width:600px;margin:0 auto;padding:20px;">'
            + '<div style="background:#0B3C5D;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">'
            + '<h1 style="margin:0;font-size:1.3rem;">' + config.senderName + '</h1>'
            + '<p style="margin:5px 0 0;color:#FFC857;">課程通知</p></div>'
            + '<div style="background:#F8F9FA;padding:24px;border-radius:0 0 12px 12px;">'
            + '<p>Hi ' + name + '，</p>'
            + '<p style="line-height:1.8;">' + message.replace(/\n/g, '<br>') + '</p>'
            + '<p style="font-size:0.85rem;color:#5F6368;margin-top:20px;">— ' + config.senderName + '</p>'
            + '</div></div>'
        }
      );
      sentCount++;
      Utilities.sleep(500);
    } catch (err) {
      Logger.log('通知失敗: ' + email + ' - ' + err.message);
    }
  }

  ui.alert('通知發送完成：' + sentCount + ' / ' + (data.length - 1) + ' 封');
}

// ═══ 自訂選單 ═══
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 AI Classroom')
    .addItem('📥 同步回饋到 Sheet', 'syncFeedbackToSheet')
    .addItem('📋 同步到名單總表', 'syncToMasterListPrompt')
    .addSeparator()
    .addItem('📧 寄送簡報 PDF', 'sendPdfToStudents')
    .addItem('📢 發送課程通知', 'sendCourseNotification')
    .addToUi();
}

function syncToMasterListPrompt() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('輸入教室代碼', '例：20260324-ai100', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  syncToMasterList(result.getResponseText().trim());
}
