#!/usr/bin/env python3
"""
Claude 風格 AI 助教 daemon — 每 5 秒自動監控 Firebase 教室並回覆

用法：
  python3 assistant.py 20260322-ai100
  python3 assistant.py 20260322-ai100 --key YOUR_GEMINI_KEY
  python3 assistant.py 20260322-ai100 --interval 3
"""
import json, urllib.request, urllib.error, time, sys, argparse, os
from datetime import datetime

# ─── Config ───
FIREBASE_DB = "https://ai-classroom-70a97-default-rtdb.firebaseio.com"
ASSISTANT_NAME = "Claude 助教"
MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"]  # pro first, fallback to flash

# ─── Firebase helpers ───
def fb_read(path):
    try:
        req = urllib.request.Request(f"{FIREBASE_DB}/{path}.json")
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  [!] Firebase read error: {e}")
        return None

def fb_write(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{FIREBASE_DB}/{path}.json", data=body, method='POST',
                                headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=8)

# ─── AI call ───
def call_ai(api_key, system_prompt, user_prompt):
    for model in MODELS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.9}
            }
            body = json.dumps(payload).encode()
            req = urllib.request.Request(url, data=body, method='POST',
                                        headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
            if "error" in data:
                code = data["error"].get("code", 0)
                if code == 429:
                    print(f"  [!] {model} rate limited, trying next...")
                    continue
                raise Exception(data["error"]["message"][:100])
            answer = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if answer:
                print(f"  [✓] {model} responded ({len(answer)} chars)")
                return answer
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  [!] {model} 429, trying next...")
                continue
            raise
    return None

# ─── Build context ───
def build_context(room_id):
    wall = fb_read(f"rooms/{room_id}/wall") or {}
    qa = fb_read(f"rooms/{room_id}/qa") or {}
    replies = fb_read(f"rooms/{room_id}/qaReplies") or {}
    presence = fb_read(f"rooms/{room_id}/presence") or {}
    config = fb_read(f"rooms/{room_id}/config") or {}

    student_count = len(presence)
    title = config.get("title", room_id)

    # Sort by timestamp, take last 100
    wall_msgs = sorted(wall.values(), key=lambda x: x.get("ts", 0))[-100:]
    qa_items = sorted(qa.values(), key=lambda x: x.get("ts", 0))[-50:]

    ctx = f"【教室】{title} | {student_count} 人在線\n\n"

    if wall_msgs:
        ctx += "【最近對話】\n"
        for m in wall_msgs:
            role = m.get("role", "student")
            icon = "👨‍🏫" if role == "teacher" else "🤖" if role == "ai" else ""
            ctx += f"{icon}{m.get('name','?')}：{m.get('text','')}\n"
        ctx += "\n"

    if qa_items:
        ctx += "【問答區】\n"
        for q in qa_items:
            ctx += f"[{q.get('ups',0)}票] {q.get('name','?')}：{q.get('text','')}\n"
            qid_replies = replies.get(q.get("id", ""), {})
            if isinstance(qid_replies, dict):
                for r in sorted(qid_replies.values(), key=lambda x: x.get("ts", 0)):
                    role_icon = "👨‍🏫" if r.get("role") == "teacher" else "🤖"
                    ctx += f"  → {role_icon}{r.get('name','?')}：{r.get('text','')}\n"

    return ctx, title

SYSTEM_PROMPT_TEMPLATE = """你是「{name}」，{teacher}老師的課堂 AI 助教。課程：{title}。

你的風格像一個超會教的學長姐 — 熱情、幽默、有料。你會用比喻、舉生活化的例子、甚至開個小玩笑讓課堂氣氛活潑。

回答時：
- 先肯定提問（「好問題！」「這個觀念很關鍵」）
- 用白話文解釋，像跟朋友聊天
- 舉具體例子或比喻（「就像你叫 Uber Eats...」）
- 如果老師剛講過相關的，引用老師的話補充
- 如果多人問類似問題，歸納一起答
- 回答完可以反問帶動互動（「大家覺得呢？」）

長度：200-500 字，講清楚講有趣，不要惜字如金。
只有純粹的「OK」「+1」「哈哈」才回 [SKIP]，其他都盡量回應。
用繁體中文。

以下是教室的對話紀錄：
{context}"""

# ─── Main loop ───
def main():
    parser = argparse.ArgumentParser(description="AI 助教 daemon")
    parser.add_argument("room", help="教室代碼 (例如 20260322-ai100)")
    parser.add_argument("--key", help="Gemini API Key (或設環境變數 GEMINI_API_KEY)")
    parser.add_argument("--interval", type=int, default=5, help="掃描間隔秒數 (預設 5)")
    parser.add_argument("--name", default=ASSISTANT_NAME, help="助教名稱")
    args = parser.parse_args()

    api_key = args.key or os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        print("請提供 Gemini API Key: --key YOUR_KEY 或設定 GEMINI_API_KEY 環境變數")
        sys.exit(1)

    room_id = args.room
    config = fb_read(f"rooms/{room_id}/config")
    if not config:
        print(f"找不到教室: {room_id}")
        sys.exit(1)

    teacher = config.get("hostName", "老師")
    title = config.get("title", room_id)

    # Mark existing messages as seen
    wall = fb_read(f"rooms/{room_id}/wall") or {}
    qa = fb_read(f"rooms/{room_id}/qa") or {}
    seen_wall = set(wall.keys())
    seen_qa = set(qa.keys())

    print(f"╔══════════════════════════════════════╗")
    print(f"║  {args.name} 已上線                  ║")
    print(f"║  教室: {room_id:<28s} ║")
    print(f"║  老師: {teacher:<28s} ║")
    print(f"║  掃描: 每 {args.interval} 秒                      ║")
    print(f"║  已有: {len(seen_wall)} 則訊息, {len(seen_qa)} 個問答      ║")
    print(f"╚══════════════════════════════════════╝")
    print()

    # Send greeting
    fb_write(f"rooms/{room_id}/wall", {
        "text": f"大家好！我是{args.name} 🙋‍♂️ 有問題隨時問我，我會盡力回答！",
        "name": args.name, "role": "ai",
        "ts": {".sv": "timestamp"}
    })
    print(f"[{now()}] 👋 已發送上線通知")

    while True:
        time.sleep(args.interval)

        try:
            # Check wall
            wall = fb_read(f"rooms/{room_id}/wall") or {}
            new_msgs = []
            for k, v in wall.items():
                if k not in seen_wall:
                    seen_wall.add(k)
                    if v.get("role") not in ("ai",):
                        new_msgs.append(v)

            # Check QA
            qa = fb_read(f"rooms/{room_id}/qa") or {}
            new_qs = []
            for k, v in qa.items():
                if k not in seen_qa:
                    seen_qa.add(k)
                    if v.get("role") not in ("ai",):
                        new_qs.append({"id": k, **v})

            if not new_msgs and not new_qs:
                continue

            # Log
            for m in new_msgs:
                role = "👨‍🏫" if m.get("role") == "teacher" else "💬"
                print(f"[{now()}] {role} {m.get('name','?')}: {m.get('text','')[:80]}")
            for q in new_qs:
                print(f"[{now()}] ❓ {q.get('name','?')}: {q.get('text','')[:80]}")

            # Build context and respond
            context, title = build_context(room_id)
            sys_prompt = SYSTEM_PROMPT_TEMPLATE.format(
                name=args.name, teacher=teacher, title=title, context=context
            )

            # Wall response
            if new_msgs:
                student_msgs = [m for m in new_msgs if m.get("role") != "teacher"]
                if student_msgs:
                    prompt = "以下是學員的新訊息，請回應：\n\n"
                    for m in student_msgs:
                        prompt += f"{m.get('name','?')}：{m.get('text','')}\n"

                    print(f"[{now()}] 🤖 思考中...")
                    answer = call_ai(api_key, sys_prompt, prompt)
                    if answer and "[SKIP]" not in answer:
                        fb_write(f"rooms/{room_id}/wall", {
                            "text": answer.strip(),
                            "name": args.name, "role": "ai",
                            "ts": {".sv": "timestamp"}
                        })
                        print(f"[{now()}] ✅ 已回覆訊息牆 ({len(answer)} 字)")
                    elif answer and "[SKIP]" in answer:
                        print(f"[{now()}] ⏭️ 跳過（閒聊）")

            # QA responses
            for q in new_qs:
                prompt = f"學員 {q.get('name','?')} 提問：{q.get('text','')}\n\n請回答。"
                print(f"[{now()}] 🤖 回答問題中...")
                answer = call_ai(api_key, sys_prompt, prompt)
                if answer and "[SKIP]" not in answer:
                    fb_write(f"rooms/{room_id}/qaReplies/{q['id']}", {
                        "text": answer.strip(),
                        "name": args.name, "role": "ai",
                        "ts": {".sv": "timestamp"}
                    })
                    print(f"[{now()}] ✅ 已回覆問答 ({len(answer)} 字)")

        except KeyboardInterrupt:
            print(f"\n[{now()}] 👋 {args.name}下線了")
            fb_write(f"rooms/{room_id}/wall", {
                "text": f"{args.name}下線了，大家下次見！👋",
                "name": args.name, "role": "ai",
                "ts": {".sv": "timestamp"}
            })
            break
        except Exception as e:
            print(f"[{now()}] ❌ Error: {e}")
            time.sleep(5)

def now():
    return datetime.now().strftime("%H:%M:%S")

if __name__ == "__main__":
    main()
