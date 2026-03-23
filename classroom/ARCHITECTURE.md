# AI 課堂互動系統 — 完整架構規劃 v2

> Teaching OS：語音驅動 × AI Agent × 課程全生命週期管理

---

## 核心設計原則

```
1. 語音優先 — 老師說話就是操作，不需要碰螢幕
2. Agent 主動 — AI 不只回答問題，會主動建議、執行、分析
3. 一條龍資料流 — 課前問卷 → 課中互動 → 課後回饋，數據貫穿
4. PPTX 原生 — 老師用熟悉的 PowerPoint，系統自動處理其餘
5. 看板式規劃 — Trello 風格的課程準備介面，不是空白 Dashboard
```

---

## 系統全景圖

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Teaching OS v2 — 全景                           │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  講師規劃介面（Trello 式看板）                                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ 準備中  │ │ 課前    │ │ 上課中  │ │ 課後    │ │ 已完成  │        │   │
│  │  │        │ │        │ │        │ │        │ │        │        │   │
│  │  │📄上傳   │ │📋問卷   │ │🎤語音   │ │💬回饋   │ │📊報告   │        │   │
│  │  │ PPTX   │ │ 已發送  │ │ 控制中  │ │ 收集中  │ │ 已生成  │        │   │
│  │  │📝教案   │ │📊分析   │ │🤖Agent │ │📥簡報   │ │📈趨勢   │        │   │
│  │  │🎯目標   │ │ 完成   │ │ 運行中  │ │ 下載   │ │ 分析   │        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AI Agent 中控系統                              │    │
│  │                                                                   │    │
│  │   🎤 語音輸入 ──→ 🧠 Agent 決策 ──→ ⚡ 執行動作                  │    │
│  │   (jt-live-whisper)   │              │                           │    │
│  │                       │              ├→ 📊 建立投票 + 推送學員    │    │
│  │   📱 學員互動 ──→     │              ├→ 📄 切換投影片             │    │
│  │   (Firebase)          │              ├→ 💬 回覆學員訊息           │    │
│  │                       │              ├→ 🎯 教學建議（給講師）     │    │
│  │   📈 數據分析 ──→     │              ├→ 🎲 發起互動（破冰/搶答）  │    │
│  │   (投票/QA/參與度)     │              └→ 🤖 代課模式              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │  投影機畫面     │  │  學員手機      │  │  講師螢幕      │               │
│  │  (簡報 + 覆蓋) │  │  (互動介面)    │  │  (控制台)      │               │
│  │               │  │               │  │               │               │
│  │ ┌───────────┐ │  │ ┌───────────┐ │  │ ┌───────────┐ │               │
│  │ │ slide.webp │ │  │ │ 投票選項   │ │  │ │ 看板+即時  │ │               │
│  │ │ + 投票結果  │ │  │ │ QA 提問   │ │  │ │ 數據面板   │ │               │
│  │ │ + 文字雲   │ │  │ │ 訊息牆    │ │  │ │ AI 建議   │ │               │
│  │ └───────────┘ │  │ └───────────┘ │  │ └───────────┘ │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
│                                                                         │
│                    ┌──────────────────┐                                  │
│                    │  Firebase RTDB    │                                  │
│                    │  + GitHub Pages   │                                  │
│                    │  + GitHub Repo    │                                  │
│                    └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 一、PPTX 支援系統

### 工作流程

```
老師上傳 .pptx 到 GitHub repo
         │
         ▼ (git push 觸發)
┌─────────────────────────────────┐
│  GitHub Actions                  │
│  1. LibreOffice: PPTX → PDF     │
│  2. pdf2image: PDF → WebP 圖片  │
│  3. python-pptx: 提取備忘錄     │
│  4. 生成 slides.json manifest   │
│  5. Commit 圖片 → GitHub Pages  │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GitHub Pages 靜態資源           │
│  /slides/lesson-01/             │
│  ├── slide-01.webp (1920x1080)  │
│  ├── slide-01-thumb.webp (480w) │
│  ├── slide-02.webp              │
│  ├── ...                        │
│  └── slides.json                │
│      {                          │
│        "title": "AI 概論",      │
│        "slides": [              │
│          { "index": 1,          │
│            "image": "slide-01", │
│            "notes": "開場..." },│
│          ...                    │
│        ]                        │
│      }                          │
└─────────────────────────────────┘
```

### 簡報檢視器設計

```
投影機畫面（全螢幕瀏覽器）

┌─────────────────────────────────────────┐
│                                         │
│         ┌───────────────────┐           │
│         │                   │           │
│         │  slide-03.webp    │ ← 當前頁  │
│         │                   │           │
│         │  ┌─────────────┐  │           │
│         │  │ 覆蓋層       │  │ ← 動態   │
│         │  │ 投票結果 bar │  │   疊加    │
│         │  │ 或文字雲     │  │           │
│         │  └─────────────┘  │           │
│         │                   │           │
│         └───────────────────┘           │
│                                         │
│  ◀ 3/25 ▶          📡 20260401-ai100    │
└─────────────────────────────────────────┘

核心功能：
  - <img> 顯示 slide 圖片（object-fit: contain）
  - 絕對定位的 overlay div 疊加互動元素
  - Firebase 監聽 slideControl → 自動換頁
  - Firebase 監聽 overlay → 顯示/隱藏覆蓋層
  - 預載前後 2 張圖片（瞬間切換）
  - 支援全螢幕 API（F11 或按鈕）
```

### 新增頁面：`/classroom/presenter`

```html
<!-- 投影機專用頁面 — 替代現有 ai-pptx-routes.html 的角色 -->
<!-- URL: /classroom/presenter?room=xxx&deck=lesson-01 -->

結構：
  1. 讀取 /slides/{deck}/slides.json
  2. 預載所有圖片
  3. 監聽 Firebase slideControl → 顯示對應 slide
  4. 監聽 Firebase overlay → 疊加投票結果/文字雲
  5. 支援鍵盤操作（←→ 換頁，本地備用）
```

### GitHub Actions 自動轉換

```yaml
# .github/workflows/convert-slides.yml
name: Convert PPTX Slides
on:
  push:
    paths: ['slides/**/*.pptx']

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libreoffice poppler-utils
          pip install pdf2image python-pptx Pillow

      - name: Convert PPTX to WebP images
        run: python scripts/convert_slides.py

      - name: Commit converted images
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add slides/
          git diff --cached --quiet || git commit -m "chore: auto-convert slides"
          git push
```

### 轉換腳本 `scripts/convert_slides.py`

```python
#!/usr/bin/env python3
"""PPTX → WebP slide images + manifest"""
import json, subprocess
from pathlib import Path
from pdf2image import convert_from_path
from pptx import Presentation

def convert_pptx(pptx_path):
    stem = pptx_path.stem
    out_dir = pptx_path.parent / stem
    out_dir.mkdir(exist_ok=True)

    # 1. 提取備忘錄
    prs = Presentation(str(pptx_path))
    notes = []
    for slide in prs.slides:
        note = ""
        if slide.has_notes_slide:
            note = slide.notes_slide.notes_text_frame.text
        notes.append(note)

    # 2. PPTX → PDF
    subprocess.run([
        'libreoffice', '--headless', '--convert-to', 'pdf',
        str(pptx_path), '--outdir', str(out_dir)
    ], check=True)

    # 3. PDF → images
    pdf_path = out_dir / f"{stem}.pdf"
    images = convert_from_path(str(pdf_path), dpi=200)
    pdf_path.unlink()

    # 4. Save WebP + thumbnail
    manifest = {
        "id": stem,
        "title": stem.replace("-", " ").title(),
        "totalSlides": len(images),
        "slides": []
    }

    for i, img in enumerate(images):
        idx = f"{i+1:02d}"

        # Full size WebP
        img.save(str(out_dir / f"slide-{idx}.webp"), 'WebP', quality=85)

        # Thumbnail
        thumb = img.copy()
        thumb.thumbnail((480, 270))
        thumb.save(str(out_dir / f"slide-{idx}-thumb.webp"), 'WebP', quality=70)

        manifest["slides"].append({
            "index": i + 1,
            "image": f"slide-{idx}.webp",
            "thumbnail": f"slide-{idx}-thumb.webp",
            "notes": notes[i] if i < len(notes) else ""
        })

    (out_dir / "slides.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2)
    )

    # 刪除原始 PPTX（已轉換）— 可選
    # pptx_path.unlink()

    return manifest

# 掃描所有 PPTX
for pptx in Path("slides").rglob("*.pptx"):
    if "~$" in pptx.name:  # 跳過暫存檔
        continue
    print(f"Converting: {pptx}")
    m = convert_pptx(pptx)
    print(f"  → {m['totalSlides']} slides → {pptx.parent / pptx.stem}/")
```

---

## 二、講師規劃介面（Trello 式看板）

### 新增頁面：`/classroom/planner`

```
┌─────────────────────────────────────────────────────────────────────┐
│  🎓 課程規劃 — 20260401-ai100                          [+ 新課程]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📋 準備中          📬 課前            🎤 上課中          ✅ 已完成   │
│  ─────────         ─────────          ─────────          ─────────  │
│  ┌───────────┐     ┌───────────┐      ┌───────────┐                │
│  │📄 上傳簡報  │     │📊 問卷分析  │      │ 下次上課   │                │
│  │ lesson-01  │     │ 32 人填寫  │      │ 時自動進入 │                │
│  │ 25 頁      │     │ 60% 初學者 │      │           │                │
│  │ ✅ 已轉換   │     │ ✅ AI 已分析│      │           │                │
│  └───────────┘     └───────────┘      └───────────┘                │
│  ┌───────────┐     ┌───────────┐                                   │
│  │📝 教案筆記  │     │📧 問卷連結  │      💬 課後                     │
│  │ AI 已根據   │     │ 已寄出     │      ─────────                  │
│  │ 簡報生成    │     │ 28/40 填寫 │      ┌───────────┐              │
│  │ 可手動編輯  │     └───────────┘      │💬 回饋收集  │              │
│  └───────────┘                          │ 0/32 完成  │              │
│  ┌───────────┐                          │ 課後自動   │              │
│  │🎯 學習目標  │                          │ 啟動       │              │
│  │ 3 個目標   │                          └───────────┘              │
│  │ AI 建議    │                          ┌───────────┐              │
│  └───────────┘                          │📊 教學報告  │              │
│  ┌───────────┐                          │ 課後自動   │              │
│  │⏱ 時間分配  │                          │ 生成       │              │
│  │ 120 分鐘   │                          └───────────┘              │
│  │ 8 段落     │                                                     │
│  └───────────┘                                                     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  📅 課程時間表                                                      │
│  ┌────┬────────────┬──────────┬───────────────────────┬────────┐   │
│  │ #  │ 日期        │ 主題      │ 簡報                  │ 狀態    │   │
│  ├────┼────────────┼──────────┼───────────────────────┼────────┤   │
│  │ 1  │ 2026/04/01 │ AI 概論   │ lesson-01.pptx ✅     │ 準備中  │   │
│  │ 2  │ 2026/04/08 │ Prompt    │ lesson-02.pptx ✅     │ 未開始  │   │
│  │ 3  │ 2026/04/15 │ RAG      │ 尚未上傳              │ 未開始  │   │
│  └────┴────────────┴──────────┴───────────────────────┴────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 卡片類型定義

```javascript
const CARD_TYPES = {
  // ── 準備階段 ──
  "upload_slides": {
    icon: "📄", title: "上傳簡報",
    description: "上傳 PPTX 到 repo，自動轉換為網頁投影片",
    auto: false,  // 需要老師手動操作
    fields: ["file", "slideCount", "convertStatus"]
  },
  "teaching_notes": {
    icon: "📝", title: "教案筆記",
    description: "AI 根據簡報內容自動生成教案大綱，老師可編輯",
    auto: true,   // 上傳簡報後自動觸發
    trigger: "slides_converted",
    fields: ["content", "editedByTeacher"]
  },
  "learning_goals": {
    icon: "🎯", title: "學習目標",
    description: "AI 根據簡報+教案建議 2-3 個學習目標",
    auto: true,
    trigger: "teaching_notes_ready",
    fields: ["goals[]"]
  },
  "time_plan": {
    icon: "⏱", title: "時間分配",
    description: "AI 建議每段投影片的時間分配",
    auto: true,
    trigger: "teaching_notes_ready",
    fields: ["totalMinutes", "segments[]"]
  },

  // ── 課前階段 ──
  "pre_survey": {
    icon: "📋", title: "課前問卷",
    description: "AI 根據主題+受眾自動生成問卷，老師確認後發送",
    auto: true,
    trigger: "learning_goals_ready",
    fields: ["surveyConfig", "responseCount", "analysisStatus"]
  },
  "survey_link": {
    icon: "📧", title: "問卷連結",
    description: "生成問卷 QR code / 連結，發送給學員",
    auto: true,
    trigger: "survey_confirmed",
    fields: ["url", "qrCode", "sentCount", "responseCount"]
  },

  // ── 課後階段 ──
  "post_feedback": {
    icon: "💬", title: "課後回饋",
    description: "AI 對話式回饋收集（課程結束後自動啟動）",
    auto: true,
    trigger: "class_ended",
    fields: ["responseCount", "avgSatisfaction"]
  },
  "teaching_report": {
    icon: "📊", title: "教學報告",
    description: "AI 綜合分析：課前期望 vs 課中互動 vs 課後回饋",
    auto: true,
    trigger: "feedback_collected",
    fields: ["reportUrl", "highlights", "improvements"]
  }
};
```

### 看板狀態流

```
準備中 ──→ 課前 ──→ 上課中 ──→ 課後 ──→ 已完成
  │         │         │         │         │
  │ 上傳    │ 問卷    │ 開始    │ 結束    │ 報告
  │ PPTX   │ 發送    │ 上課    │ 上課    │ 生成
  │ ↓      │ ↓      │ ↓      │ ↓      │
  │ AI 生成 │ AI 分析 │ Agent  │ AI 回饋 │ 歸檔
  │ 教案   │ 學員   │ 運行   │ 收集   │
  │ 目標   │ 分群   │        │        │
  │ 時間   │        │        │        │
```

### Firebase 資料結構（看板）

```
courses/{courseId}/
  config/
    title: "AI 100 講 — 第一期"
    teacher: { uid, name, email }
    audience: "企業中階主管"      ← AI 生成問卷的依據
    created: timestamp

  sessions/{sessionId}/           ← 每堂課
    title: "AI 概論"
    date: "2026-04-01"
    duration: 120                 ← 分鐘
    deck: "lesson-01"             ← 對應 /slides/lesson-01/
    status: "preparing"|"pre-class"|"live"|"post-class"|"completed"
    roomId: "20260401-ai100"      ← 對應 rooms/{roomId}

    cards/                        ← 看板卡片
      {cardId}/
        type: "upload_slides"|"teaching_notes"|...
        status: "pending"|"in_progress"|"done"
        data: { ... }             ← 依卡片類型不同
        createdAt: timestamp
        updatedAt: timestamp

    teachingNotes/                ← AI 生成 + 老師編輯
      content: string (markdown)
      segments: [
        { slideRange: [1, 5], topic: "開場", minutes: 10, notes: "..." },
        { slideRange: [6, 12], topic: "核心概念", minutes: 30, notes: "..." },
        ...
      ]

    timePlan/
      total: 120
      segments: [
        { topic: "開場", minutes: 10, slides: [1, 5] },
        { topic: "核心概念", minutes: 30, slides: [6, 12] },
        { topic: "互動投票", minutes: 5, slides: null },
        { topic: "實作演練", minutes: 25, slides: [13, 18] },
        ...
      ]
```

---

## 三、語音驅動 Agent 系統（核心體驗）

### 語音驅動的上課流程（關鍵場景）

```
場景：老師正在講解，想發起投票

老師（對著麥克風說）：
  「我們來投票吧，問題是：你覺得 AI 會取代程式設計師嗎？
   選項有：完全取代、部分取代、不會取代、反而需要更多」

                    │
                    ▼
┌──────────────────────────────────────────┐
│  jt-live-whisper (TCP 19780)              │
│  → 語音辨識文字：                          │
│  "我們來投票吧問題是你覺得AI會取代程式     │
│   設計師嗎選項有完全取代部分取代不會取代    │
│   反而需要更多"                            │
└───────────────┬──────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│  Agent 語音解析器                          │
│                                           │
│  偵測到意圖：「建立投票」                   │
│  呼叫 AI 結構化：                          │
│  {                                        │
│    "action": "create_vote",               │
│    "question": "你覺得 AI 會取代程式設計師嗎？",│
│    "options": [                           │
│      "完全取代",                           │
│      "部分取代",                           │
│      "不會取代",                           │
│      "反而需要更多程式設計師"               │
│    ]                                      │
│  }                                        │
└───────────────┬──────────────────────────┘
                │
                ▼ 寫入 Firebase（< 1 秒）
┌──────────────────────────────────────────┐
│  Firebase RTDB                            │
│  rooms/{roomId}/currentVote = {...}       │
│  rooms/{roomId}/config/mode = "vote"      │
└───────────────┬──────────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌──────────────┐ ┌──────────────┐
│ 投影機畫面    │ │ 學員手機      │
│              │ │              │
│ 即時顯示：    │ │ 即時顯示：    │
│ 投票問題     │ │ 4 個選項按鈕  │
│ + 即時 bar   │ │ 點擊即投票   │
│ + 文字雲     │ │              │
└──────────────┘ └──────────────┘
```

### Agent 模組架構

```python
class ClassroomAgent:
    """
    語音驅動的 AI 課堂助教
    運行於 ac-mac，透過 Firebase 與所有端點通訊
    """

    def __init__(self, room_id, config):
        self.room_id = room_id

        # ── 感知模組 ──
        self.voice = VoiceBridge()          # jt-live-whisper TCP
        self.firebase = FirebaseListener()  # 學員互動監聽

        # ── 決策模組 ──
        self.intent_parser = IntentParser()  # 語音意圖解析
        self.advisor = TeachingAdvisor()     # 教學建議引擎
        self.analyzer = RealtimeAnalyzer()   # 即時數據分析

        # ── 執行模組 ──
        self.slide_ctrl = SlideController()  # 簡報控制
        self.vote_mgr = VoteManager()        # 投票管理
        self.wall_mgr = WallManager()        # 訊息牆管理
        self.interaction = InteractionEngine()  # 互動引擎
```

### 語音意圖解析（兩層架構）

```python
class IntentParser:
    """
    Layer 1: 規則比對（< 50ms，零延遲指令）
    Layer 2: AI 解析（< 2s，複雜指令）
    """

    # Layer 1：即時指令（正則比對，不需 AI）
    INSTANT_COMMANDS = {
        "slide_next": [
            r"下一[頁張]", r"next", r"繼續", r"往下"
        ],
        "slide_prev": [
            r"上一[頁張]", r"previous", r"回去", r"往回"
        ],
        "slide_goto": [
            r"跳到第(\d+)", r"第(\d+)[頁張]", r"go to (\d+)"
        ],
        "mode_wall": [
            r"開(訊息牆|聊天)", r"message wall"
        ],
        "mode_qa": [
            r"開問答", r"Q&?A", r"問答時間"
        ],
        "pause": [
            r"暫停", r"休息", r"pause"
        ],
        "end_vote": [
            r"結束投票", r"投票結束", r"stop vote"
        ],
        "ai_on": [
            r"(AI|助教)(上線|開)", r"開AI"
        ],
        "ai_off": [
            r"(AI|助教)(下線|關|休息)", r"關AI"
        ],
    }

    # Layer 2：需要 AI 解析的複雜意圖
    COMPLEX_INTENTS = [
        "create_vote",       # 「來投票，問題是...選項有...」
        "create_quiz",       # 「出一題考他們」
        "summarize",         # 「幫我總結剛才的討論」
        "icebreaker",        # 「暖場一下」「來個破冰」
        "explain",           # 「幫我解釋這個概念」
        "autopilot_start",   # 「幫我講這段」
        "autopilot_stop",    # 「我回來了」
    ]

    async def parse(self, text):
        # Layer 1: 嘗試規則比對
        for intent, patterns in self.INSTANT_COMMANDS.items():
            for pattern in patterns:
                m = re.search(pattern, text)
                if m:
                    return Intent(intent, groups=m.groups(), confidence=1.0)

        # Layer 2: 呼叫 AI 解析
        return await self.ai_parse(text)

    async def ai_parse(self, text):
        prompt = f"""你是課堂助教的語音指令解析器。

老師說了：「{text}」

判斷這是什麼意圖，回傳 JSON：
{{
  "intent": "create_vote|create_quiz|summarize|icebreaker|explain|
             autopilot_start|autopilot_stop|none",
  "confidence": 0.0-1.0,
  "params": {{}}  // 依意圖不同
}}

如果是 create_vote，params 應包含：
  "question": "投票問題",
  "options": ["選項1", "選項2", ...]

如果是 create_quiz，params 應包含：
  "topic": "出題主題"（從語境推斷）

如果是 none（不是指令，只是講課內容），confidence 設 0。
只回傳 JSON，不要其他文字。"""

        result = await call_ai(prompt)
        return Intent.from_json(result)
```

### 投票管理器（語音建立 → 即時推送 → 結果視覺化）

```python
class VoteManager:
    """語音建立投票 → Firebase 推送 → 覆蓋層顯示結果"""

    async def create_from_voice(self, params):
        """老師語音建立投票"""
        vote_id = f"v{int(time.time())}"

        # 1. 寫入 Firebase → 所有學員手機即時收到
        await fb_set(f"rooms/{self.room_id}/currentVote", {
            "question": params["question"],
            "options": params["options"],
            "id": vote_id,
            "source": "voice",
            "created": {".sv": "timestamp"}
        })

        # 2. 切換模式 → 學員手機顯示投票介面
        await fb_set(f"rooms/{self.room_id}/config/mode", "vote")

        # 3. 設定投影機覆蓋層 → 顯示即時投票 bar
        await fb_set(f"rooms/{self.room_id}/overlay", {
            "type": "vote_live",
            "voteId": vote_id,
            "display": "bar",  # bar | wordcloud | pie
            "show": True
        })

        # 4. 通知老師（透過講師螢幕面板或語音）
        print(f"✅ 投票已建立：{params['question']}")
        print(f"   {len(params['options'])} 個選項，等待學員投票...")

    async def show_results(self, vote_id, display_type="bar"):
        """切換結果顯示方式"""
        await fb_set(f"rooms/{self.room_id}/overlay", {
            "type": f"vote_{display_type}",
            "voteId": vote_id,
            "show": True
        })

    async def end_and_analyze(self, vote_id):
        """結束投票 + AI 分析"""
        votes = await fb_read(f"rooms/{self.room_id}/votes/{vote_id}") or {}
        vote_config = await fb_read(f"rooms/{self.room_id}/currentVote") or {}

        # 統計
        total = len(votes)
        distribution = {}
        for odid, choice in votes.items():
            distribution[choice] = distribution.get(choice, 0) + 1

        # AI 分析投票結果
        analysis = await call_ai(f"""
投票結果分析：
問題：{vote_config.get('question', '')}
選項：{vote_config.get('options', [])}
結果分佈：{distribution}
總投票數：{total}

給講師一句話的洞察（例如「多數人認為...但有 30% 持相反意見，值得討論」）
""")

        # 寫入分析結果
        await fb_set(f"rooms/{self.room_id}/voteAnalysis/{vote_id}", {
            "distribution": distribution,
            "total": total,
            "insight": analysis,
            "ts": {".sv": "timestamp"}
        })

        return analysis
```

### 互動引擎（Agent 主動發起）

```python
class InteractionEngine:
    """Agent 主動發起互動"""

    async def create_quiz_from_context(self, context):
        """AI 根據目前教學內容自動出題"""

        prompt = f"""你是課堂助教，老師正在講「{context.current_topic}」。
根據以下教學內容出一題互動選擇題：

最近講解內容（語音轉文字）：
{context.recent_speech[-500:]}

簡報備忘錄：
{context.current_slide_notes}

要求：
- 一題四選一
- 測試核心觀念理解
- 錯誤選項是常見誤解
- 用繁體中文
- 有趣、接地氣

回傳 JSON：
{{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "answer": 0, "explanation": "..."}}"""

        result = await call_ai(prompt)
        quiz = json.loads(result)

        # 建立投票
        await self.vote_mgr.create_from_voice({
            "question": quiz["question"],
            "options": quiz["options"],
            "correctAnswer": quiz["answer"],
            "explanation": quiz["explanation"]
        })

    async def word_cloud_poll(self, question=None):
        """文字雲互動 — 學員輸入關鍵字，即時顯示文字雲"""

        question = question or "用一個詞形容你現在的感覺"

        # 切換到訊息牆模式，但加上特殊標記
        await fb_set(f"rooms/{self.room_id}/config/mode", "wall")
        await fb_set(f"rooms/{self.room_id}/overlay", {
            "type": "wordcloud",
            "question": question,
            "show": True,
            "startTime": {".sv": "timestamp"}
        })

        # AI 助教發起引導
        await fb_push(f"rooms/{self.room_id}/wall", {
            "text": f"🎯 快速互動！{question}\n請在下方輸入一個詞！",
            "name": "AI 助教", "role": "ai",
            "ts": {".sv": "timestamp"}
        })

    async def auto_icebreaker(self, trigger_reason):
        """Agent 自動判斷需要暖場"""

        # 根據原因選擇互動類型
        if trigger_reason == "engagement_drop":
            # 參與度下降 → 輕量互動
            await self.word_cloud_poll("你現在最想問什麼？")
        elif trigger_reason == "section_start":
            # 新段落開始 → 知識確認
            await self.create_quiz_from_context(self.get_context())
        elif trigger_reason == "manual":
            # 老師手動觸發 → AI 自由選擇
            ideas = [
                self.word_cloud_poll,
                self.create_quiz_from_context,
                self.quick_status_poll,
            ]
            choice = random.choice(ideas)
            await choice(self.get_context())
```

### 困惑偵測（修正版：AI 推斷，不靠按鈕）

```python
class ConfusionDetector:
    """
    不靠學員按鈕 — 從數據推斷困惑
    學員看投影機，不會一直盯手機
    """

    async def detect(self, context):
        signals = []

        # 信號 1：投票答對率低
        if context.last_vote_accuracy and context.last_vote_accuracy < 0.4:
            signals.append({
                "type": "low_accuracy",
                "detail": f"答對率 {context.last_vote_accuracy:.0%}",
                "severity": "high"
            })

        # 信號 2：QA 區同主題多人問
        qa_clusters = self.cluster_questions(context.recent_qa)
        for cluster in qa_clusters:
            if cluster["count"] >= 3:
                signals.append({
                    "type": "repeated_questions",
                    "detail": f"{cluster['count']} 人問「{cluster['topic']}」",
                    "severity": "medium"
                })

        # 信號 3：訊息牆出現困惑關鍵字
        confused_msgs = [m for m in context.recent_wall
                        if any(kw in m["text"] for kw in
                               ["不懂", "什麼意思", "聽不懂", "太快",
                                "???", "confused", "看不懂"])]
        if len(confused_msgs) >= 2:
            signals.append({
                "type": "confusion_keywords",
                "detail": f"{len(confused_msgs)} 則困惑訊息",
                "severity": "medium"
            })

        # 信號 4：訊息頻率驟降（可能放棄跟不上）
        if context.msg_rate_trend == "dropping" and context.msg_rate < 1:
            signals.append({
                "type": "disengagement",
                "detail": "訊息率下降，可能有人跟不上",
                "severity": "low"
            })

        return signals

    async def suggest_action(self, signals):
        """根據困惑信號建議行動"""
        if not signals:
            return None

        # 嚴重：投票答對率低 → 建議重講 + 出互動題
        high = [s for s in signals if s["severity"] == "high"]
        if high:
            return {
                "action": "pause_and_review",
                "message": f"⚠️ {high[0]['detail']}，建議暫停補充說明",
                "auto_action": "create_review_quiz"  # Agent 可自動出題
            }

        # 中等：多人問同問題 → 建議統一回答
        medium = [s for s in signals if s["severity"] == "medium"]
        if medium:
            return {
                "action": "address_common_question",
                "message": f"💡 {medium[0]['detail']}，建議統一說明",
                "auto_action": None  # 只建議，不自動執行
            }

        return None
```

---

## 四、課前問卷系統（AI 自動生成）

### AI 自動生成問卷流程

```
老師上傳 PPTX + 設定受眾
         │
         ▼
┌─────────────────────────────────────────┐
│  AI 分析（自動觸發）                      │
│                                          │
│  輸入：                                   │
│  - 簡報標題 + 每頁文字內容（from notes）   │
│  - 受眾描述（"企業中階主管"）              │
│  - 課程時長（120 分鐘）                   │
│                                          │
│  輸出：                                   │
│  - 問卷題目（5-8 題）                     │
│  - 暖身挑戰題（1-2 題）                   │
│  - 預期學員分群                           │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  老師在看板上看到「課前問卷」卡片          │
│  → 預覽 AI 生成的問卷                     │
│  → 可編輯/調整                           │
│  → 確認後，系統生成 QR code + 連結        │
│  → 發送給學員                             │
└─────────────────────────────────────────┘
```

### 問卷 AI 生成 Prompt

```python
async def generate_survey(deck_manifest, audience, duration):
    prompt = f"""你是課程設計專家。根據以下資訊，生成一份課前問卷。

課程主題：{deck_manifest['title']}
投影片內容摘要：
{chr(10).join(f"  第{s['index']}頁：{s['notes'][:100]}" for s in deck_manifest['slides'] if s['notes'])}

受眾：{audience}
課程時長：{duration} 分鐘

請生成 JSON 格式的問卷：
{{
  "sections": [
    {{
      "title": "基本資訊",
      "questions": [
        {{ "id": "level", "type": "scale",
           "label": "你對「{deck_manifest['title']}」的熟悉程度？",
           "options": ["完全沒接觸", "聽過但沒用過", "用過幾次", "經常使用", "可以教別人"] }},
        {{ "id": "role", "type": "choice",
           "label": "你的角色？",
           "options": [根據受眾客製化] }}
      ]
    }},
    {{
      "title": "學習期望",
      "questions": [
        {{ "id": "expect", "type": "multi-choice",
           "label": "你最想學到什麼？",
           "options": [根據投影片內容客製化 4-5 個選項] }},
        {{ "id": "question", "type": "text",
           "label": "你最想問老師的一個問題？" }}
      ]
    }},
    {{
      "title": "暖身挑戰",
      "questions": [
        {{ "id": "challenge", "type": "choice",
           "label": "根據課程內容出一題有趣的選擇題",
           "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
           "correctAnswer": 0 }}
      ]
    }}
  ]
}}

注意：
- 問卷要簡短（3 分鐘內填完）
- 選項要具體、接地氣
- 暖身題要有趣、引發好奇心
- 繁體中文"""

    result = await call_ai(prompt)
    return json.loads(result)
```

---

## 五、課後回饋系統（AI 對話式）

### AI 對話回饋流程

```
課程結束
  │
  ▼ 老師按「結束課程」或語音說「下課」
  │
  ├→ 學員手機自動跳轉到 feedback 模式
  │   ┌─────────────────────────────┐
  │   │ 🤖 感謝參加今天的課程！       │
  │   │    想聽聽你的想法 😊          │
  │   │                             │
  │   │ 1️⃣ 今天哪一段對你最有幫助？   │
  │   │    [快速選擇按鈕]             │
  │   │    • AI 概論介紹              │
  │   │    • Prompt 實作              │
  │   │    • RAG 架構解說             │
  │   │    • 自由輸入                 │
  │   │                             │
  │   │ 2️⃣ 有沒有哪裡覺得不太清楚？   │
  │   │    [自由輸入]                 │
  │   │                             │
  │   │ 3️⃣ 整體節奏如何？             │
  │   │    [太快] [剛好] [可以更快]    │
  │   │                             │
  │   │ 4️⃣ 給老師的建議？             │
  │   │    [自由輸入]                 │
  │   │                             │
  │   │ ─── 快速評分 ───              │
  │   │ 滿意度 ⭐⭐⭐⭐⭐              │
  │   │ 推薦度 ⭐⭐⭐⭐⭐              │
  │   │                             │
  │   │ [完成] [下載簡報 📥]          │
  │   └─────────────────────────────┘
  │
  ├→ 投影機顯示感謝頁 + 即時統計
  │   ┌─────────────────────────────┐
  │   │ 🎉 感謝大家！                 │
  │   │                             │
  │   │ 已收到 12/28 份回饋           │
  │   │ ████████░░ 43%              │
  │   │                             │
  │   │ 📥 掃碼下載今天的簡報         │
  │   │     [QR CODE]               │
  │   └─────────────────────────────┘
  │
  └→ Agent 自動生成教學報告
      ├→ 課前期望 vs 課後滿足度比較
      ├→ 各段落有效性排名
      ├→ 困惑點摘要
      └→ 下次課程建議
```

---

## 六、完整頁面清單

```
現有頁面：
  /classroom/host          講師後台（Dashboard）
  /classroom/              學員互動頁
  /classroom/remote        手機遙控器
  /classroom/assistant.py  AI 助教 daemon

新增頁面：
  /classroom/planner       Trello 式課程規劃看板     ← Phase 1
  /classroom/presenter     投影機簡報檢視器（PPTX圖片）← Phase 1
  /classroom/survey        課前問卷（AI 生成）        ← Phase 1
  /classroom/feedback      課後 AI 對話回饋           ← Phase 1
  /classroom/report        教學報告（講師+學員版）     ← Phase 1

升級：
  /classroom/host       → 整合看板入口 + 即時分析面板
  /classroom/           → 支援 feedback 模式 + 簡報下載
  assistant.py          → classroom_agent.py（模組化 Agent）← Phase 2

新增腳本：
  scripts/convert_slides.py          PPTX → WebP 轉換
  .github/workflows/convert-slides.yml  GitHub Actions 自動轉換
```

---

## 七、Firebase 資料結構（完整版 v2）

```
# ── 課程管理（新增）──
courses/{courseId}/
  config/: { title, teacher, audience, created }
  sessions/{sessionId}/
    title, date, duration, deck, status, roomId
    cards/{cardId}/: { type, status, data, timestamps }
    teachingNotes/: { content, segments[] }
    timePlan/: { total, segments[] }

# ── 投影片資源（GitHub Pages 靜態）──
/slides/{deckId}/
  slides.json              ← manifest
  slide-01.webp            ← 全尺寸
  slide-01-thumb.webp      ← 縮圖

# ── 教室即時（現有 + 擴展）──
rooms/{roomId}/
  config/: { title, mode, hostUid, hostName, password?,
             aiEnabled, agentMode, deckId }  ← 新增 deckId

  # 現有
  presence/, wall/, currentVote, votes/, qa/, qaUps/, qaReplies/
  presentation/, slideControl/

  # Phase 1 新增
  surveyConfig/: { sections[], enabled, deadline }
  survey/{odID}/: { name, ts, answers/ }
  surveyAnalysis/: { summary, segments[], topQuestions[], ... }

  feedback/{odID}/: { name, conversation[], ratings/, ... }
  feedbackAnalysis/: { highlights[], painPoints[], ... }

  overlay/: {                    ← 投影機覆蓋層控制
    type: "vote_bar"|"vote_pie"|"wordcloud"|"none",
    show: boolean,
    data: { ... }
  }

  # Phase 2 新增
  analytics/current: { online, msg_rate, active_pct, ... }
  analytics/insights/{pushId}: { type, message, severity }
  agentLog/{pushId}: { action, detail, ts }
  voiceLog/{pushId}: { text, intent, executed, ts }

# ── 跨課程（Phase 2）──
users/{uid}/
  rooms/{roomId}/: { title, created }
  learningHistory/{courseId}/
    sessions/{sessionId}/: { surveyScore, participation, feedback }
```

---

## 八、開發順序（修正版）

```
Phase 1a — 基礎建設（1-2 週）
  ☐ PPTX 轉換管線（GitHub Actions + convert_slides.py）
  ☐ 簡報檢視器 /classroom/presenter（圖片 + 覆蓋層 + Firebase 同步）
  ☐ 看板頁面 /classroom/planner（基礎版：課程列表 + 卡片）

Phase 1b — 課前課後（2-3 週）
  ☐ 課前問卷 /classroom/survey（AI 自動生成 + 學員填寫）
  ☐ 問卷分析（AI 自動分群 + 熱門問題整理）
  ☐ 課後回饋 /classroom/feedback（對話式 + 快速評分 + 簡報下載）
  ☐ 教學報告 /classroom/report

Phase 2a — Agent 核心（2-3 週）
  ☐ classroom_agent.py（模組化架構）
  ☐ 語音橋接（jt-live-whisper TCP）
  ☐ 即時指令：語音換頁、模式切換
  ☐ 語音建立投票（AI 解析問題+選項 → 即時推送）
  ☐ 困惑偵測（AI 推斷，非按鈕）
  ☐ 即時教學建議（Agent → 講師面板）

Phase 2b — Agent 進階（3-4 週）
  ☐ AI 自動出題（根據語音內容）
  ☐ 文字雲互動
  ☐ 代課模式（Autopilot）
  ☐ 即時情緒/參與度分析
  ☐ 跨課程學習歷程追蹤
```

---

## 九、技術選型

| 元件 | 選型 | 理由 |
|------|------|------|
| 前端 | 純 HTML/JS | 零依賴、GitHub Pages、現有架構 |
| 即時資料 | Firebase RTDB | 已驗證、免費、即時同步 |
| AI 模型 | Gemini 2.5 Pro/Flash | 免費額度、中文好、速度快 |
| PPTX 轉換 | LibreOffice + pdf2image | 品質最好、免費 |
| 圖片格式 | WebP | 比 PNG 小 50%、所有瀏覽器支援 |
| 自動化 | GitHub Actions | PPTX push → 自動轉換 → 部署 |
| Agent | Python (ac-mac daemon) | 24/7、模組化、asyncio |
| 語音 | jt-live-whisper (TCP) | 本地、免費、低延遲 |
| 看板 UI | 純 CSS Grid + 拖曳 | 不需要 React/Vue，原生夠用 |
| 通知 | Telegram Bot | 已有基礎設施 |
