/**
 * ClassClaw — GAS Course Registration
 *
 * 獨立的課程報名系統，提供品牌化報名頁面 + 報名資料寫入 Sheets + 確認信。
 *
 * 部署方式：
 * 1. 開 Google Apps Script：https://script.google.com
 * 2. 建新專案，貼上此程式碼
 * 3. 「部署」→「新增部署」→「網頁應用程式」
 *    - 執行身分：我
 *    - 存取權限：任何人
 * 4. 複製部署 URL
 *
 * 使用方式：
 * GET  /exec?course=AI工具應用班&date=2026/04/15&location=台北&price=免費&seats=30
 * POST /exec  ← 表單送出
 *
 * 資料寫入與 CRM 同一份 Spreadsheet 的 "Registrations" tab。
 */

// ── 設定 ─────────────────────────────────────────────────
var SHEET_ID = '1XyE02dzKVZKx08wXpt4bSdv_HTB0EgzlshEUlreB4LY';

var REG_TAB = {
  name: 'Registrations',
  headers: ['timestamp', 'course', 'name', 'email', 'phone', 'company', 'jobTitle', 'source', 'notes', 'confirmed']
};

// ── GET：回傳報名頁面 ───────────────────────────────────
function doGet(e) {
  var params = e ? (e.parameter || {}) : {};
  var course   = params.course   || 'AI 工具應用與自動化流程實戰班';
  var date     = params.date     || '待公布';
  var location = params.location || '待公布';
  var price    = params.price    || '待公布';
  var teacher  = params.teacher  || '陳重光';
  var seats    = params.seats    || '';

  var html = buildRegistrationPage(course, date, location, price, teacher, seats);
  return HtmlService
    .createHtmlOutput(html)
    .setTitle('課程報名 — ' + course)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── POST：處理報名 ──────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // 驗證必填
    if (!data.name || !data.email) {
      return jsonResponse({ success: false, message: '姓名與 Email 為必填欄位' });
    }

    // 寫入 Sheets
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = getOrCreateTab(ss);
    var now = new Date();
    var course = data.course || 'AI 工具應用與自動化流程實戰班';

    sheet.appendRow([
      now.toISOString(),
      course,
      data.name,
      data.email,
      data.phone || '',
      data.company || '',
      data.jobTitle || '',
      data.source || '',
      data.notes || '',
      'pending'
    ]);

    // 寄確認信
    try {
      sendConfirmationEmail(data.name, data.email, course);
    } catch (mailErr) {
      Logger.log('Email failed: ' + mailErr.message);
    }

    return jsonResponse({ success: true, message: '報名成功！確認信已寄出。' });
  } catch (err) {
    return jsonResponse({ success: false, message: '系統錯誤：' + err.message });
  }
}

// ── Sheet helpers ───────────────────────────────────────
function getOrCreateTab(ss) {
  var sheet = ss.getSheetByName(REG_TAB.name);
  if (!sheet) {
    sheet = ss.insertSheet(REG_TAB.name);
    sheet.appendRow(REG_TAB.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, REG_TAB.headers.length)
      .setBackground('#0F9D8A')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 確認信 ──────────────────────────────────────────────
function sendConfirmationEmail(name, email, course) {
  var subject = 'AI 100 講 — 報名確認：' + course;
  var body = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:\'Noto Sans TC\',sans-serif;">',
    '<div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">',
    '  <div style="background:linear-gradient(135deg,#0a0f1a,#1e293b);padding:32px 28px;text-align:center;">',
    '    <div style="font-size:28px;margin-bottom:4px;">🦞</div>',
    '    <div style="color:#0F9D8A;font-size:20px;font-weight:700;letter-spacing:1px;">ClassClaw</div>',
    '    <div style="color:#94a3b8;font-size:13px;margin-top:4px;">AI 100 講 · 課程報名確認</div>',
    '  </div>',
    '  <div style="padding:28px;">',
    '    <p style="font-size:16px;color:#1e293b;">',
    '      ' + name + '，您好！',
    '    </p>',
    '    <p style="font-size:15px;color:#475569;line-height:1.7;">',
    '      感謝您報名 <strong style="color:#0F9D8A;">' + course + '</strong>。',
    '      我們已收到您的報名資料，後續將以 Email 通知課前準備事項。',
    '    </p>',
    '    <div style="background:#f8fafc;border-left:4px solid #0F9D8A;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;">',
    '      <div style="font-size:13px;color:#64748b;margin-bottom:4px;">報名課程</div>',
    '      <div style="font-size:15px;color:#1e293b;font-weight:600;">' + course + '</div>',
    '    </div>',
    '    <p style="font-size:14px;color:#64748b;line-height:1.6;">',
    '      如有任何問題，請聯繫 <a href="mailto:ai@cooperation.tw" style="color:#0F9D8A;">ai@cooperation.tw</a>',
    '    </p>',
    '  </div>',
    '  <div style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;">',
    '    <span style="font-size:12px;color:#94a3b8;">© AI 100 講 · ai-cooperation</span>',
    '  </div>',
    '</div>',
    '</body></html>'
  ].join('\n');

  GmailApp.sendEmail(email, subject, name + '，您好！感謝報名 ' + course + '。', {
    name: 'AI 100 講',
    htmlBody: body
  });
}

// ── 報名頁面 HTML ───────────────────────────────────────
function buildRegistrationPage(course, date, location, price, teacher, seats) {
  var gasUrl = ScriptApp.getService().getUrl();
  var seatsHtml = seats
    ? '<div class="info-item"><span class="info-icon">💺</span><span class="info-label">名額</span><span class="info-value">' + escHtml(seats) + ' 人</span></div>'
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-TW">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>課程報名 — ' + escHtml(course) + '</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">',
    '<style>',
    buildCSS(),
    '</style>',
    '</head>',
    '<body>',
    '<div class="page">',

    // ── Header ──
    '  <header class="header">',
    '    <div class="brand">',
    '      <span class="brand-logo">🦞</span>',
    '      <span class="brand-name">ClassClaw</span>',
    '    </div>',
    '    <h1 class="course-title">' + escHtml(course) + '</h1>',
    '    <div class="header-line"></div>',
    '  </header>',

    // ── Info Cards ──
    '  <section class="info-grid">',
    '    <div class="info-item"><span class="info-icon">📅</span><span class="info-label">日期</span><span class="info-value">' + escHtml(date) + '</span></div>',
    '    <div class="info-item"><span class="info-icon">📍</span><span class="info-label">地點</span><span class="info-value">' + escHtml(location) + '</span></div>',
    '    <div class="info-item"><span class="info-icon">💰</span><span class="info-label">費用</span><span class="info-value">' + escHtml(price) + '</span></div>',
    '    <div class="info-item"><span class="info-icon">👨‍🏫</span><span class="info-label">講師</span><span class="info-value">' + escHtml(teacher) + '</span></div>',
    seatsHtml,
    '  </section>',

    // ── Form ──
    '  <section class="form-card">',
    '    <h2 class="form-title">📝 報名表單</h2>',
    '    <form id="regForm" autocomplete="on">',
    '      <input type="hidden" name="course" value="' + escHtml(course) + '">',
    buildField('name',     '姓名 *',      'text',  '您的姓名', true),
    buildField('email',    'Email *',     'email', 'your@email.com', true),
    buildField('phone',    '聯絡電話',     'tel',   '0912-345-678', false),
    buildField('company',  '公司 / 單位',  'text',  '公司名稱', false),
    buildField('jobTitle', '職稱',        'text',  '您的職稱', false),
    '      <div class="field">',
    '        <label for="source">如何得知課程</label>',
    '        <select id="source" name="source">',
    '          <option value="">— 請選擇 —</option>',
    '          <option value="Google 搜尋">Google 搜尋</option>',
    '          <option value="朋友推薦">朋友推薦</option>',
    '          <option value="Facebook/IG">Facebook / IG</option>',
    '          <option value="LinkedIn">LinkedIn</option>',
    '          <option value="公司內部">公司內部</option>',
    '          <option value="其他">其他</option>',
    '        </select>',
    '      </div>',
    buildTextarea('notes', '備註', '任何想讓我們知道的事'),
    '      <button type="submit" id="submitBtn" class="submit-btn">',
    '        <span class="btn-text">📝 確認報名</span>',
    '        <span class="btn-loading" style="display:none;">',
    '          <span class="spinner"></span> 送出中…',
    '        </span>',
    '      </button>',
    '    </form>',
    '  </section>',

    // ── Success overlay ──
    '  <div id="successOverlay" class="success-overlay" style="display:none;">',
    '    <div class="success-card">',
    '      <div class="confetti-container" id="confetti"></div>',
    '      <div class="success-icon">🎉</div>',
    '      <h2>報名成功！</h2>',
    '      <p>確認信已寄至您的信箱，請留意收信。</p>',
    '      <p class="success-sub">如未收到，請檢查垃圾郵件匣。</p>',
    '    </div>',
    '  </div>',

    // ── Footer ──
    '  <footer class="footer">',
    '    <p>報名後會收到確認信至您填寫的 Email</p>',
    '    <p class="footer-copy">© AI 100 講 · <a href="mailto:ai@cooperation.tw">ai@cooperation.tw</a></p>',
    '  </footer>',

    '</div>',

    '<script>',
    buildJS(gasUrl),
    '</script>',

    '</body>',
    '</html>'
  ].join('\n');
}

// ── HTML helpers ────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildField(id, label, type, placeholder, required) {
  return [
    '<div class="field">',
    '  <label for="' + id + '">' + label + '</label>',
    '  <input type="' + type + '" id="' + id + '" name="' + id + '"',
    '    placeholder="' + placeholder + '"' + (required ? ' required' : '') + '>',
    '</div>'
  ].join('\n');
}

function buildTextarea(id, label, placeholder) {
  return [
    '<div class="field">',
    '  <label for="' + id + '">' + label + '</label>',
    '  <textarea id="' + id + '" name="' + id + '" rows="3"',
    '    placeholder="' + placeholder + '"></textarea>',
    '</div>'
  ].join('\n');
}

// ── CSS ─────────────────────────────────────────────────
function buildCSS() {
  return [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, sans-serif;',
    '  background: linear-gradient(160deg, #0a0f1a 0%, #0f172a 50%, #0a0f1a 100%);',
    '  color: #e6edf3;',
    '  min-height: 100vh;',
    '  line-height: 1.6;',
    '}',
    '.page {',
    '  max-width: 640px;',
    '  margin: 0 auto;',
    '  padding: 40px 20px 32px;',
    '}',

    /* Header */
    '.header { text-align: center; margin-bottom: 32px; }',
    '.brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 16px; }',
    '.brand-logo { font-size: 36px; filter: drop-shadow(0 0 12px rgba(15,157,138,0.5)); }',
    '.brand-name {',
    '  font-size: 26px; font-weight: 700; letter-spacing: 2px;',
    '  background: linear-gradient(135deg, #0F9D8A, #7C3AED);',
    '  -webkit-background-clip: text; -webkit-text-fill-color: transparent;',
    '  background-clip: text;',
    '}',
    '.course-title {',
    '  font-size: 22px; font-weight: 700; color: #f1f5f9;',
    '  margin-bottom: 16px; line-height: 1.4;',
    '}',
    '.header-line {',
    '  width: 60px; height: 3px; margin: 0 auto;',
    '  background: linear-gradient(90deg, #0F9D8A, #7C3AED);',
    '  border-radius: 2px;',
    '}',

    /* Info grid */
    '.info-grid {',
    '  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));',
    '  gap: 12px; margin-bottom: 32px;',
    '}',
    '.info-item {',
    '  background: #1e293b; border: 1px solid #30363d; border-radius: 12px;',
    '  padding: 16px; display: flex; flex-direction: column; gap: 4px;',
    '  transition: border-color 0.2s, transform 0.2s;',
    '}',
    '.info-item:hover { border-color: #0F9D8A; transform: translateY(-2px); }',
    '.info-icon { font-size: 20px; }',
    '.info-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }',
    '.info-value { font-size: 16px; font-weight: 600; color: #f1f5f9; }',

    /* Form card */
    '.form-card {',
    '  background: #1e293b; border: 1px solid #30363d; border-radius: 16px;',
    '  padding: 32px 28px; margin-bottom: 32px;',
    '  box-shadow: 0 4px 24px rgba(0,0,0,0.3);',
    '}',
    '.form-title {',
    '  font-size: 20px; font-weight: 700; color: #FFC857;',
    '  margin-bottom: 24px; text-align: center;',
    '}',
    '.field { margin-bottom: 20px; }',
    '.field label {',
    '  display: block; font-size: 14px; font-weight: 500;',
    '  color: #94a3b8; margin-bottom: 6px;',
    '}',
    '.field input, .field select, .field textarea {',
    '  width: 100%; padding: 12px 16px; font-size: 15px;',
    '  font-family: inherit; color: #e6edf3;',
    '  background: #0f172a; border: 1px solid #30363d; border-radius: 10px;',
    '  outline: none; transition: border-color 0.2s, box-shadow 0.2s;',
    '}',
    '.field input:focus, .field select:focus, .field textarea:focus {',
    '  border-color: #0F9D8A;',
    '  box-shadow: 0 0 0 3px rgba(15,157,138,0.15);',
    '}',
    '.field input::placeholder, .field textarea::placeholder { color: #475569; }',
    '.field select { cursor: pointer; -webkit-appearance: none; appearance: none;',
    '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%2394a3b8\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E");',
    '  background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px;',
    '}',
    '.field textarea { resize: vertical; min-height: 72px; }',
    '.field input.invalid, .field select.invalid { border-color: #ef4444; }',

    /* Submit button */
    '.submit-btn {',
    '  display: flex; align-items: center; justify-content: center;',
    '  width: 100%; padding: 14px; margin-top: 8px;',
    '  font-size: 17px; font-weight: 700; font-family: inherit;',
    '  color: #0a0f1a; cursor: pointer;',
    '  background: linear-gradient(135deg, #0F9D8A 0%, #12b89e 100%);',
    '  border: none; border-radius: 12px;',
    '  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;',
    '  box-shadow: 0 4px 16px rgba(15,157,138,0.35);',
    '}',
    '.submit-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(15,157,138,0.45); }',
    '.submit-btn:active { transform: translateY(0); }',
    '.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }',

    /* Spinner */
    '.spinner {',
    '  display: inline-block; width: 18px; height: 18px;',
    '  border: 3px solid rgba(10,15,26,0.3); border-top-color: #0a0f1a;',
    '  border-radius: 50%; animation: spin 0.7s linear infinite;',
    '  vertical-align: middle; margin-right: 6px;',
    '}',
    '@keyframes spin { to { transform: rotate(360deg); } }',

    /* Success overlay */
    '.success-overlay {',
    '  position: fixed; inset: 0; z-index: 1000;',
    '  background: rgba(10,15,26,0.85); backdrop-filter: blur(6px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  animation: fadeIn 0.3s ease;',
    '}',
    '.success-card {',
    '  background: #1e293b; border: 1px solid #30363d; border-radius: 20px;',
    '  padding: 48px 36px; text-align: center; position: relative;',
    '  box-shadow: 0 8px 40px rgba(0,0,0,0.5);',
    '  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);',
    '}',
    '.success-icon { font-size: 56px; margin-bottom: 16px; }',
    '.success-card h2 { font-size: 24px; color: #FFC857; margin-bottom: 12px; }',
    '.success-card p { font-size: 15px; color: #94a3b8; }',
    '.success-sub { font-size: 13px !important; margin-top: 8px; color: #64748b !important; }',
    '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }',
    '@keyframes popIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }',

    /* Confetti */
    '.confetti-container { position: absolute; inset: 0; overflow: hidden; pointer-events: none; border-radius: 20px; }',
    '.confetti-piece {',
    '  position: absolute; width: 8px; height: 8px; border-radius: 2px;',
    '  top: -10px; animation: confettiFall 2.5s ease-out forwards;',
    '}',
    '@keyframes confettiFall {',
    '  0% { opacity: 1; transform: translateY(0) rotate(0deg); }',
    '  100% { opacity: 0; transform: translateY(400px) rotate(720deg); }',
    '}',

    /* Error toast */
    '.error-toast {',
    '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
    '  background: #ef4444; color: #fff; padding: 12px 24px; border-radius: 10px;',
    '  font-size: 14px; font-weight: 500; z-index: 2000;',
    '  animation: slideUp 0.3s ease;',
    '  box-shadow: 0 4px 16px rgba(239,68,68,0.4);',
    '}',
    '@keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }',

    /* Footer */
    '.footer { text-align: center; color: #64748b; font-size: 13px; line-height: 1.8; }',
    '.footer a { color: #0F9D8A; text-decoration: none; }',
    '.footer a:hover { text-decoration: underline; }',
    '.footer-copy { margin-top: 4px; font-size: 12px; }',

    /* Responsive */
    '@media (max-width: 480px) {',
    '  .page { padding: 24px 16px; }',
    '  .brand-logo { font-size: 28px; }',
    '  .brand-name { font-size: 22px; }',
    '  .course-title { font-size: 18px; }',
    '  .form-card { padding: 24px 18px; }',
    '  .info-grid { grid-template-columns: 1fr 1fr; }',
    '}'
  ].join('\n');
}

// ── Client JS ───────────────────────────────────────────
function buildJS(gasUrl) {
  return [
    '(function() {',
    '  var GAS_URL = "' + gasUrl + '";',
    '  var form = document.getElementById("regForm");',
    '  var btn = document.getElementById("submitBtn");',
    '  var btnText = btn.querySelector(".btn-text");',
    '  var btnLoading = btn.querySelector(".btn-loading");',
    '  var submitting = false;',
    '',
    '  form.addEventListener("submit", function(ev) {',
    '    ev.preventDefault();',
    '    if (submitting) return;',
    '',
    '    // Validate',
    '    var nameEl = document.getElementById("name");',
    '    var emailEl = document.getElementById("email");',
    '    var valid = true;',
    '    [nameEl, emailEl].forEach(function(el) {',
    '      el.classList.remove("invalid");',
    '      if (!el.value.trim()) { el.classList.add("invalid"); valid = false; }',
    '    });',
    '    if (emailEl.value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(emailEl.value)) {',
    '      emailEl.classList.add("invalid"); valid = false;',
    '    }',
    '    if (!valid) return;',
    '',
    '    // Collect data',
    '    var data = {};',
    '    new FormData(form).forEach(function(v, k) { data[k] = v; });',
    '',
    '    // UI: loading',
    '    submitting = true;',
    '    btn.disabled = true;',
    '    btnText.style.display = "none";',
    '    btnLoading.style.display = "inline-flex";',
    '',
    '    fetch(GAS_URL, {',
    '      method: "POST",',
    '      headers: { "Content-Type": "text/plain" },',
    '      body: JSON.stringify(data),',
    '      redirect: "follow"',
    '    })',
    '    .then(function(r) { return r.json(); })',
    '    .then(function(res) {',
    '      if (res.success) {',
    '        showSuccess();',
    '      } else {',
    '        showError(res.message || "報名失敗，請稍後再試");',
    '        resetBtn();',
    '      }',
    '    })',
    '    .catch(function(err) {',
    '      showError("網路錯誤，請檢查連線後重試");',
    '      resetBtn();',
    '    });',
    '  });',
    '',
    '  // Remove invalid state on input',
    '  form.querySelectorAll("input, select, textarea").forEach(function(el) {',
    '    el.addEventListener("input", function() { el.classList.remove("invalid"); });',
    '  });',
    '',
    '  function resetBtn() {',
    '    submitting = false;',
    '    btn.disabled = false;',
    '    btnText.style.display = "inline";',
    '    btnLoading.style.display = "none";',
    '  }',
    '',
    '  function showSuccess() {',
    '    var overlay = document.getElementById("successOverlay");',
    '    overlay.style.display = "flex";',
    '    spawnConfetti();',
    '  }',
    '',
    '  function showError(msg) {',
    '    var existing = document.querySelector(".error-toast");',
    '    if (existing) existing.remove();',
    '    var toast = document.createElement("div");',
    '    toast.className = "error-toast";',
    '    toast.textContent = msg;',
    '    document.body.appendChild(toast);',
    '    setTimeout(function() { toast.remove(); }, 4000);',
    '  }',
    '',
    '  function spawnConfetti() {',
    '    var container = document.getElementById("confetti");',
    '    var colors = ["#0F9D8A","#FFC857","#7C3AED","#ef4444","#3b82f6","#10b981"];',
    '    for (var i = 0; i < 40; i++) {',
    '      var piece = document.createElement("div");',
    '      piece.className = "confetti-piece";',
    '      piece.style.left = Math.random() * 100 + "%";',
    '      piece.style.background = colors[Math.floor(Math.random() * colors.length)];',
    '      piece.style.animationDelay = (Math.random() * 0.8) + "s";',
    '      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + "s";',
    '      piece.style.width = (6 + Math.random() * 6) + "px";',
    '      piece.style.height = (6 + Math.random() * 6) + "px";',
    '      container.appendChild(piece);',
    '    }',
    '  }',
    '})();'
  ].join('\n');
}
