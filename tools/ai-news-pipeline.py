#!/usr/bin/env python3
"""AI 100 講 — 自動 AI 動態新聞 Pipeline

從 RSS 來源抓取最新 AI 新聞，使用 LLM 分析內容，
生成圖片，產出 Jekyll _posts 文章並反向連結到相關講座。

部署: ac-mac 上 cron 每日執行
依賴: feedparser, httpx (pip3 install feedparser httpx)
"""

import argparse
import base64
import datetime
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

try:
    import feedparser
except ImportError:
    print("請安裝 feedparser: pip3 install feedparser")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("請安裝 httpx: pip3 install httpx")
    sys.exit(1)

# ============================================================
# 設定
# ============================================================

# AI Hub API (ac-mac)
AI_HUB_BASE = os.environ.get("AI_HUB_URL", "http://127.0.0.1:8760")

# 專案路徑 (需要 git clone 的 ai100 repo)
REPO_DIR = os.environ.get("AI100_REPO", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSTS_DIR = os.path.join(REPO_DIR, "_posts")
NEWS_IMG_DIR = os.path.join(REPO_DIR, "assets", "images", "news")

# 已處理文章的記錄檔 (放在 repo 外面，避免 commit)
STATE_FILE = os.environ.get("NEWS_STATE_FILE",
    os.path.join(os.path.expanduser("~"), ".ai100-news-state.json"))

# 每次最多處理幾篇
MAX_ARTICLES_PER_RUN = 3

# Telegram 通知
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID", "")

# Log 路徑 (持久化，不放 /tmp)
LOG_DIR = Path("/var/log/ai-hub")
LOG_DIR.mkdir(parents=True, exist_ok=True)

# RSS 來源 (經過驗證的高命中率來源)
RSS_SOURCES = [
    # Tier 1: 高命中率 AI 專業來源
    {
        "name": "The Decoder",
        "url": "https://the-decoder.com/feed/",
        "lang": "en",
        "tier": 1,
    },
    {
        "name": "Simon Willison",
        "url": "https://simonwillison.net/atom/everything/",
        "lang": "en",
        "tier": 1,
        "filter_keywords": ["AI", "LLM", "GPT", "Claude", "Gemini", "Anthropic", "OpenAI",
                            "machine learning", "deep learning", "neural", "transformer",
                            "language model", "embedding", "RAG", "agent", "fine-tuning"],
    },
    {
        "name": "Ars Technica AI",
        "url": "https://feeds.arstechnica.com/arstechnica/technology-lab",
        "lang": "en",
        "tier": 1,
        "filter_keywords": ["AI", "GPT", "LLM", "Claude", "Gemini", "machine learning",
                            "deep learning", "neural", "OpenAI", "Anthropic", "Google AI"],
    },
    # Tier 1: 台灣來源
    {
        "name": "電腦王阿達",
        "url": "https://www.kocpc.com.tw/feed",
        "lang": "zh",
        "tier": 1,
        "filter_keywords": ["AI", "GPT", "LLM", "Claude", "Gemini", "機器學習",
                            "深度學習", "生成式", "ChatGPT", "人工智慧", "Copilot"],
    },
    {
        "name": "硬是要學",
        "url": "https://www.soft4fun.net/feed",
        "lang": "zh",
        "tier": 1,
        "filter_keywords": ["AI", "GPT", "LLM", "Claude", "Gemini", "機器學習",
                            "深度學習", "生成式", "ChatGPT", "人工智慧", "Copilot"],
    },
    # Tier 3: 官方部落格
    {
        "name": "Google AI Blog",
        "url": "https://blog.google/technology/ai/rss/",
        "lang": "en",
        "tier": 3,
    },
    {
        "name": "OpenAI Blog",
        "url": "https://openai.com/blog/rss.xml",
        "lang": "en",
        "tier": 3,
    },
    # Anthropic: no public RSS feed available
]

# 講座主題對應表 (用於 LLM 反向連結)
LECTURE_TOPICS = {
    "M01": "AI 思維與治理 (定義、能力邊界、倫理、法規、人機協作)",
    "M02": "資料素養 (資料型態、品質、清理、隱私、GDPR)",
    "M03": "機器學習 (監督式、非監督式、模型評估、過擬合)",
    "M04": "深度學習 (CNN、RNN、Transformer、預訓練、微調)",
    "M05": "生成式 AI (LLM、Prompt Engineering、RAG、工具呼叫)",
    "M06": "No/Low Code 與應用規劃 (自動化、企業導入、評估)",
    "M07": "NLP / CV / 多模態 (文本分析、影像辨識、語音、多模態)",
    "M08": "大數據 (統計、數據工程、視覺化、ETL)",
    "M09": "MLOps (版本管理、部署、監控、CI/CD、成本控制)",
    "M10": "iPAS 考試策略 (題型分析、實戰練習)",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "ai100-news.log"),
    ],
)
log = logging.getLogger("ai-news")


# ============================================================
# Telegram 通知
# ============================================================

def tg_send(message: str):
    """發送 Telegram 通知。"""
    try:
        data = json.dumps({
            "chat_id": TG_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning(f"Telegram 通知失敗: {e}")


# ============================================================
# 狀態管理
# ============================================================

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"processed": []}


def save_state(state: dict):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def article_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


# ============================================================
# RSS 抓取
# ============================================================

def fetch_rss_articles() -> list[dict]:
    """從所有 RSS 來源抓取最新文章。"""
    articles = []
    client = httpx.Client(timeout=15, follow_redirects=True)

    for source in RSS_SOURCES:
        try:
            log.info(f"抓取 RSS: {source['name']}")
            resp = client.get(source["url"], headers={
                "User-Agent": "AI100-News-Bot/1.0"
            })
            feed = feedparser.parse(resp.text)

            for entry in feed.entries[:10]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                summary = entry.get("summary", "").strip()
                published = entry.get("published", "")

                if not title or not link:
                    continue

                # 台灣來源: 用關鍵字過濾 AI 相關文章
                if "filter_keywords" in source:
                    text = f"{title} {summary}".lower()
                    if not any(kw.lower() in text for kw in source["filter_keywords"]):
                        continue

                # 清理 summary (去除 HTML)
                summary = re.sub(r"<[^>]+>", "", summary)
                summary = summary[:300]

                articles.append({
                    "title": title,
                    "link": link,
                    "summary": summary,
                    "published": published,
                    "source_name": source["name"],
                    "lang": source["lang"],
                    "tier": source["tier"],
                    "id": article_id(link),
                })
        except Exception as e:
            log.warning(f"RSS 抓取失敗 ({source['name']}): {e}")

    client.close()

    # 按發布時間排序（最新優先），同時間則 tier 低的優先
    from email.utils import parsedate_to_datetime
    import datetime

    def parse_pub_time(a):
        pub = a.get("published", "")
        if not pub:
            return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
        # RFC 2822 (most RSS feeds)
        try:
            return parsedate_to_datetime(pub)
        except Exception:
            pass
        # ISO 8601 (Atom feeds like Simon Willison)
        try:
            return datetime.datetime.fromisoformat(pub)
        except Exception:
            pass
        return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)

    articles.sort(key=lambda a: (parse_pub_time(a),), reverse=True)
    return articles


# ============================================================
# 網頁內容抓取
# ============================================================

def fetch_article_content(url: str) -> str:
    """使用 AI Hub 的 web_fetch 抓取文章完整內容。"""
    try:
        resp = httpx.post(
            f"{AI_HUB_BASE}/api/web/fetch",
            json={"url": url, "level": "http"},
            timeout=30,
        )
        data = resp.json()
        if data.get("success"):
            content = data.get("content", "") or data.get("message", "")
            # 截取前 2000 字供 LLM 分析
            return content[:2000]
    except Exception as e:
        log.warning(f"網頁抓取失敗 ({url}): {e}")
    return ""


# ============================================================
# LLM 分析
# ============================================================

def analyze_article(article: dict, content: str) -> dict | None:
    """使用 LLM 分析文章，產出摘要與講座對應。"""
    topics_desc = "\n".join(f"  {k}: {v}" for k, v in LECTURE_TOPICS.items())

    prompt = f"""你是 AI 100 講的新聞編輯。請分析以下 AI 相關文章，產出結構化的中文新聞摘要。

重要：請先用你的搜尋能力驗證這則新聞的真實性與正確性。如果發現資訊有誤、過時、或無法驗證，請在摘要中如實說明。

文章標題: {article['title']}
來源: {article['source_name']}
原始摘要: {article['summary']}
完整內容（節錄）: {content[:1500]}

請以 JSON 格式回覆（不要加 markdown code block）:
{{
  "title_zh": "中文標題（15-25字，吸引人）",
  "summary": "一段話摘要（50-80字，白話說明這則新聞的重點）",
  "body": "正文（200-400字，用白話解說這個技術/產品/事件的重點、為什麼重要、對一般人的影響。分2-3段。如果經查證發現有不準確之處，請在文末補充說明。）",
  "tags": ["標籤1", "標籤2", "標籤3"],
  "related_modules": ["M05", "M07"],
  "related_lecture_ids": ["M05.03", "M07.02"],
  "image_prompt": "圖片視覺描述（科技風格、概念示意，30字內，只描述視覺元素不含文字指令）",
  "relevance_score": 8,
  "verified": true或false（你是否能透過搜尋驗證此新聞的核心事實）
}}

講座模組對照:
{topics_desc}

注意:
- related_modules: 選 1-3 個最相關的模組
- related_lecture_ids: 選 1-3 個最精確對應的講座 ID（格式如 M05.03）
- relevance_score: 1-10，這則新聞與 AI 學習的相關程度
- verified: 透過搜尋驗證後，核心事實是否正確
- 只回 JSON，不要加任何其他文字
"""

    try:
        resp = httpx.post(
            f"{AI_HUB_BASE}/api/llm/chat",
            json={"prompt": prompt, "provider": "gemini"},
            timeout=180,
        )
        data = resp.json()
        if data.get("success"):
            text = data.get("content", "") or data.get("message", "")
            # 清理可能的 markdown code block
            text = re.sub(r"^```json?\s*", "", text.strip())
            text = re.sub(r"\s*```$", "", text.strip())
            result = json.loads(text)
            return result
    except json.JSONDecodeError as e:
        log.warning(f"LLM 回覆 JSON 解析失敗: {e}")
    except Exception as e:
        log.warning(f"LLM 分析失敗: {e}")
    return None


# ============================================================
# 圖片生成
# ============================================================

def generate_image(prompt: str, title_zh: str, filename: str) -> bool:
    """使用 AI Hub 生成新聞配圖，失敗重試最多 3 次。"""
    full_prompt = (
        f"生成一張科技新聞配圖。深藍色背景，發光的青色點綴。"
        f"圖片上方必須顯示繁體中文標題「{title_zh}」，文字清晰、字體現代。"
        f"圖片風格：{prompt}"
    )

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            resp = httpx.post(
                f"{AI_HUB_BASE}/api/image/generate",
                json={"prompt": full_prompt, "timeout": 90, "queue_timeout": 120},
                timeout=240,
            )
            data = resp.json()
            if data.get("success") and data.get("image_base64"):
                img_data = base64.b64decode(data["image_base64"])
                os.makedirs(NEWS_IMG_DIR, exist_ok=True)
                img_path = os.path.join(NEWS_IMG_DIR, filename)
                with open(img_path, "wb") as f:
                    f.write(img_data)
                log.info(f"圖片生成成功: {filename} ({len(img_data)} bytes)")
                return True
            else:
                log.warning(f"圖片生成失敗 (attempt {attempt}/{max_attempts}): {data.get('detail', data.get('message', ''))}")
        except Exception as e:
            log.warning(f"圖片生成異常 (attempt {attempt}/{max_attempts}): {e}")
        if attempt < max_attempts:
            time.sleep(30)
    return False


# ============================================================
# Jekyll Post 產出
# ============================================================

def create_post(article: dict, analysis: dict, has_image: bool) -> str:
    """產出 Jekyll _posts markdown 文件。"""
    today = datetime.date.today()
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", analysis["title_zh"])
    slug = slug.strip("-")[:50]
    filename = f"{today.isoformat()}-{article['id']}.md"
    img_filename = f"{today.isoformat()}-{article['id']}.png"

    # Build related_lectures YAML list
    related = analysis.get("related_lecture_ids", [])
    related_yaml = ""
    if related:
        related_yaml = "related_lectures:\n"
        for lid in related:
            related_yaml += f'  - "{lid}"\n'

    tags = analysis.get("tags", [])
    tags_yaml = "[" + ", ".join(f'"{t}"' for t in tags) + "]"

    post_content = f"""---
title: "{analysis['title_zh']}"
date: {today.isoformat()}
source: "{article['source_name']}"
source_url: "{article['link']}"
summary: "{analysis['summary']}"
tags: {tags_yaml}
{related_yaml}{"image: " + img_filename if has_image else ""}
---

{analysis['body']}
"""

    os.makedirs(POSTS_DIR, exist_ok=True)
    post_path = os.path.join(POSTS_DIR, filename)
    with open(post_path, "w", encoding="utf-8") as f:
        f.write(post_content)

    log.info(f"文章產出: {filename}")
    return filename


# ============================================================
# Git 操作
# ============================================================

def git_commit_and_push(files: list[str]) -> bool:
    """Git commit 並 push 到 GitHub，失敗時重試並通知。"""
    try:
        os.chdir(REPO_DIR)
        subprocess.run(["git", "add"] + files, check=True, capture_output=True)
        today = datetime.date.today().isoformat()
        msg = f"news: AI 動態更新 {today}\n\nCo-Authored-By: AI News Pipeline <noreply@ai100.dev>"
        subprocess.run(["git", "commit", "-m", msg], check=True, capture_output=True)

        # Push with retry (max 2 attempts)
        for attempt in range(1, 3):
            try:
                subprocess.run(
                    ["git", "push"], check=True, capture_output=True, text=True, timeout=120,
                )
                log.info("Git push 完成")
                return True
            except subprocess.CalledProcessError as e:
                log.error(f"Git push 失敗 (attempt {attempt}/2): {e.stderr or e}")
                if attempt < 2:
                    time.sleep(5)
            except subprocess.TimeoutExpired:
                log.error(f"Git push 超時 (attempt {attempt}/2)")
                if attempt < 2:
                    time.sleep(5)

        # All retries failed
        tg_send(
            "<b>⚠️ AI 100 講新聞 Pipeline</b>\n\n"
            "Git push 失敗（已重試 2 次）\n"
            "本地有 unpushed commits\n"
            "📂 ~/ai100\n"
            "🔧 手動: <code>cd ~/ai100 &amp;&amp; git push</code>"
        )
        return False

    except subprocess.CalledProcessError as e:
        log.error(f"Git 操作失敗: {e}")
        tg_send(f"<b>⚠️ AI 100 講新聞 Pipeline</b>\n\nGit 操作失敗: {e}")
        return False


# ============================================================
# 主流程
# ============================================================

def run_pipeline(dry_run: bool = False, no_image: bool = False, no_push: bool = False):
    """執行完整 pipeline。"""
    log.info("=" * 50)
    log.info("AI 100 講 — 新聞 Pipeline 開始")
    log.info("=" * 50)

    # 1. 載入狀態
    state = load_state()
    processed_ids = set(state.get("processed", []))
    log.info(f"已處理文章數: {len(processed_ids)}")

    # 2. 抓取 RSS
    articles = fetch_rss_articles()
    log.info(f"RSS 抓取到 {len(articles)} 篇文章")

    # 3. 過濾已處理的
    new_articles = [a for a in articles if a["id"] not in processed_ids]
    log.info(f"新文章: {len(new_articles)} 篇")

    if not new_articles:
        log.info("沒有新文章，結束")
        return

    # 4. 限制每次處理數量
    batch = new_articles[:MAX_ARTICLES_PER_RUN]
    created_files = []

    for i, article in enumerate(batch, 1):
        log.info(f"\n--- [{i}/{len(batch)}] {article['title'][:60]} ---")
        log.info(f"  來源: {article['source_name']} | 連結: {article['link']}")

        if dry_run:
            log.info("  [DRY RUN] 跳過處理")
            state["processed"].append(article["id"])
            continue

        # 4a. 抓取完整內容
        content = fetch_article_content(article["link"])
        log.info(f"  內容長度: {len(content)} 字")

        # 4b. LLM 分析
        analysis = analyze_article(article, content)
        if not analysis:
            log.warning("  LLM 分析失敗，跳過")
            continue

        score = analysis.get("relevance_score", 0)
        if score < 5:
            log.info(f"  相關度太低 ({score}/10)，跳過")
            state["processed"].append(article["id"])
            continue

        log.info(f"  標題: {analysis['title_zh']}")
        log.info(f"  相關度: {score}/10")
        log.info(f"  相關講座: {analysis.get('related_lecture_ids', [])}")
        verified = analysis.get("verified", False)
        if not verified:
            log.warning(f"  ⚠️ 未驗證: {analysis['title_zh']} (verified=false，需人工審核)")
        article["_title_zh"] = analysis["title_zh"]
        article["_verified"] = verified

        # 4c. 生成圖片
        has_image = False
        img_filename = f"{datetime.date.today().isoformat()}-{article['id']}.png"
        if not no_image and analysis.get("image_prompt"):
            has_image = generate_image(analysis["image_prompt"], analysis["title_zh"], img_filename)
            if has_image:
                created_files.append(os.path.join("assets", "images", "news", img_filename))

        # 4d. 產出 Jekyll post
        post_filename = create_post(article, analysis, has_image)
        created_files.append(os.path.join("_posts", post_filename))

        # 4e. 標記已處理
        state["processed"].append(article["id"])
        save_state(state)

        # 禮貌等待
        time.sleep(2)

    # 5. 儲存狀態
    save_state(state)

    # 6. Git commit & push
    push_ok = True
    if created_files and not dry_run and not no_push:
        push_ok = git_commit_and_push(created_files)

    log.info(f"\n完成！產出 {len(created_files)} 個檔案")

    # 7. 回報結果 (只在有產出時通知)
    if created_files and not dry_run:
        titles = []
        unverified = []
        for a in batch[:len(created_files)]:
            t = a.get("_title_zh", a["title"][:30])
            if not a.get("_verified", True):
                titles.append(f"• ⚠️ {t}")
                unverified.append(t)
            else:
                titles.append(f"• ✅ {t}")
        status = "✅ 已部署" if push_ok else "⚠️ commit 成功但 push 失敗"
        tg_send(
            f"<b>📰 AI 100 講動態更新</b>\n\n"
            f"產出 {len(created_files)} 篇\n"
            + "\n".join(titles) + "\n\n"
            f"{status}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI 100 講新聞 Pipeline")
    parser.add_argument("--dry-run", action="store_true", help="只抓取不處理")
    parser.add_argument("--no-image", action="store_true", help="跳過圖片生成")
    parser.add_argument("--no-push", action="store_true", help="不 git push")
    parser.add_argument("--max", type=int, default=MAX_ARTICLES_PER_RUN, help="每次最多處理幾篇")
    args = parser.parse_args()

    MAX_ARTICLES_PER_RUN = args.max
    run_pipeline(dry_run=args.dry_run, no_image=args.no_image, no_push=args.no_push)
