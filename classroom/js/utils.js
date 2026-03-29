// ClassClaw — utils
// Shared utility functions: escaping, time formatting, notifications

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeStr(t) {
  if (!t) return '';
  var d = new Date(t);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// ═══ Unified Notification System ═══
function showNotification(type, msg, duration) {
  // type: 'success' | 'error' | 'info' | 'warning'
  // duration: ms, default 3000 for success/info, 0 (manual close) for error
  var el = document.getElementById('notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notification';
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);padding:0.8rem 1.5rem;border-radius:10px;font-size:0.9rem;font-weight:700;z-index:999;opacity:0;transition:opacity 0.3s;pointer-events:none;display:flex;align-items:center;gap:0.5rem;max-width:90%;text-align:center';
    document.body.appendChild(el);
  }
  var colors = {
    success: { bg: '#0F9D8A', icon: '\u2705' },
    error: { bg: '#DC2626', icon: '\u274C' },
    info: { bg: '#1A73E8', icon: '\u2139\uFE0F' },
    warning: { bg: '#FFC857', icon: '\u26A0\uFE0F', textColor: '#0B3C5D' }
  };
  var c = colors[type] || colors.info;
  el.style.background = c.bg;
  el.style.color = c.textColor || '#fff';
  el.innerHTML = c.icon + ' ' + msg;
  el.style.opacity = '1';
  el.style.pointerEvents = type === 'error' ? 'auto' : 'none';

  if (type === 'error') {
    el.innerHTML += ' <button onclick="this.parentElement.style.opacity=0;this.parentElement.style.pointerEvents=\'none\'" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;margin-left:0.5rem">\u2715</button>';
    el.style.pointerEvents = 'auto';
  }

  var d = duration || (type === 'error' ? 0 : 3000);
  if (d > 0) {
    clearTimeout(window._notifTimer);
    window._notifTimer = setTimeout(function() {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }, d);
  }
}

// Backwards compat — old action toast
var toastTimer = null;
function showActionToast(msg) {
  showNotification('success', msg);
}

function formatDateDisplay(dateStr) {
  // dateStr: YYYYMMDD or YYYY-MM-DD
  var d = dateStr.replace(/-/g, '');
  if (d.length === 8) {
    return d.substring(4, 6) + '/' + d.substring(6, 8);
  }
  return dateStr;
}
