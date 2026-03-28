#!/usr/bin/env node
/**
 * Voice Bridge v2 — 監聽 jt-live-whisper log 檔 → Firebase voiceCommands
 *
 * 用法：node voice-bridge.js [roomId]
 */

const fs = require('fs');
const path = require('path');

const FB = 'https://ai-classroom-70a97-default-rtdb.firebaseio.com';
const ROOM_ID = process.argv[2] || '20260322-ai100';
const LOG_DIR = path.join(process.env.HOME, 'Apps/jt-live-whisper/logs');

// 找最新的 log 檔
function findLatestLog() {
  const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.txt')).sort();
  return files.length ? path.join(LOG_DIR, files[files.length - 1]) : null;
}

// 指令模式過濾
const CMD_PATTERNS = [
  /下一[頁張]/, /上一[頁張]/, /翻/, /跳到/, /推送?/, /投票/, /結束/,
  /開始/, /文字雲/, /靜音/, /活潑/, /專業/, /模式/, /狀態/,
  /打開/, /切到/, /關[閉掉]/, /教材/, /Groq/i, /GitHub/i
];

let lastLine = '';
let lastSendTime = 0;

async function sendToFirebase(text) {
  if (text === lastLine && Date.now() - lastSendTime < 5000) return;
  if (!CMD_PATTERNS.some(p => p.test(text))) return;

  console.log(`🎤 → Firebase: "${text}"`);
  lastLine = text;
  lastSendTime = Date.now();

  try {
    await fetch(`${FB}/rooms/${ROOM_ID}/voiceCommands.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ts: Date.now() })
    });
  } catch (e) {
    console.error('[firebase]', e.message);
  }
}

function watchLog() {
  const logFile = findLatestLog();
  if (!logFile) {
    console.log('等待 jt-live-whisper 產生 log...');
    setTimeout(watchLog, 3000);
    return;
  }

  console.log(`🦞 Voice Bridge v2`);
  console.log(`   Log: ${path.basename(logFile)}`);
  console.log(`   Room: ${ROOM_ID}`);
  console.log(`   對麥克風說指令（下一頁、推送 Groq、開投票...）\n`);

  let fileSize = fs.statSync(logFile).size;

  // 監聽檔案變化
  fs.watchFile(logFile, { interval: 1000 }, (curr, prev) => {
    if (curr.size <= fileSize) return;
    const stream = fs.createReadStream(logFile, { start: fileSize, encoding: 'utf8' });
    let buf = '';
    stream.on('data', chunk => { buf += chunk; });
    stream.on('end', () => {
      fileSize = curr.size;
      const lines = buf.split('\n');
      for (const line of lines) {
        // 格式: [HH:MM:SS] [中] 辨識文字
        const m = line.match(/\[\d{2}:\d{2}:\d{2}\]\s*\[中\]\s*(.+)/);
        if (m && m[1].trim().length >= 2) {
          sendToFirebase(m[1].trim());
        }
      }
    });
  });

  // 也監聽新的 log 檔（如果 whisper 重啟會產生新檔案）
  setInterval(() => {
    const latest = findLatestLog();
    if (latest !== logFile) {
      console.log(`[bridge] 新 log: ${path.basename(latest)}`);
      fs.unwatchFile(logFile);
      watchLog();
    }
  }, 10000);
}

watchLog();
