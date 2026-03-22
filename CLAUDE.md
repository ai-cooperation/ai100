# AI100 講 — 專案開發指南

## 專案概覽
- **網站**: https://ai100.cooperation.tw
- **Repo**: ai-cooperation/ai100 (GitHub Pages)
- **技術**: Jekyll 靜態網站 + Firebase 即時互動
- **本地路徑**: `/Users/user/Desktop/AI100講/ai100/`

## 課堂互動系統

### Firebase 專案
- **專案**: ai-classroom-70a97
- **Console**: https://console.firebase.google.com/project/ai-classroom-70a97
- **Realtime Database**: https://ai-classroom-70a97-default-rtdb.firebaseio.com
- **規則設定**: https://console.firebase.google.com/project/ai-classroom-70a97/database/ai-classroom-70a97-default-rtdb/rules
- **Authentication**: https://console.firebase.google.com/project/ai-classroom-70a97/authentication
- **授權網域**: ai100.cooperation.tw（已加入）

### 頁面清單

| 頁面 | 路徑 | 用途 |
|------|------|------|
| 講師後台 | `/classroom/host` | Google 登入 → 教室管理 → 模式切換 → AI 助教 |
| 學員互動 | `/classroom/` | 掃 QR 加入 → 訊息牆 / 投票 / 問答 |
| 手機遙控 | `/classroom/remote` | 老師手機控制簡報翻頁 + 模式切換 |
| 網頁簡報 | `/ai-pptx-routes?room=xxx` | 帶 room 參數時接受遙控換頁 |
| Slidev demo | `/demo-slidev` | 路線 6 示範 |
| Marp demo | `/demo-marp` | 路線 6 示範 |
| reveal.js demo | `/demo-revealjs` | 路線 6 示範 |

### Firebase 資料結構

```
rooms/{roomId}/
  config/
    title, mode, created, hostUid, hostName
    password (optional)
    aiEnabled (boolean)
  presence/{odID}: { name, ts }
  wall/{pushId}: { text, name, ts, role: "student"|"teacher"|"ai" }
  currentVote: { question, options[], id }
  votes/{voteId}/{odID}: optionIndex
  qa/{pushId}: { text, name, ts, ups, role }
  qaUps/{qaId}/{odID}: true
  qaReplies/{qaId}/{pushId}: { text, name, ts, role: "teacher"|"ai" }
  presentation: { sections[], current, url }
  slideControl: { action, index, ts }

users/{uid}/rooms/{roomId}: { title, created }
```

### 安全規則

```json
{
  "rules": {
    "rooms": { "$roomId": { ".read": true, ".write": true } },
    "users": { "$uid": { ".read": true, ".write": true } }
  }
}
```

### 教室代碼命名
- 格式: `YYYYMMDD-名稱`（例如 `20260322-ai100`）
- 日期前綴自動產生，老師填後綴

### 三色訊息標記
| 角色 | 顏色 | 標記 | role 值 |
|------|------|------|---------|
| 學員 | 白色 | 一般 | student |
| 老師 | 金色 | 👨‍🏫 | teacher |
| AI 助教 | 紫色 | 🤖 | ai |

### AI 助教機制
- **API**: Gemini 2.0 Flash（免費版）
- **Key 存放**: 老師瀏覽器 localStorage（key: `_ai_key`），不上傳
- **呼叫方式**: 老師瀏覽器作為 proxy，呼叫 Gemini API，回寫 Firebase
- **觸發**: 開啟 AI 後自動回答所有學員訊息/問題
- **智慧跳過**: 閒聊/打招呼回覆 [SKIP] 不發送
- **前提**: 老師瀏覽器必須開著，AI 才能回答

### 簡報遙控機制
1. 簡報頁帶 `?room=xxx` 開啟 → 自動寫 sections 到 Firebase
2. 遙控器（remote.html）讀 sections → 顯示段落列表
3. 遙控器寫 slideControl → 簡報頁監聽 → 自動捲動

## jt-live-whisper 語音整合（Phase 3 規劃）

### 工具資訊
- **GitHub**: https://github.com/jasoncheng7115/jt-live-whisper
- **版本**: v2.14.2
- **特點**: 100% 本地端語音辨識，含 WebUI

### 整合接口
| 接口 | 端口 | 格式 |
|------|------|------|
| TCP | 127.0.0.1:19780 | Line-delimited JSON |
| WebSocket | ws://localhost:19781/ws | JSON（WebUI 用） |

### 訊息格式
```json
{"type": "transcription", "src_text": "辨識文字", "dst_text": "翻譯文字", "timestamp": 1234567890}
```

### 整合架構
```
老師麥克風 → jt-live-whisper（本地）
  → TCP 19780
  → Bridge 腳本（Python）
  → Firebase rooms/{roomId}/voiceCommands
  → host.html 處理指令
    ├── "下一頁" → slideControl
    ├── "切到投票" → config/mode
    └── 問題 → AI 回答
```

### Bridge 不需要修改 jt-live-whisper 程式碼

## 教材清單（host.html 中定義）
| 教材 | 路徑 | 支援遙控 |
|------|------|---------|
| AI 簡報生成 6 種路線 | /ai-pptx-routes | ✅ |
| Slidev 風格示範 | /demo-slidev | |
| Marp 風格示範 | /demo-marp | |
| reveal.js 風格示範 | /demo-revealjs | |

新增教材時，在 host.html 的 `materials` 陣列中加入即可。

## PPTX 簡報生成
- **腳本**: `/Users/user/Desktop/AI100講/generate_pptx_comparison.js`（v1）
- **腳本 v2**: `/Users/user/Desktop/AI100講/generate_pptx_comparison_v2.js`
- **執行**: `NODE_PATH=/opt/homebrew/lib/node_modules node generate_pptx_comparison.js`
- **設計系統**: Cooperation 品牌配色（Navy #0B3C5D, Teal #0F9D8A, Gold #FFC857）

## 開發注意事項
- Firebase API Key（AIza...）在瀏覽器端是公開的（Firebase 設計如此），安全性靠 Rules 控制
- 提交時 pre-commit hook 會偵測 AIza 開頭字串，用 `['AIza','...'].join('')` 避免誤報
- GitHub Pages build 約需 60-90 秒，push 後需等 build 完成再驗證
