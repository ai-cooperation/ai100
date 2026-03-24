#!/usr/bin/env python3
"""
Classroom Agent — 語音驅動 AI 課堂助教

模組化架構：感知 → 決策 → 執行
支援語音指令、自動投票、困惑偵測、互動熱場、代課模式

用法：
  python3 classroom_agent.py 20260401-ai100 --key YOUR_GEMINI_KEY
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY --voice
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY --voice --autopilot
"""

import json
import re
import time
import sys
import argparse
import os
import socket
import threading
import urllib.request
import urllib.error
from datetime import datetime
from collections import Counter

# ═══════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════

FIREBASE_DB = "https://ai-classroom-70a97-default-rtdb.firebaseio.com"
AGENT_NAME = "AI 助教"
MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"]
TICK_INTERVAL = 3  # seconds


# ═══════════════════════════════════════════════════════════════
# Firebase Helpers
# ═══════════════════════════════════════════════════════════════

def fb_read(path):
    try:
        req = urllib.request.Request(f"{FIREBASE_DB}/{path}.json")
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"Firebase read error: {e}", "!")
        return None


def fb_write(path, data, method='POST'):
    """POST = push (new key), PUT = set (overwrite), PATCH = update."""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{FIREBASE_DB}/{path}.json", data=body, method=method,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"Firebase write error: {e}", "!")
        return None


def fb_set(path, data):
    return fb_write(path, data, method='PUT')


def fb_delete(path):
    req = urllib.request.Request(f"{FIREBASE_DB}/{path}.json", method='DELETE')
    try:
        urllib.request.urlopen(req, timeout=8)
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════
# AI Call
# ═══════════════════════════════════════════════════════════════

def call_ai(api_key, prompt, system_prompt=None, temperature=0.7, max_tokens=2048, json_mode=False):
    """Call Gemini API with model fallback."""
    for model in MODELS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    "temperature": temperature,
                }
            }
            if system_prompt:
                payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
            if json_mode:
                payload["generationConfig"]["responseMimeType"] = "application/json"

            body = json.dumps(payload).encode()
            req = urllib.request.Request(url, data=body, method='POST',
                                        headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())

            if "error" in data:
                if data["error"].get("code") == 429:
                    log(f"{model} rate limited, trying next...", "!")
                    continue
                raise Exception(data["error"]["message"][:120])

            answer = (data.get("candidates", [{}])[0]
                      .get("content", {}).get("parts", [{}])[0].get("text", ""))
            if answer:
                log(f"{model} responded ({len(answer)} chars)", "✓")
                return answer
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log(f"{model} 429, trying next...", "!")
                continue
            raise
    return None


# ═══════════════════════════════════════════════════════════════
# Logging
# ═══════════════════════════════════════════════════════════════

def now():
    return datetime.now().strftime("%H:%M:%S")


def log(msg, icon="·"):
    print(f"[{now()}] [{icon}] {msg}")


# ═══════════════════════════════════════════════════════════════
# Voice Bridge — jt-live-whisper TCP
# ═══════════════════════════════════════════════════════════════

class VoiceBridge:
    """Connect to jt-live-whisper TCP stream and collect transcriptions."""

    def __init__(self, host="127.0.0.1", port=19780):
        self.host = host
        self.port = port
        self.connected = False
        self.transcription_queue = []
        self.speech_buffer = []  # recent speech for context
        self._lock = threading.Lock()
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()

    def _listen_loop(self):
        while True:
            try:
                log(f"Connecting to jt-live-whisper at {self.host}:{self.port}...", "🎤")
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((self.host, self.port))
                sock.settimeout(1.0)
                self.connected = True
                log("Voice bridge connected!", "🎤")

                buffer = ""
                while True:
                    try:
                        data = sock.recv(4096).decode('utf-8')
                        if not data:
                            break
                        buffer += data
                        while '\n' in buffer:
                            line, buffer = buffer.split('\n', 1)
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                msg = json.loads(line)
                                if msg.get("type") == "transcription":
                                    text = msg.get("src_text", "").strip()
                                    if text:
                                        with self._lock:
                                            self.transcription_queue.append(text)
                                            self.speech_buffer.append(text)
                                            # Keep last 50 transcriptions for context
                                            if len(self.speech_buffer) > 50:
                                                self.speech_buffer.pop(0)
                            except json.JSONDecodeError:
                                pass
                    except socket.timeout:
                        continue

            except (ConnectionRefusedError, OSError) as e:
                self.connected = False
                log(f"Voice bridge disconnected: {e}. Retry in 10s...", "🎤")
                time.sleep(10)

    def get_new_transcriptions(self):
        with self._lock:
            items = list(self.transcription_queue)
            self.transcription_queue.clear()
            return items

    def get_recent_speech(self, n=20):
        with self._lock:
            return list(self.speech_buffer[-n:])


# ═══════════════════════════════════════════════════════════════
# Intent Parser — Two-layer: Rules + AI
# ═══════════════════════════════════════════════════════════════

class IntentParser:
    """Parse voice transcription into actionable intents."""

    # Layer 1: Instant commands (regex, < 1ms)
    INSTANT_RULES = [
        ("slide_next",  [r"下一[頁張]", r"next\s*(page|slide)?", r"繼續", r"往下"]),
        ("slide_prev",  [r"上一[頁張]", r"previous", r"回去", r"往回"]),
        ("slide_goto",  [r"跳到第\s*(\d+)", r"第\s*(\d+)\s*[頁張]", r"go\s*to\s*(\d+)"]),
        ("mode_wall",   [r"開(訊息牆|聊天|留言)", r"message\s*wall"]),
        ("mode_qa",     [r"開問答", r"Q\s*&?\s*A", r"問答時間"]),
        ("mode_vote",   [r"開投票", r"start\s*vote"]),
        ("mode_pause",  [r"暫停", r"休息", r"pause"]),
        ("end_vote",    [r"結束投票", r"投票結束", r"stop\s*vote", r"end\s*vote"]),
        ("ai_on",       [r"(AI|助教|機器人)\s*(上線|開|啟動)", r"開\s*AI"]),
        ("ai_off",      [r"(AI|助教|機器人)\s*(下線|關|休息|停)", r"關\s*AI"]),
        ("summarize",   [r"(幫我|請)?總結", r"重點整理", r"summar"]),
        ("icebreaker",  [r"暖場", r"破冰", r"ice\s*break", r"活絡"]),
        ("quiz",        [r"出[一1]題", r"考[他她們]", r"隨堂(測驗|考)", r"pop\s*quiz"]),
        ("wordcloud",   [r"文字雲", r"word\s*cloud"]),
        ("autopilot_on",  [r"自動(導航|駕駛|模式)", r"幫我講", r"auto\s*pilot"]),
        ("autopilot_off", [r"我回來了", r"停止自動", r"手動模式", r"I'?m\s*back"]),
        ("end_class",   [r"下課", r"課程結束", r"end\s*class"]),
    ]

    def __init__(self, api_key):
        self.api_key = api_key

    def parse(self, text):
        """Try rule-based first, then AI for complex intents."""
        text_clean = text.strip()
        if not text_clean:
            return None

        # Layer 1: Regex matching
        for intent_name, patterns in self.INSTANT_RULES:
            for pattern in patterns:
                m = re.search(pattern, text_clean, re.IGNORECASE)
                if m:
                    params = {}
                    if m.groups():
                        # Extract numeric param for slide_goto
                        for g in m.groups():
                            if g and g.isdigit():
                                params["n"] = int(g)
                    log(f"Voice intent (rule): {intent_name} {params}", "🎯")
                    return {"intent": intent_name, "params": params, "confidence": 1.0}

        # Layer 2: Check if it might be a create_vote intent
        vote_keywords = ["投票", "選項", "vote", "問題是"]
        if any(kw in text_clean for kw in vote_keywords) and len(text_clean) > 10:
            return self._ai_parse_vote(text_clean)

        return None

    def _ai_parse_vote(self, text):
        """Use AI to extract vote question and options from speech."""
        prompt = f"""從以下老師的語音中提取投票的問題和選項。

老師說：「{text}」

回傳 JSON（只回傳 JSON，不要其他文字）：
{{
  "intent": "create_vote",
  "question": "投票問題",
  "options": ["選項1", "選項2", "選項3"]
}}

如果無法辨識為投票指令，回傳：
{{"intent": "none"}}"""

        result = call_ai(self.api_key, prompt, temperature=0.1, max_tokens=512, json_mode=True)
        if not result:
            return None
        try:
            data = json.loads(result)
            if data.get("intent") == "create_vote" and data.get("options"):
                log(f"Voice intent (AI): create_vote — {data['question']}", "🎯")
                return {
                    "intent": "create_vote",
                    "params": {
                        "question": data["question"],
                        "options": data["options"]
                    },
                    "confidence": 0.9
                }
        except (json.JSONDecodeError, KeyError):
            pass
        return None


# ═══════════════════════════════════════════════════════════════
# Slide Controller
# ═══════════════════════════════════════════════════════════════

class SlideController:
    """Control presentation slides via Firebase."""

    def __init__(self, room_id):
        self.room_id = room_id
        self.current_index = 0
        self.total_slides = 0
        self._load_presentation()

    def _load_presentation(self):
        pres = fb_read(f"rooms/{self.room_id}/presentation")
        if pres:
            self.current_index = pres.get("current", 0)
            sections = pres.get("sections", [])
            self.total_slides = len(sections)

    def goto(self, index):
        index = max(0, min(index, self.total_slides - 1))
        self.current_index = index
        fb_set(f"rooms/{self.room_id}/slideControl", {
            "action": "goto",
            "index": index,
            "ts": {".sv": "timestamp"}
        })
        fb_set(f"rooms/{self.room_id}/presentation/current", index)
        log(f"Slide → {index + 1}/{self.total_slides}", "📄")

    def next(self):
        self.goto(self.current_index + 1)

    def prev(self):
        self.goto(self.current_index - 1)


# ═══════════════════════════════════════════════════════════════
# Vote Manager
# ═══════════════════════════════════════════════════════════════

class VoteManager:
    """Create and manage live votes."""

    def __init__(self, room_id):
        self.room_id = room_id

    def create(self, question, options, correct_answer=None):
        """Create a vote and switch mode."""
        vote_id = f"v{int(time.time())}"
        vote_data = {
            "question": question,
            "options": options,
            "id": vote_id,
            "source": "agent",
        }
        if correct_answer is not None:
            vote_data["correctAnswer"] = correct_answer

        fb_set(f"rooms/{self.room_id}/currentVote", vote_data)
        fb_set(f"rooms/{self.room_id}/config/mode", "vote")

        # Show overlay on presenter
        fb_set(f"rooms/{self.room_id}/overlay", {
            "type": "vote_live",
            "voteId": vote_id,
            "show": True,
        })

        log(f"Vote created: {question} ({len(options)} options)", "📊")
        return vote_id

    def end(self):
        """End current vote and return results."""
        vote = fb_read(f"rooms/{self.room_id}/currentVote")
        if not vote:
            return None

        vote_id = vote.get("id", "")
        votes = fb_read(f"rooms/{self.room_id}/votes/{vote_id}") or {}

        total = len(votes)
        dist = Counter(v for v in votes.values() if isinstance(v, int))
        options = vote.get("options", [])
        correct = vote.get("correctAnswer")

        results = {
            "question": vote.get("question", ""),
            "total": total,
            "distribution": {i: dist.get(i, 0) for i in range(len(options))},
            "options": options,
        }

        if correct is not None and total > 0:
            results["correct_rate"] = dist.get(correct, 0) / total

        # Clean up
        fb_delete(f"rooms/{self.room_id}/currentVote")
        fb_set(f"rooms/{self.room_id}/overlay", {"type": "none", "show": False})

        log(f"Vote ended: {total} votes", "📊")
        return results

    def get_live_results(self):
        """Get current vote results without ending."""
        vote = fb_read(f"rooms/{self.room_id}/currentVote")
        if not vote:
            return None
        vote_id = vote.get("id", "")
        votes = fb_read(f"rooms/{self.room_id}/votes/{vote_id}") or {}
        return {"total": len(votes), "distribution": Counter(
            v for v in votes.values() if isinstance(v, int)
        )}


# ═══════════════════════════════════════════════════════════════
# Interaction Engine — AI quiz, word cloud, icebreaker
# ═══════════════════════════════════════════════════════════════

class InteractionEngine:
    """Agent-initiated interactions."""

    def __init__(self, room_id, api_key, vote_mgr):
        self.room_id = room_id
        self.api_key = api_key
        self.vote_mgr = vote_mgr

    def create_quiz(self, topic="", speech_context="", slide_notes=""):
        """AI generates a quiz question based on current teaching content."""
        context_parts = []
        if topic:
            context_parts.append(f"主題：{topic}")
        if speech_context:
            context_parts.append(f"老師最近講的內容：\n{speech_context}")
        if slide_notes:
            context_parts.append(f"投影片備忘錄：\n{slide_notes}")

        context = "\n\n".join(context_parts) or "一般 AI 知識"

        prompt = f"""你是課堂助教。根據以下教學內容出一題互動選擇題。

{context}

要求：
- 一題四選一
- 測試核心觀念理解，不是死記硬背
- 錯誤選項是常見誤解，要有迷惑性
- 用繁體中文，有趣接地氣

回傳 JSON：
{{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": 0, "explanation": "..."}}"""

        result = call_ai(self.api_key, prompt, temperature=0.8, max_tokens=1024, json_mode=True)
        if not result:
            return None

        try:
            quiz = json.loads(result)
            vote_id = self.vote_mgr.create(
                quiz["question"],
                quiz["options"],
                correct_answer=quiz.get("answer")
            )
            log(f"Quiz created: {quiz['question'][:50]}...", "🎲")
            return {"vote_id": vote_id, "explanation": quiz.get("explanation", "")}
        except (json.JSONDecodeError, KeyError) as e:
            log(f"Quiz generation failed: {e}", "!")
            return None

    def start_wordcloud(self, question=None):
        """Start a word cloud interaction."""
        question = question or "用一個詞形容你現在的感覺"

        fb_set(f"rooms/{self.room_id}/config/mode", "wall")
        fb_set(f"rooms/{self.room_id}/overlay", {
            "type": "wordcloud",
            "question": question,
            "show": True,
            "startTime": int(time.time() * 1000),
        })

        # AI posts the prompt
        fb_write(f"rooms/{self.room_id}/wall", {
            "text": f"🎯 快速互動！{question}\n請在下方輸入一個詞！",
            "name": AGENT_NAME, "role": "ai",
            "ts": {".sv": "timestamp"}
        })

        log(f"Word cloud started: {question}", "☁️")

    def icebreaker(self, context=""):
        """Generate and start an icebreaker activity."""
        prompt = f"""你是課堂助教，要發起一個 30 秒的暖場互動。

目前教學情境：{context or '一般課程'}

選一種類型：
1. 快速投票（有趣的、跟課程相關的）
2. 文字雲（一個詞形容...）

回傳 JSON：
{{"type": "vote", "question": "...", "options": ["...", "...", "...", "..."]}}
或
{{"type": "wordcloud", "question": "..."}}"""

        result = call_ai(self.api_key, prompt, temperature=0.9, max_tokens=512, json_mode=True)
        if not result:
            return

        try:
            data = json.loads(result)
            if data.get("type") == "vote":
                self.vote_mgr.create(data["question"], data["options"])
            elif data.get("type") == "wordcloud":
                self.start_wordcloud(data["question"])
            log(f"Icebreaker started: {data.get('type')}", "🎲")
        except (json.JSONDecodeError, KeyError):
            # Fallback: simple status poll
            self.vote_mgr.create(
                "你現在的狀態？",
                ["🔥 超投入", "😊 跟得上", "😵 有點暈", "💤 快睡著"]
            )


# ═══════════════════════════════════════════════════════════════
# Confusion Detector — AI inferred, not button-based
# ═══════════════════════════════════════════════════════════════

class ConfusionDetector:
    """Detect confusion from data signals, not student buttons."""

    CONFUSION_KEYWORDS = [
        "不懂", "什麼意思", "聽不懂", "看不懂", "太快了",
        "跟不上", "???", "confused", "不理解", "沒聽懂",
        "可以再說一次", "再講一遍",
    ]

    def __init__(self, room_id):
        self.room_id = room_id
        self.last_msg_rate = 0
        self.msg_rate_history = []

    def analyze(self, wall_msgs, qa_items, vote_results=None, online_count=1):
        """Analyze all signals and return confusion indicators."""
        signals = []

        # Signal 1: Low vote accuracy
        if vote_results and vote_results.get("correct_rate") is not None:
            rate = vote_results["correct_rate"]
            if rate < 0.4:
                signals.append({
                    "type": "low_accuracy",
                    "severity": "high",
                    "detail": f"投票答對率僅 {rate:.0%}",
                    "suggestion": "建議暫停補充說明，或用不同方式解釋"
                })
            elif rate < 0.6:
                signals.append({
                    "type": "low_accuracy",
                    "severity": "medium",
                    "detail": f"投票答對率 {rate:.0%}，部分學員可能不理解",
                    "suggestion": "考慮舉一個生活化的例子"
                })

        # Signal 2: Confusion keywords in wall
        recent_wall = [m for m in wall_msgs
                       if m.get("role") == "student"
                       and m.get("ts", 0) > time.time() * 1000 - 5 * 60 * 1000]
        confused_msgs = [m for m in recent_wall
                         if any(kw in m.get("text", "") for kw in self.CONFUSION_KEYWORDS)]
        if len(confused_msgs) >= 2:
            signals.append({
                "type": "confusion_keywords",
                "severity": "medium",
                "detail": f"過去 5 分鐘有 {len(confused_msgs)} 則困惑訊息",
                "suggestion": "有多位學員表示不清楚，建議確認理解度"
            })

        # Signal 3: Multiple QA questions on same topic
        recent_qa = [q for q in qa_items
                     if q.get("ts", 0) > time.time() * 1000 - 10 * 60 * 1000]
        if len(recent_qa) >= 3:
            signals.append({
                "type": "many_questions",
                "severity": "medium",
                "detail": f"QA 區有 {len(recent_qa)} 個近期問題",
                "suggestion": "建議統一回答最多人問的問題"
            })

        # Signal 4: Message rate dropping
        current_rate = len(recent_wall) / max(5, 1)  # per minute
        self.msg_rate_history.append(current_rate)
        if len(self.msg_rate_history) > 10:
            self.msg_rate_history.pop(0)

        if (len(self.msg_rate_history) >= 3
                and self.msg_rate_history[-3] > 2
                and current_rate < self.msg_rate_history[-3] * 0.3
                and online_count > 5):
            signals.append({
                "type": "engagement_drop",
                "severity": "low",
                "detail": f"訊息率從 {self.msg_rate_history[-3]:.1f}/min 降到 {current_rate:.1f}/min",
                "suggestion": "參與度下降，建議發起互動（投票或文字雲）"
            })

        return signals


# ═══════════════════════════════════════════════════════════════
# Teaching Advisor — AI-powered suggestions for instructor
# ═══════════════════════════════════════════════════════════════

class TeachingAdvisor:
    """Generate real-time teaching suggestions."""

    def __init__(self, room_id, api_key):
        self.room_id = room_id
        self.api_key = api_key
        self.last_advice_time = 0

    def should_advise(self):
        """Rate limit: advise at most once per 60 seconds."""
        return time.time() - self.last_advice_time > 60

    def generate_advice(self, confusion_signals, context_summary, online_count):
        """Generate teaching advice based on current signals."""
        if not confusion_signals and not self.should_advise():
            return None

        self.last_advice_time = time.time()

        if not confusion_signals:
            return None

        # Format signals for the advisor
        signal_text = "\n".join(
            f"- [{s['severity'].upper()}] {s['detail']}: {s['suggestion']}"
            for s in confusion_signals
        )

        prompt = f"""你是資深教學顧問，正在即時觀察一堂課。

目前狀態：
- 在線學員：{online_count} 人

偵測到的信號：
{signal_text}

教室動態：
{context_summary[:800]}

請給講師 1-2 條簡短建議（每條一句話），格式：
⚠️/💡/✅ 建議內容

只在有明確問題時才用 ⚠️。如果信號不嚴重，給 💡 溫和建議。
用繁體中文，直接實用。"""

        advice = call_ai(self.api_key, prompt, temperature=0.5, max_tokens=256)
        if advice:
            # Write to Firebase for host.html to display
            fb_set(f"rooms/{self.room_id}/agentAdvice", {
                "text": advice.strip(),
                "signals": [s["type"] for s in confusion_signals],
                "ts": {".sv": "timestamp"}
            })
            log(f"Teaching advice generated", "🧠")
        return advice


# ═══════════════════════════════════════════════════════════════
# Autopilot Module — AI teaches on behalf of instructor
# ═══════════════════════════════════════════════════════════════

class AutopilotModule:
    """AI auto-teach mode: explains slides + runs interactions."""

    def __init__(self, room_id, api_key, slide_ctrl, vote_mgr, interaction):
        self.room_id = room_id
        self.api_key = api_key
        self.slide_ctrl = slide_ctrl
        self.vote_mgr = vote_mgr
        self.interaction = interaction
        self.active = False
        self.script = []
        self.current_step = 0

    def start(self):
        """Activate autopilot mode."""
        self.active = True
        self.current_step = 0

        # Load presentation sections
        pres = fb_read(f"rooms/{self.room_id}/presentation") or {}
        sections = pres.get("sections", [])

        if not sections:
            fb_write(f"rooms/{self.room_id}/wall", {
                "text": "⚠️ 沒有載入簡報段落，無法啟動自動模式。請先開啟簡報檢視器。",
                "name": AGENT_NAME, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            self.active = False
            return

        # Generate teaching script
        self._generate_script(sections)

        fb_write(f"rooms/{self.room_id}/wall", {
            "text": "🤖 AI 助教開始導覽模式！我會帶大家瀏覽投影片重點。有問題隨時提問 👋",
            "name": AGENT_NAME, "role": "ai",
            "ts": {".sv": "timestamp"}
        })
        fb_set(f"rooms/{self.room_id}/config/mode", "wall")
        log("Autopilot ACTIVATED", "🤖")

    def stop(self):
        """Deactivate autopilot."""
        self.active = False
        fb_write(f"rooms/{self.room_id}/wall", {
            "text": "🤖 自動導覽結束，老師回來了！",
            "name": AGENT_NAME, "role": "ai",
            "ts": {".sv": "timestamp"}
        })
        log("Autopilot DEACTIVATED", "🤖")

    def _generate_script(self, sections):
        """Build a simple script: for each section, go to slide + explain."""
        self.script = []
        for i, section in enumerate(sections):
            title = section.get("title", f"段落 {i+1}")
            self.script.append({"type": "slide", "index": i})
            self.script.append({"type": "explain", "topic": title, "pause": 12})
            # Add a quiz every 4 sections
            if (i + 1) % 4 == 0 and i < len(sections) - 1:
                self.script.append({"type": "quiz", "topic": title, "pause": 20})

    def tick(self):
        """Execute one step of the autopilot script."""
        if not self.active or self.current_step >= len(self.script):
            if self.active:
                self.stop()
            return

        step = self.script[self.current_step]

        if step["type"] == "slide":
            self.slide_ctrl.goto(step["index"])
            self.current_step += 1
            return  # Immediately proceed to next step

        elif step["type"] == "explain":
            topic = step.get("topic", "")
            prompt = f"""你是課堂 AI 助教，正在帶學員瀏覽投影片。

目前段落：「{topic}」

用 2-3 句話（100-200 字）解釋這個段落的重點。
要求：
- 白話文，像跟朋友聊天
- 舉一個生活化的例子
- 最後問一句引導性問題（「你們覺得...？」）
- 繁體中文"""

            explanation = call_ai(self.api_key, prompt, temperature=0.8, max_tokens=512)
            if explanation and "[SKIP]" not in explanation:
                fb_write(f"rooms/{self.room_id}/wall", {
                    "text": explanation.strip(),
                    "name": AGENT_NAME, "role": "ai",
                    "ts": {".sv": "timestamp"}
                })

            self.current_step += 1

        elif step["type"] == "quiz":
            self.interaction.create_quiz(topic=step.get("topic", ""))
            self.current_step += 1

    def get_pause(self):
        """How long to wait before next tick (in seconds)."""
        if not self.active or self.current_step >= len(self.script):
            return TICK_INTERVAL
        step = self.script[self.current_step]
        return step.get("pause", TICK_INTERVAL)


# ═══════════════════════════════════════════════════════════════
# Responder — Handle wall messages and QA
# ═══════════════════════════════════════════════════════════════

class Responder:
    """Respond to student messages and QA questions."""

    SYSTEM_PROMPT = """你是「{name}」，{teacher}老師的課堂 AI 助教。課程：{title}。

你的風格像一個超會教的學長姐 — 熱情、幽默、有料。
- 先肯定提問
- 用白話文解釋，像跟朋友聊天
- 舉具體例子或比喻
- 如果老師剛講過相關的，引用老師的話
- 回答完可以反問帶動互動

長度：200-500 字。
只有純粹的「OK」「+1」「哈哈」才回 [SKIP]。
用繁體中文。

{context}"""

    def __init__(self, room_id, api_key, name, teacher, title):
        self.room_id = room_id
        self.api_key = api_key
        self.name = name
        self.teacher = teacher
        self.title = title

    def build_context(self):
        wall = fb_read(f"rooms/{self.room_id}/wall") or {}
        qa = fb_read(f"rooms/{self.room_id}/qa") or {}
        replies = fb_read(f"rooms/{self.room_id}/qaReplies") or {}
        presence = fb_read(f"rooms/{self.room_id}/presence") or {}

        wall_msgs = sorted(wall.values(), key=lambda x: x.get("ts", 0))[-50:]
        qa_items = sorted(qa.values(), key=lambda x: x.get("ts", 0))[-30:]

        ctx = f"【教室】{self.title} | {len(presence)} 人在線\n\n"
        if wall_msgs:
            ctx += "【最近對話】\n"
            for m in wall_msgs[-20:]:
                role = m.get("role", "student")
                icon = "👨‍🏫" if role == "teacher" else "🤖" if role == "ai" else ""
                ctx += f"{icon}{m.get('name','?')}：{m.get('text','')}\n"
        if qa_items:
            ctx += "\n【問答區】\n"
            for q in qa_items[-10:]:
                ctx += f"[{q.get('ups',0)}票] {q.get('name','?')}：{q.get('text','')}\n"

        return ctx, wall_msgs, qa_items, len(presence)

    def respond_wall(self, new_msgs):
        """Respond to new wall messages."""
        student_msgs = [m for m in new_msgs if m.get("role") != "teacher"]
        if not student_msgs:
            return

        context, _, _, _ = self.build_context()
        sys_prompt = self.SYSTEM_PROMPT.format(
            name=self.name, teacher=self.teacher,
            title=self.title, context=context
        )

        prompt = "以下是學員的新訊息，請回應：\n\n"
        for m in student_msgs:
            prompt += f"{m.get('name','?')}：{m.get('text','')}\n"

        log("Responding to wall messages...", "🤖")
        answer = call_ai(self.api_key, prompt, system_prompt=sys_prompt)
        if answer and "[SKIP]" not in answer:
            fb_write(f"rooms/{self.room_id}/wall", {
                "text": answer.strip(),
                "name": self.name, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            log(f"Wall reply sent ({len(answer)} chars)", "✅")
        elif answer and "[SKIP]" in answer:
            log("Skipped (chit-chat)", "⏭️")

    def respond_qa(self, question):
        """Respond to a QA question."""
        context, _, _, _ = self.build_context()
        sys_prompt = self.SYSTEM_PROMPT.format(
            name=self.name, teacher=self.teacher,
            title=self.title, context=context
        )

        prompt = f"學員 {question.get('name','?')} 提問：{question.get('text','')}\n\n請回答。"
        log(f"Answering QA: {question.get('text','')[:60]}...", "🤖")
        answer = call_ai(self.api_key, prompt, system_prompt=sys_prompt)
        if answer and "[SKIP]" not in answer:
            fb_write(f"rooms/{self.room_id}/qaReplies/{question['id']}", {
                "text": answer.strip(),
                "name": self.name, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            log(f"QA reply sent ({len(answer)} chars)", "✅")


# ═══════════════════════════════════════════════════════════════
# Main Agent
# ═══════════════════════════════════════════════════════════════

class ClassroomAgent:
    """
    Main agent loop: Perceive → Decide → Act
    """

    def __init__(self, room_id, api_key, agent_name=AGENT_NAME,
                 enable_voice=False, voice_host="127.0.0.1", voice_port=19780):
        self.room_id = room_id
        self.api_key = api_key
        self.agent_name = agent_name

        # Load room config
        config = fb_read(f"rooms/{room_id}/config")
        if not config:
            print(f"ERROR: Room not found: {room_id}")
            sys.exit(1)

        self.teacher = config.get("hostName", "老師")
        self.title = config.get("title", room_id)

        # Initialize modules
        self.intent_parser = IntentParser(api_key)
        self.slide_ctrl = SlideController(room_id)
        self.vote_mgr = VoteManager(room_id)
        self.interaction = InteractionEngine(room_id, api_key, self.vote_mgr)
        self.confusion = ConfusionDetector(room_id)
        self.advisor = TeachingAdvisor(room_id, api_key)
        self.autopilot = AutopilotModule(room_id, api_key, self.slide_ctrl,
                                         self.vote_mgr, self.interaction)
        self.responder = Responder(room_id, api_key, agent_name, self.teacher, self.title)

        # Voice bridge (optional)
        self.voice = None
        if enable_voice:
            self.voice = VoiceBridge(voice_host, voice_port)
            self.voice.start()

        # Tracking
        wall = fb_read(f"rooms/{room_id}/wall") or {}
        qa = fb_read(f"rooms/{room_id}/qa") or {}
        self.seen_wall = set(wall.keys())
        self.seen_qa = set(qa.keys())
        self.last_vote_results = None
        self.ai_enabled = True
        self.tick_count = 0

    def run(self):
        """Main agent loop."""
        print()
        print("╔═══════════════════════════════════════════════╗")
        print(f"║  🤖 {self.agent_name} — Classroom Agent")
        print(f"║  教室: {self.room_id}")
        print(f"║  老師: {self.teacher}")
        print(f"║  語音: {'✅ 已啟用' if self.voice else '❌ 未啟用'}")
        print(f"║  模組: slide | vote | quiz | wordcloud | advisor")
        print(f"║        confusion | autopilot | responder")
        print(f"║  掃描: 每 {TICK_INTERVAL} 秒")
        print("╚═══════════════════════════════════════════════╝")
        print()

        # Send greeting
        fb_write(f"rooms/{self.room_id}/wall", {
            "text": f"大家好！我是{self.agent_name} 🤖 有問題隨時問我！",
            "name": self.agent_name, "role": "ai",
            "ts": {".sv": "timestamp"}
        })

        # Write agent status to Firebase
        fb_set(f"rooms/{self.room_id}/agentStatus", {
            "online": True,
            "name": self.agent_name,
            "voice": self.voice is not None and self.voice.connected,
            "modules": ["slide", "vote", "quiz", "wordcloud",
                        "advisor", "confusion", "autopilot", "responder"],
            "ts": {".sv": "timestamp"}
        })

        try:
            while True:
                pause = self.autopilot.get_pause() if self.autopilot.active else TICK_INTERVAL
                time.sleep(pause)
                self.tick()
        except KeyboardInterrupt:
            self._shutdown()

    def tick(self):
        """One agent tick: perceive → decide → act."""
        self.tick_count += 1

        try:
            # ── PERCEIVE ──

            # 1. Voice input
            voice_intents = []
            if self.voice:
                transcriptions = self.voice.get_new_transcriptions()
                for text in transcriptions:
                    log(f"🎤 \"{text[:80]}\"", "🎤")
                    intent = self.intent_parser.parse(text)
                    if intent:
                        voice_intents.append(intent)

            # 2. Firebase changes
            wall = fb_read(f"rooms/{self.room_id}/wall") or {}
            qa = fb_read(f"rooms/{self.room_id}/qa") or {}

            new_msgs = []
            for k, v in wall.items():
                if k not in self.seen_wall:
                    self.seen_wall.add(k)
                    if v.get("role") != "ai":
                        new_msgs.append(v)

            new_qs = []
            for k, v in qa.items():
                if k not in self.seen_qa:
                    self.seen_qa.add(k)
                    if v.get("role") != "ai":
                        new_qs.append({"id": k, **v})

            # 3. Check config changes
            config = fb_read(f"rooms/{self.room_id}/config") or {}
            self.ai_enabled = config.get("aiEnabled", True)

            # ── DECIDE & ACT ──

            # Handle voice intents (highest priority)
            for intent in voice_intents:
                self._execute_intent(intent)

            # Autopilot tick
            if self.autopilot.active:
                self.autopilot.tick()

            # Respond to messages (if AI enabled)
            if self.ai_enabled and not self.autopilot.active:
                if new_msgs:
                    for m in new_msgs:
                        role_icon = "👨‍🏫" if m.get("role") == "teacher" else "💬"
                        log(f"{role_icon} {m.get('name','?')}: {m.get('text','')[:60]}", "←")
                    self.responder.respond_wall(new_msgs)

                for q in new_qs:
                    log(f"❓ {q.get('name','?')}: {q.get('text','')[:60]}", "←")
                    self.responder.respond_qa(q)

            # Confusion detection + teaching advice (every 10 ticks = ~30s)
            if self.tick_count % 10 == 0:
                wall_msgs = sorted(wall.values(), key=lambda x: x.get("ts", 0))
                qa_items = sorted(qa.values(), key=lambda x: x.get("ts", 0))
                presence = fb_read(f"rooms/{self.room_id}/presence") or {}
                online = len(presence)

                signals = self.confusion.analyze(
                    wall_msgs, qa_items, self.last_vote_results, online
                )
                if signals:
                    for s in signals:
                        log(f"[{s['severity'].upper()}] {s['detail']}", "⚠️")

                    context_summary = f"在線 {online} 人\n"
                    context_summary += f"最近 5 分鐘訊息：{len(wall_msgs)} 則\n"
                    context_summary += f"QA 問題：{len(qa_items)} 個"

                    self.advisor.generate_advice(signals, context_summary, online)

        except Exception as e:
            log(f"Tick error: {e}", "❌")

    def _execute_intent(self, intent):
        """Execute a parsed voice intent."""
        name = intent["intent"]
        params = intent.get("params", {})

        # Slide control
        if name == "slide_next":
            self.slide_ctrl.next()
        elif name == "slide_prev":
            self.slide_ctrl.prev()
        elif name == "slide_goto":
            n = params.get("n", 1)
            self.slide_ctrl.goto(n - 1)  # 0-indexed

        # Mode switching
        elif name == "mode_wall":
            fb_set(f"rooms/{self.room_id}/config/mode", "wall")
            log("Mode → wall", "🔀")
        elif name == "mode_qa":
            fb_set(f"rooms/{self.room_id}/config/mode", "qa")
            log("Mode → Q&A", "🔀")
        elif name == "mode_vote":
            fb_set(f"rooms/{self.room_id}/config/mode", "vote")
            log("Mode → vote", "🔀")
        elif name == "mode_pause":
            fb_set(f"rooms/{self.room_id}/config/mode", "pause")
            log("Mode → pause", "🔀")

        # AI toggle
        elif name == "ai_on":
            self.ai_enabled = True
            fb_set(f"rooms/{self.room_id}/config/aiEnabled", True)
            log("AI enabled", "🤖")
        elif name == "ai_off":
            self.ai_enabled = False
            fb_set(f"rooms/{self.room_id}/config/aiEnabled", False)
            log("AI disabled", "🤖")

        # Vote
        elif name == "create_vote":
            self.vote_mgr.create(params["question"], params["options"])
        elif name == "end_vote":
            results = self.vote_mgr.end()
            if results:
                self.last_vote_results = results
                fb_set(f"rooms/{self.room_id}/config/mode", "wall")

        # Interactions
        elif name == "quiz":
            speech = "\n".join(self.voice.get_recent_speech(10)) if self.voice else ""
            self.interaction.create_quiz(speech_context=speech)
        elif name == "wordcloud":
            self.interaction.start_wordcloud()
        elif name == "icebreaker":
            speech = "\n".join(self.voice.get_recent_speech(5)) if self.voice else ""
            self.interaction.icebreaker(context=speech)
        elif name == "summarize":
            self._do_summary()

        # Autopilot
        elif name == "autopilot_on":
            self.autopilot.start()
        elif name == "autopilot_off":
            self.autopilot.stop()

        # End class
        elif name == "end_class":
            fb_set(f"rooms/{self.room_id}/config/mode", "feedback")
            fb_write(f"rooms/{self.room_id}/wall", {
                "text": "📚 課程結束！感謝大家的參與，請填寫課後回饋 💬",
                "name": self.agent_name, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            log("Class ended → feedback mode", "🏁")

    def _do_summary(self):
        """Summarize recent discussion."""
        context, _, _, _ = self.responder.build_context()
        prompt = f"""總結以下課堂討論的重點（用 3-5 個重點條列）：

{context}

格式：
📌 重點 1
📌 重點 2
...

用繁體中文，簡潔有力。"""

        summary = call_ai(self.api_key, prompt, temperature=0.5, max_tokens=512)
        if summary:
            fb_write(f"rooms/{self.room_id}/wall", {
                "text": f"📋 重點整理：\n\n{summary.strip()}",
                "name": self.agent_name, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            log("Summary posted", "📋")

    def _shutdown(self):
        """Graceful shutdown."""
        print()
        log(f"{self.agent_name} shutting down...", "👋")

        fb_write(f"rooms/{self.room_id}/wall", {
            "text": f"{self.agent_name}下線了，大家下次見！👋",
            "name": self.agent_name, "role": "ai",
            "ts": {".sv": "timestamp"}
        })
        fb_set(f"rooms/{self.room_id}/agentStatus", {
            "online": False,
            "ts": {".sv": "timestamp"}
        })


# ═══════════════════════════════════════════════════════════════
# CLI Entry Point
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Classroom Agent — 語音驅動 AI 課堂助教",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例：
  # 基本模式（回覆訊息 + QA + 困惑偵測 + 教學建議）
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY

  # 語音模式（加上語音換頁、語音建投票）
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY --voice

  # 指定語音伺服器位址
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY --voice --voice-host 192.168.1.100

  # 指定助教名稱
  python3 classroom_agent.py 20260401-ai100 --key YOUR_KEY --name "小助"
"""
    )
    parser.add_argument("room", help="教室代碼 (例如 20260401-ai100)")
    parser.add_argument("--key", help="Gemini API Key (或設 GEMINI_API_KEY 環境變數)")
    parser.add_argument("--name", default=AGENT_NAME, help="助教名稱 (預設: AI 助教)")
    parser.add_argument("--voice", action="store_true", help="啟用語音橋接 (jt-live-whisper)")
    parser.add_argument("--voice-host", default="127.0.0.1", help="語音伺服器 IP (預設: 127.0.0.1)")
    parser.add_argument("--voice-port", type=int, default=19780, help="語音伺服器 port (預設: 19780)")

    args = parser.parse_args()

    api_key = args.key or os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        print("請提供 Gemini API Key: --key YOUR_KEY 或設定 GEMINI_API_KEY 環境變數")
        sys.exit(1)

    agent = ClassroomAgent(
        room_id=args.room,
        api_key=api_key,
        agent_name=args.name,
        enable_voice=args.voice,
        voice_host=args.voice_host,
        voice_port=args.voice_port,
    )
    agent.run()


if __name__ == "__main__":
    main()
