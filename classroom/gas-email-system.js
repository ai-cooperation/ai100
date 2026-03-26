/**
 * ClassClaw — GAS Email Relay
 *
 * 純寄信服務，不管 PDF、不管 Drive、不管 Sheet。
 * host.html 組好信件內容，POST 過來，這裡只負責用 Gmail 發出。
 *
 * 部署方式（一次）：
 * 1. 開 Google Apps Script：https://script.google.com
 * 2. 建新專案，貼上此程式碼
 * 3. 「部署」→「新增部署」→「網頁應用程式」
 *    - 執行身分：我
 *    - 存取權限：任何人
 * 4. 複製部署 URL
 * 5. 在 host.html 設定面板貼上 URL
 *
 * API：
 * POST /exec
 * Body: {
 *   "recipients": [{"email":"a@b.com","name":"小明"}, ...],
 *   "subject": "AI 100 講 — 課程簡報",
 *   "body": "<p>Hi {name}，...</p>",
 *   "senderName": "AI 100 講"
 * }
 *
 * {name} 會被替換為每位收件人的名字。
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var recipients = data.recipients || [];
    var subject = data.subject || '課程通知';
    var bodyTemplate = data.body || '';
    var senderName = data.senderName || 'AI 100 講';

    if (!recipients.length) {
      return jsonResponse({ success: false, message: '沒有收件人' });
    }

    var sent = 0, failed = 0, errors = [];

    recipients.forEach(function(r) {
      if (!r.email) return;
      try {
        var personalBody = bodyTemplate.replace(/\{name\}/g, r.name || '同學');
        GmailApp.sendEmail(r.email, subject, '', {
          name: senderName,
          htmlBody: personalBody
        });
        sent++;
        Utilities.sleep(500);
      } catch (err) {
        failed++;
        errors.push(r.email + ': ' + err.message);
      }
    });

    return jsonResponse({ success: true, sent: sent, failed: failed, errors: errors });
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

// CORS preflight
function doGet(e) {
  return jsonResponse({ status: 'ok', usage: 'POST with {recipients, subject, body, senderName}' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
