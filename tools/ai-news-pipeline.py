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

# Telegram 通知
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_CHAT_ID = int(os.environ.get("TG_CHAT_ID", "8550440980"))
SITE_URL = "https://ai-cooperation.github.io/ai100"

# 專案路徑 (需要 git clone 的 ai100 repo)
REPO_DIR = os.environ.get("AI100_REPO", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSTS_DIR = os.path.join(REPO_DIR, "_posts")
NEWS_IMG_DIR = os.path.join(REPO_DIR, "assets", "images", "news")

# 已處理文章的記錄檔 (放在 repo 外面，避免 commit)
STATE_FILE = os.environ.get("NEWS_STATE_FILE",
    os.path.join(os.path.expanduser("~"), ".ai100-news-state.json"))

# 每次最多處理幾篇
MAX_ARTICLES_PER_RUN = 3

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
    {
        "name": "Anthropic News",
        "url": "https://www.anthropic.com/rss.xml",
        "lang": "en",
        "tier": 3,
    },
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
)
log = logging.getLogger("ai-news")


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

    # 按 tier 排序 (tier 1 優先)，然後去重
    articles.sort(key=lambda a: a["tier"])
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

文章標題: {article['title']}
來源: {article['source_name']}
原始摘要: {article['summary']}
完整內容（節錄）: {content[:1500]}

請以 JSON 格式回覆（不要加 markdown code block）:
{{
  "title_zh": "中文標題（15-25字，吸引人）",
  "summary": "一段話摘要（50-80字，白話說明這則新聞的重點）",
  "body": "正文（200-400字，用白話解說這個技術/產品/事件的重點、為什麼重要、對一般人的影響。分2-3段。）",
  "tags": ["標籤1", "標籤2", "標籤3"],
  "related_modules": ["M05", "M07"],
  "related_lecture_ids": ["M05.03", "M07.02"],
  "image_prompt": "English description for image generation (professional tech illustration style, 50 words max)",
  "relevance_score": 8
}}

講座模組對照:
{topics_desc}

注意:
- related_modules: 選 1-3 個最相關的模組
- related_lecture_ids: 選 1-3 個最精確對應的講座 ID（格式如 M05.03）
- relevance_score: 1-10，這則新聞與 AI 學習的相關程度
- 只回 JSON，不要加任何其他文字
"""

    try:
        resp = httpx.post(
            f"{AI_HUB_BASE}/api/llm/chat",
            json={"prompt": prompt, "provider": "auto"},
            timeout=120,
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
    """使用 Pro model 生成專業 AI 新聞配圖，含繁體中文標題。"""
    full_prompt = (
        f"Design a professional AI technology news card image in square format. "
        f"Title text: \u300c{title_zh}\u300d displayed prominently in bold white Traditional Chinese (繁體中文) "
        f"centered on a semi-transparent dark overlay band at the top. "
        f"Background scene: {prompt}. "
        f"Style: futuristic tech editorial with cinematic lighting, neon-blue and cyan accents, "
        f"circuit board patterns, data visualization elements. Use a dark navy gradient "
        f"(#0a1628 to #1a2840) as the overlay tone. "
        f"The title must be the visual focal point — large, sharp, and fully legible. "
        f"No watermarks, no logos, no extra decorative text."
    )

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            resp = httpx.post(
                f"{AI_HUB_BASE}/api/image/generate",
                json={"prompt": full_prompt, "timeout": 180, "model": "pro"},
                timeout=200,
            )
            # 503: distinguish quota exhaustion vs transient errors
            if resp.status_code == 503:
                detail = resp.json().get("detail", "")
                # Real quota exhaustion — stop retries
                if "quota" in detail.lower() and "exhausted" in detail.lower():
                    log.warning(f"Pro quota exhausted: {detail}")
                    return False
                # Transient error (timeout, tab crash) — let retry loop handle it
                log.warning(f"圖片生成暫時失敗 (attempt {attempt}/{max_attempts}): {detail}")
                if attempt < max_attempts:
                    time.sleep(30)
                continue
            data = resp.json()
            if data.get("success") and data.get("image_base64"):
                img_data = base64.b64decode(data["image_base64"])

                os.makedirs(NEWS_IMG_DIR, exist_ok=True)
                img_path = os.path.join(NEWS_IMG_DIR, filename)
                with open(img_path, "wb") as f:
                    f.write(img_data)
                log.info(f"圖片生成成功: {filename} ({len(img_data)} bytes, Pro)")
                return True
            else:
                log.warning(f"圖片生成失敗 (attempt {attempt}/{max_attempts}): {data.get('detail', data.get('message', ''))}")
        except Exception as e:
            log.warning(f"圖片生成異常 (attempt {attempt}/{max_attempts}): {e}")
        if attempt < max_attempts:
            time.sleep(30)
    log.error(f"圖片生成最終失敗: {filename} (已嘗試 {max_attempts} 次)")
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

def git_commit_and_push(files: list[str]):
    """Git commit 並 push 到 GitHub。"""
    try:
        os.chdir(REPO_DIR)
        subprocess.run(["git", "add"] + files, check=True, capture_output=True)
        today = datetime.date.today().isoformat()
        msg = f"news: AI 動態更新 {today}\n\nCo-Authored-By: AI News Pipeline <noreply@ai100.dev>"
        subprocess.run(["git", "commit", "-m", msg], check=True, capture_output=True)
        subprocess.run(["git", "push"], check=True, capture_output=True)
        log.info("Git push 完成")
    except subprocess.CalledProcessError as e:
        log.warning(f"Git 操作失敗: {e}")


# ============================================================
# TG 通知
# ============================================================

def send_tg(message: str):
    """發送 Telegram 通知。"""
    if not TG_BOT_TOKEN:
        log.warning("TG_BOT_TOKEN 未設定，跳過通知")
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TG_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": False,
            },
            timeout=10,
        )
        log.info("TG 通知已發送")
    except Exception as e:
        log.warning(f"TG 發送失敗: {e}")


# ============================================================
# 主流程
# ============================================================


# ============================================================
# Warmup
# ============================================================

def warmup_ai_hub() -> bool:
    """Pipeline 啟動前 warmup: 用 fast image generate 暖 Chrome/Gemini。"""
    log.info("Warmup: 暖機 Chrome/Gemini (fast image)...")
    try:
        resp = httpx.post(
            f"{AI_HUB_BASE}/api/image/generate",
            json={
                "prompt": "A simple blue gradient background with subtle grid lines",
                "model": "fast",
                "timeout": 90,
            },
            timeout=120,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                log.info(f"Warmup: OK ({data.get('generation_time', 0):.1f}s)")
                return True
            log.warning(f"Warmup: 生成失敗: {data.get('message', '')}")
        else:
            log.warning(f"Warmup: HTTP {resp.status_code}")
        return False
    except Exception as e:
        log.warning(f"Warmup: 失敗: {e}")
        return False


def run_pipeline(dry_run: bool = False, no_image: bool = False, no_push: bool = False):
    """執行完整 pipeline。"""
    log.info("=" * 50)
    log.info("AI 100 講 — 新聞 Pipeline 開始")
    log.info("=" * 50)

    # 0. Warmup AI Hub
    if not dry_run:
        if not warmup_ai_hub():
            log.warning("Warmup 失敗，但仍繼續執行 pipeline")

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
    created_posts = []
    image_failures = []

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
        created_posts.append(analysis)
        if not has_image and not no_image:
            image_failures.append(analysis.get("title_zh", article["title"]))

        # 4e. 標記已處理
        state["processed"].append(article["id"])
        save_state(state)

        # 禮貌等待
        time.sleep(2)

    # 5. 儲存狀態
    save_state(state)

    # 6. Git commit & push
    if created_files and not dry_run and not no_push:
        git_commit_and_push(created_files)

    # 7. TG 通知
    if created_posts and not dry_run:
        today = datetime.date.today().strftime("%Y-%m-%d")
        news_url = f"{SITE_URL}/news/"

        lines = [f"<b>🤖 AI 動態 {today}</b>\n"]
        for p in created_posts:
            title = p.get("title_zh", "")
            summary = p.get("summary", "")
            tags = " ".join(f"#{t}" for t in p.get("tags", [])[:3])
            lines.append(f"• <b>{title}</b>\n  {summary}\n  {tags}\n")

        if image_failures:
            lines.append(f"⚠️ {len(image_failures)} 篇圖片生成失敗")

        lines.append(f'🔗 <a href="{news_url}">查看完整報導</a>')
        send_tg("\n".join(lines))

    log.info(f"\n完成！產出 {len(created_files)} 個檔案")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI 100 講新聞 Pipeline")
    parser.add_argument("--dry-run", action="store_true", help="只抓取不處理")
    parser.add_argument("--no-image", action="store_true", help="跳過圖片生成")
    parser.add_argument("--no-push", action="store_true", help="不 git push")
    parser.add_argument("--max", type=int, default=MAX_ARTICLES_PER_RUN, help="每次最多處理幾篇")
    args = parser.parse_args()

    MAX_ARTICLES_PER_RUN = args.max
    run_pipeline(dry_run=args.dry_run, no_image=args.no_image, no_push=args.no_push)
